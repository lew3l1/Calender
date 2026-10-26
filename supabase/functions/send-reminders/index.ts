import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("authorization") ?? "";
  if (!serviceRoleKey || authorization !== "Bearer " + serviceRoleKey) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!supabaseUrl || !vapidPublicKey || !vapidPrivateKey) {
    console.error("Missing required push configuration.");
    return json({ error: "Push service is not configured" }, 500);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const now = new Date();
    const nowIso = now.toISOString();
    const oldestAccepted = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    // A short processing window avoids sending reminders for events created long after their start.
    const { data: dueEvents, error: dueError } = await db
      .from("events")
      .select("id,user_id,title,description,start_at,reminder_at")
      .not("reminder_at", "is", null)
      .gte("reminder_at", oldestAccepted)
      .lte("reminder_at", nowIso)
      .is("reminder_sent_at", null)
      .limit(100);

    if (dueError) throw dueError;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const event of dueEvents ?? []) {
      // Claim atomically before sending so overlapping cron invocations do not duplicate pushes.
      const { data: claimed, error: claimError } = await db
        .from("events")
        .update({ reminder_sent_at: nowIso })
        .eq("id", event.id)
        .is("reminder_sent_at", null)
        .select("id")
        .maybeSingle();

      if (claimError) {
        console.error("Could not claim reminder:", event.id, claimError.message);
        failed += 1;
        continue;
      }
      if (!claimed) {
        skipped += 1;
        continue;
      }

      const { data: subscriptions, error: subscriptionError } = await db
        .from("push_subscriptions")
        .select("endpoint,subscription")
        .eq("user_id", event.user_id);

      if (subscriptionError) {
        console.error("Could not load push subscriptions:", subscriptionError.message);
        failed += 1;
        continue;
      }

      const start = new Date(event.start_at);
      const body = {
        title: "Скоро: " + event.title,
        body: start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) +
          (event.description ? " · " + String(event.description).slice(0, 110) : ""),
        url: "./",
        tag: "calender-event-" + event.id,
      };

      for (const subscription of subscriptions ?? []) {
        try {
          await webpush.sendNotification(subscription.subscription, JSON.stringify(body), {
            TTL: 60 * 60,
            urgency: "normal",
          });
          sent += 1;
        } catch (pushError) {
          const statusCode = (pushError as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await db.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
          } else {
            console.error("Push send failed:", statusCode ?? "unknown status");
          }
          failed += 1;
        }
      }
    }

    return json({ ok: true, eventsChecked: dueEvents?.length ?? 0, pushesSent: sent, failed, skipped });
  } catch (error) {
    console.error("send-reminders failed:", error);
    return json({ error: "Reminder dispatch failed" }, 500);
  }
});