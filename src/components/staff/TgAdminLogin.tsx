"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { closeWebApp, initTelegramWebApp, webAppInitData } from "@/lib/telegram-webapp";
import { Logo } from "../Logo";
import { ErrorNote, Field } from "./ui";
import { EmailCodeScreen, useStaffCode } from "./EmailCodeScreen";
import { s, setStaffLang, type StaffLang } from "./i18n";

const BIND_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/telegram-bot/bind`;

/** Язык из профиля Telegram: узбекский, английский или русский */
function langFrom(initData: string | null): StaffLang {
  try {
    const code = String(JSON.parse(new URLSearchParams(initData ?? "").get("user") ?? "{}").language_code ?? "");
    if (code.startsWith("uz")) return "uz";
    if (code.startsWith("en")) return "en";
  } catch { /* ignore */ }
  return "ru";
}

/**
 * Вход администратора внутри Telegram: email + пароль + код из письма.
 * После входа личный чат этого человека с ботом становится чатом администратора.
 * Окно не помнит прошлый вход: каждый раз нужен пароль.
 */
export function TgAdminLogin() {
  const sb = browserClient();
  const [initData, setInitData] = useState<string | null | undefined>(undefined);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);
  const [state, setState] = useState<"idle" | "binding" | "done" | "failed">("idle");
  const [err, setErr] = useState<string | null>(null);
  const { code, pass } = useStaffCode(session);
  const binding = useRef(false);

  useEffect(() => {
    initTelegramWebApp();
    const data = webAppInitData();
    setStaffLang(langFrom(data));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitData(data);
    let unsub = () => {};
    // Прошлый вход в этом окне не считается: начинаем с пароля
    sb.auth.signOut({ scope: "local" }).finally(() => {
      setSession(null);
      const { data: sub } = sb.auth.onAuthStateChange((_e, sess) => setSession(sess));
      unsub = () => sub.subscription.unsubscribe();
    });
    return () => unsub();
  }, [sb]);

  // Подключить чат может только активный администратор
  useEffect(() => {
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsAdmin(undefined);
      return;
    }
    let alive = true;
    sb.from("staff").select("role,is_active").eq("user_id", session.user.id).maybeSingle().then(({ data }) => {
      if (!alive) return;
      const ok = !!data && data.is_active && data.role === "admin";
      setIsAdmin(ok);
      if (!ok) {
        setErr(s("Подключить чат может только администратор."));
        void sb.auth.signOut({ scope: "local" });
      }
    });
    return () => { alive = false; };
  }, [session, sb]);

  // Пароль и код пройдены — привязываем чат
  useEffect(() => {
    if (!session || !isAdmin || !code?.verified || !initData || binding.current) return;
    binding.current = true;
    setState("binding");
    (async () => {
      try {
        const r = await fetch(BIND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ init_data: initData }),
        });
        const res = await r.json().catch(() => ({ ok: false }));
        if (!res.ok) throw new Error(res.error);
        setState("done");
        setTimeout(closeWebApp, 2500);
      } catch (e) {
        setState("failed");
        setErr(
          (e as Error).message === "BAD_TELEGRAM"
            ? s("Окно входа устарело. Закройте его и снова отправьте боту /admin.")
            : s("Не удалось подключить чат. Попробуйте ещё раз."),
        );
      } finally {
        // Вход нужен был только для подключения: в окне Telegram он не остаётся
        await sb.auth.signOut({ scope: "local" });
      }
    })();
  }, [session, isAdmin, code, initData, sb]);

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-6">
      <Logo sub="Telegram" />
      {children}
    </div>
  );

  if (initData === undefined || session === undefined) return shell(<p className="mt-6 text-sm text-muted">{s("Загрузка…")}</p>);

  if (!initData)
    return shell(
      <div className="card mt-6 grid gap-3 p-5">
        <h1 className="font-display text-xl font-bold">{s("Откройте эту страницу из бота")}</h1>
        <p className="text-sm text-muted">{s("Отправьте боту BOLAKAY команду /admin и нажмите «Войти как администратор».")}</p>
      </div>,
    );

  if (state === "done")
    return shell(
      <div className="card mt-6 grid gap-3 p-5">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-fresh-50 text-fresh">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
        <h1 className="font-display text-xl font-bold">{s("Чат подключён")}</h1>
        <p className="text-sm text-muted">{s("Теперь заказы и обращения покупателей будут приходить в этот чат. Окно закроется само.")}</p>
        <button className="btn btn-primary" onClick={closeWebApp}>{s("Закрыть")}</button>
      </div>,
    );

  if (state === "binding") return shell(<p className="mt-6 text-sm text-muted">{s("Подключаем чат…")}</p>);

  if (state === "failed")
    return shell(
      <div className="card mt-6 grid gap-3 p-5">
        <ErrorNote text={err} />
        <button className="btn btn-primary" onClick={closeWebApp}>{s("Закрыть")}</button>
      </div>,
    );

  if (!session) return shell(<LoginForm initialError={err} onStart={() => setErr(null)} />);
  if (isAdmin === undefined || code === undefined) return shell(<p className="mt-6 text-sm text-muted">{s("Загрузка…")}</p>);
  if (!code.verified) return shell(<EmailCodeScreen email={session.user.email ?? ""} onDone={pass} />);
  return shell(<p className="mt-6 text-sm text-muted">{s("Подключаем чат…")}</p>);
}

function LoginForm({ initialError, onStart }: { initialError: string | null; onStart: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(initialError);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onStart();
    setBusy(true);
    setErr(null);
    const { error } = await browserClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (!error) return;
    if (error.message === "Invalid login credentials") setErr(s("Неверный email или пароль"));
    else if (error.status === 429 || /rate limit|security purposes/i.test(error.message)) setErr(s("Слишком много попыток. Подождите несколько минут и попробуйте снова."));
    else setErr(error.message);
  }

  return (
    <form onSubmit={submit} className="card mt-6 grid gap-4 p-5">
      <h1 className="font-display text-xl font-bold">{s("Вход для администратора")}</h1>
      <p className="text-sm text-muted">{s("После входа этот чат с ботом будет получать заказы и обращения покупателей.")}</p>
      <Field label="Email"><input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
      <Field label={s("Пароль")}><input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      <ErrorNote text={err} />
      <button className="btn btn-primary" disabled={busy}>{busy ? s("Входим…") : s("Войти")}</button>
    </form>
  );
}
