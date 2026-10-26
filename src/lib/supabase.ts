import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigured = Boolean(
  url && publishableKey && !url.includes("YOUR_PROJECT") && !publishableKey.includes("YOUR_")
);

export const supabase = supabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: { headers: { "X-Client-Info": "calender-web/0.1" } },
    })
  : null;

export const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || "";