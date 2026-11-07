// BOLAKAY DIRECT · письмо с кодом из 6 цифр для входа сотрудника (Supabase Edge Function).
//
//  POST /staff-code   — отправить код на почту вошедшего сотрудника (JWT его сессии)
//
// Секреты: BREVO_API_KEY и BREVO_SENDER_EMAIL (адрес, подтверждённый в Brevo).
// Код создаёт и проверяет база (staff_code_issue, staff_code_verify), здесь только доставка.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_KEY = (() => {
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default as string | undefined;
  } catch {
    return undefined;
  }
})() ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const TEXT = {
  ru: { subject: "Код для входа в BOLAKAY", line: "Ваш код для входа в панель BOLAKAY:", ttl: "Код действует 10 минут.", warn: "Если это были не вы, кто-то знает ваш пароль: смените его." },
  uz: { subject: "BOLAKAY’ga kirish kodi", line: "BOLAKAY paneliga kirish kodingiz:", ttl: "Kod 10 daqiqa amal qiladi.", warn: "Agar bu siz bo‘lmasangiz, parolingizni kimdir biladi: uni almashtiring." },
  en: { subject: "Your BOLAKAY sign-in code", line: "Your code to sign in to the BOLAKAY panel:", ttl: "The code is valid for 10 minutes.", warn: "If this wasn’t you, someone knows your password: change it." },
};

function sessionId(jwt: string): string | null {
  // Подпись токена проверил getUser
  try {
    return JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).session_id ?? null;
  } catch {
    return null;
  }
}

async function sendMail(key: string, sender: string, to: string, code: string, lang: keyof typeof TEXT) {
  const t = TEXT[lang];
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "BOLAKAY", email: sender },
      to: [{ email: to }],
      subject: t.subject,
      textContent: `${t.line} ${code}\n\n${t.ttl}\n${t.warn}`,
      htmlContent: `<p>${t.line}</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p><p>${t.ttl}</p><p style="color:#667">${t.warn}</p>`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) console.error("brevo failed", r.status, (await r.text()).slice(0, 300));
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);
  try {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(jwt);
    const session = sessionId(jwt);
    if (!u?.user?.email || !session) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
    const { data: staff } = await db.from("staff").select("is_active").eq("user_id", u.user.id).maybeSingle();
    if (!staff?.is_active) return json({ ok: false, error: "FORBIDDEN" }, 403);

    const key = Deno.env.get("BREVO_API_KEY") ?? "";
    const sender = Deno.env.get("BREVO_SENDER_EMAIL") ?? "";
    if (!key || !sender) {
      // Почта ещё не настроена. Пока код не обязателен, панель открывается по паролю, иначе вход закрыт
      const { data: st } = await db.from("settings").select("staff_mfa_required").eq("id", 1).single();
      return json(st?.staff_mfa_required ? { ok: false, error: "EMAIL_NOT_CONFIGURED" } : { ok: true, skip: true });
    }

    const body = await req.json().catch(() => ({}));
    const lang = body.lang === "uz" || body.lang === "en" ? body.lang : "ru";
    const { data, error } = await db.rpc("staff_code_issue", { p_session: session, p_user: u.user.id });
    if (error || !data) {
      console.error("staff_code_issue failed", error?.message);
      return json({ ok: false, error: "INTERNAL" }, 500);
    }
    if (!data.ok || data.verified) return json(data);

    const sent = await sendMail(key, sender, u.user.email, data.code, lang).catch((e) => {
      console.error("brevo failed", e);
      return false;
    });
    if (!sent) {
      await db.rpc("staff_code_clear", { p_session: session });
      return json({ ok: false, error: "SEND_FAILED" });
    }
    return json({ ok: true, sent: true, email: u.user.email });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: "INTERNAL" }, 500);
  }
});
