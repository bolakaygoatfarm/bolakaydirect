// BOLAKAY DIRECT · онлайн-оплата Payme и Click (Supabase Edge Function). Логика — в handlers.ts.
// Секреты: PAYME_MERCHANT_ID, PAYME_KEY, PAYME_TEST_KEY, PAYME_TEST_MODE, CLICK_SERVICE_ID, CLICK_MERCHANT_ID, CLICK_SECRET_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handlers.ts";

const SB_KEY = (() => {
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default as string | undefined;
  } catch {
    return undefined;
  }
})() ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(Deno.env.get("SUPABASE_URL")!, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(createHandler({
  rpc: (name, args) => db.rpc(name, args) as never,
  env: (key) => Deno.env.get(key),
  fetch,
  isAdmin: async (jwt) => {
    const { data: u } = await db.auth.getUser(jwt);
    if (!u?.user) return false;
    const { data: staff } = await db.from("staff").select("role,is_active").eq("user_id", u.user.id).maybeSingle();
    return !!staff && staff.role === "admin" && staff.is_active;
  },
}));
