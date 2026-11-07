"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { browserClient } from "@/lib/supabase";
import { ErrorNote, Field } from "./ui";
import { s, staffLang } from "./i18n";

export interface CodeState { verified: boolean; skipped?: boolean; failed?: boolean }

/** Подтверждена ли кодом эта сессия. pass вызывается, когда экран кода закончил работу */
export function useStaffCode(session: Session | null | undefined) {
  const [state, setState] = useState<CodeState | undefined>(undefined);
  const token = session?.access_token;
  useEffect(() => {
    if (!token) {
      // Следующий вход начинается с проверки, а не с результата прошлой сессии
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(undefined);
      return;
    }
    let alive = true;
    browserClient().rpc("staff_code_status").then(({ data, error }) => {
      if (!alive) return;
      if (error) return setState((prev) => prev ?? { verified: false, failed: true });
      // Токен обновляется сам каждый час: разрешение на вход без кода при этом не теряем
      setState((prev) => ({ verified: !!data?.verified || !!prev?.skipped, skipped: prev?.skipped }));
    }, () => {
      if (alive) setState((prev) => prev ?? { verified: false, failed: true });
    });
    return () => { alive = false; };
  }, [token]);
  const pass = useCallback((skipped: boolean) => setState({ verified: true, skipped }), []);
  return { code: token ? state : undefined, pass };
}

const FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/staff-code`;
const COOLDOWN = 60;

function sendError(code: string | undefined) {
  if (code === "LIMIT") return s("Слишком много писем. Попробуйте снова через час.");
  if (code === "EMAIL_NOT_CONFIGURED") return s("Отправка кодов не настроена. Обратитесь к администратору.");
  if (code === "FORBIDDEN") return s("У этого аккаунта нет доступа к панели.");
  return s("Не удалось отправить письмо. Попробуйте ещё раз через минуту.");
}

function verifyError(res: { error?: string; left?: number } | null) {
  switch (res?.error) {
    case "WRONG": return s("Неверный код. Осталось попыток: {0}.", String(res.left ?? 0));
    case "TOO_MANY": return s("Слишком много неверных попыток. Запросите новый код.");
    case "EXPIRED": return s("Код устарел. Запросите новый.");
    case "NO_CODE": return s("Этот код уже не действует. Запросите новый.");
    default: return s("Не удалось проверить код. Попробуйте ещё раз.");
  }
}

/** Экран после пароля: письмо уходит сразу, сотрудник вводит код из него */
export function EmailCodeScreen({ email, onDone }: { email: string; onDone: (skipped: boolean) => void }) {
  const sb = browserClient();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"sending" | "sent" | "failed">("sending");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const started = useRef(false);

  const send = useCallback(async () => {
    setStatus("sending");
    setErr(null);
    try {
      const { data } = await sb.auth.getSession();
      const r = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ lang: staffLang() }),
      });
      const res = await r.json();
      if (res.skip) return onDone(true);
      if (res.verified) return onDone(false);
      if (res.ok) {
        setStatus("sent");
        setWait(COOLDOWN);
        return;
      }
      // Письмо уже ушло недавно, например страницу обновили: его код ещё действует
      if (res.error === "WAIT") {
        setStatus("sent");
        setWait(Number(res.retry_in) || COOLDOWN);
        return;
      }
      setStatus("failed");
      setErr(sendError(res.error));
    } catch {
      setStatus("failed");
      setErr(sendError(undefined));
    }
  }, [sb, onDone]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send();
  }, [send]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return setErr(s("Введите все 6 цифр."));
    setBusy(true);
    setErr(null);
    const { data, error } = await sb.rpc("staff_code_verify", { p_code: code });
    setBusy(false);
    if (!error && data?.ok) return onDone(false);
    setCode("");
    setErr(verifyError(error ? null : data));
  }

  const signOut = <button type="button" className="btn btn-ghost" onClick={() => sb.auth.signOut()}>{s("Выйти")}</button>;

  if (status === "sending") {
    return <div className="card mt-6 p-5 text-sm text-muted">{s("Отправляем код на почту…")}</div>;
  }

  if (status === "failed") {
    return (
      <div className="card mt-6 grid gap-4 p-5">
        <h1 className="font-display text-xl font-bold">{s("Подтвердите вход")}</h1>
        <ErrorNote text={err} />
        <button type="button" className="btn btn-primary" onClick={() => void send()}>{s("Попробовать ещё раз")}</button>
        {signOut}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card mt-6 grid gap-4 p-5">
      <h1 className="font-display text-xl font-bold">{s("Проверьте почту")}</h1>
      <p className="text-sm text-muted">{s("Мы отправили код из 6 цифр на {0}. Он действует 10 минут.", email)}</p>
      <Field label={s("Код из 6 цифр")}>
        <input
          className="field text-center font-display text-2xl tracking-[0.4em] tabular-nums"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          autoFocus
          required
        />
      </Field>
      <ErrorNote text={err} />
      <button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? s("Проверяем…") : s("Подтвердить")}</button>
      <p className="text-xs text-muted">{s("Письма нет? Проверьте папку «Спам».")}</p>
      <button type="button" className="btn btn-soft" disabled={wait > 0} onClick={() => void send()}>
        {wait > 0 ? s("Отправить ещё раз через {0} с", String(wait)) : s("Отправить код ещё раз")}
      </button>
      {signOut}
    </form>
  );
}
