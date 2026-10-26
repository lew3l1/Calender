import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigured = Boolean(
  url && anonKey && !url.includes("YOUR_PROJECT") && !anonKey.includes("YOUR_")
);

export const supabase = supabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: { headers: { "X-Client-Info": "calender-web/0.1" } },
    })
  : null;

export const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || "";