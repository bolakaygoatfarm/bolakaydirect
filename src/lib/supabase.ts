import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Серверный клиент без сессии — только публичные данные (каталог, точки). */
export function publicClient(): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

let browser: SupabaseClient | null = null;
/** Браузерный клиент: покупательские RPC и вход сотрудников (сессия в localStorage). */
export function browserClient(): SupabaseClient {
  if (!browser) {
    browser = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "bolakay-staff-auth" },
    });
  }
  return browser;
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
