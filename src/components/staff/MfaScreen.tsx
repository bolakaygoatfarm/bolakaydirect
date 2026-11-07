"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { browserClient } from "@/lib/supabase";
import { ErrorNote, Field } from "./ui";
import { s } from "./i18n";

export interface MfaState { level: string | null; factorId: string | null; failed?: boolean }

/** Состояние входа: подтверждён ли код в этой сессии и настроен ли он у сотрудника */
export function useMfa(session: Session | null | undefined): MfaState | undefined {
  const [state, setState] = useState<MfaState | undefined>(undefined);
  const token = session?.access_token;
  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      const sb = browserClient();
      const [aal, factors] = await Promise.all([sb.auth.mfa.getAuthenticatorAssuranceLevel(), sb.auth.mfa.listFactors()]);
      if (!alive) return;
      // Без ответа нельзя считать, что кода нет: иначе сотруднику предложили бы настраивать его заново
      if (aal.error || factors.error) return setState({ level: null, factorId: null, failed: true });
      setState({ level: aal.data?.currentLevel ?? null, factorId: factors.data?.totp?.[0]?.id ?? null });
    })().catch(() => {
      if (alive) setState({ level: null, factorId: null, failed: true });
    });
    return () => { alive = false; };
  }, [token]);
  return token ? state : undefined;
}

function codeError(e: { message: string; status?: number; code?: string }) {
  if (e.status === 429 || /rate limit|too many/i.test(e.message)) return s("Слишком много попыток. Подождите несколько минут и попробуйте снова.");
  if (e.code === "mfa_verification_failed" || /invalid.*code|invalid totp/i.test(e.message)) return s("Неверный код. Введите новый код из приложения: он меняется каждые 30 секунд.");
  return e.message;
}

function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <Field label={s("Код из 6 цифр")}>
      <input
        className="field text-center font-display text-2xl tracking-[0.4em] tabular-nums"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        autoFocus={autoFocus}
        required
      />
    </Field>
  );
}

/** Экран ввода кода или первой настройки приложения. onDone вызывается, когда сессия подтверждена */
export function MfaScreen({ factorId, onDone }: { factorId: string | null; onDone: () => void }) {
  const sb = browserClient();
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  const startEnroll = useCallback(async () => {
    setErr(null);
    // Незавершённая настройка мешает начать новую: убираем её
    const { data: list } = await sb.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "BOLAKAY", issuer: "BOLAKAY" });
    if (error || !data) return setErr(error?.message ?? s("Ошибка"));
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }, [sb]);

  useEffect(() => {
    if (factorId || started.current) return;
    started.current = true;
    // Настройка начинается сразу: без кода в панель всё равно не войти
    void startEnroll();
  }, [factorId, startEnroll]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = factorId ?? enroll?.id;
    if (!id || code.length !== 6) return setErr(s("Введите все 6 цифр."));
    setBusy(true);
    setErr(null);
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: id, code });
    if (error) {
      setBusy(false);
      setCode("");
      return setErr(codeError(error));
    }
    // У администратора это включает обязательный код для всех сотрудников
    await sb.rpc("staff_mfa_activate");
    setBusy(false);
    onDone();
  }

  const signOut = <button type="button" className="btn btn-ghost" onClick={() => sb.auth.signOut()}>{s("Выйти")}</button>;

  if (factorId) {
    return (
      <form onSubmit={submit} className="card mt-6 grid gap-4 p-5">
        <h1 className="font-display text-xl font-bold">{s("Подтвердите вход")}</h1>
        <p className="text-sm text-muted">{s("Откройте приложение-аутентификатор и введите код BOLAKAY.")}</p>
        <CodeInput value={code} onChange={setCode} autoFocus />
        <ErrorNote text={err} />
        <button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? s("Проверяем…") : s("Подтвердить")}</button>
        <p className="text-xs text-muted">{s("Нет доступа к телефону? Попросите администратора сбросить код в разделе «Настройки → Сотрудники».")}</p>
        {signOut}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="card mt-6 grid gap-4 p-5">
      <h1 className="font-display text-xl font-bold">{s("Настройте код для входа")}</h1>
      <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted">
        <li>{s("Установите на телефон Google Authenticator или другое приложение-аутентификатор.")}</li>
        <li>{s("В приложении нажмите «+» и отсканируйте QR-код.")}</li>
        <li>{s("Введите код из 6 цифр, который покажет приложение.")}</li>
      </ol>
      {enroll ? (
        <>
          {/* QR всегда на белом фоне, иначе телефон не распознает его в тёмной теме */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt={s("QR-код для приложения-аутентификатора")} width={200} height={200} className="mx-auto rounded-xl bg-white p-2" />
          <details className="text-sm">
            <summary className="cursor-pointer font-bold text-brand-700">{s("Не получается отсканировать")}</summary>
            <p className="mt-2 text-muted">{s("Введите этот ключ в приложении вручную:")}</p>
            <code className="mt-1 block break-all rounded-lg bg-brand-50 p-2 text-xs">{enroll.secret}</code>
          </details>
          <CodeInput value={code} onChange={setCode} />
          <ErrorNote text={err} />
          <button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? s("Проверяем…") : s("Подтвердить")}</button>
        </>
      ) : (
        err ? (
          <>
            <ErrorNote text={err} />
            <button type="button" className="btn btn-primary" onClick={() => void startEnroll()}>{s("Попробовать ещё раз")}</button>
          </>
        ) : <p className="text-sm text-muted">{s("Загрузка…")}</p>
      )}
      {signOut}
    </form>
  );
}
