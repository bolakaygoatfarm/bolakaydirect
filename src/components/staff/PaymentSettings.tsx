"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { ErrorNote, Section } from "./ui";
import { s, rich } from "./i18n";

interface Status { payme: { ready: boolean; test_mode: boolean }; click: { ready: boolean } }
type Flags = { click_enabled: boolean; payme_enabled: boolean };

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/payments`;

interface ProviderProps { name: string; ready: boolean; on: boolean; busy: boolean; onToggle: () => void; urls: [string, string][]; secrets: string; note?: string }

function Provider({ name, ready, on, busy, onToggle, urls, secrets, note }: ProviderProps) {
  return (
    <div className="rounded-xl bg-brand-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-extrabold">{name}</p>
        <span className="flex flex-wrap items-center gap-2">
          <span className={`chip ${ready ? "bg-fresh-50 text-fresh" : "bg-aged-50 text-aged"}`}>{ready ? s("Ключи добавлены") : s("Ключи не добавлены")}</span>
          <span className={`chip ${on ? "bg-fresh-50 text-fresh" : "bg-brand-100 text-brand-700"}`}>{on ? s("Включён на сайте") : s("Выключен на сайте")}</span>
        </span>
      </div>
      {note && <p className="mt-2 font-bold text-aged">{note}</p>}
      <p className="mt-2 text-muted">{rich(s("Секреты в Supabase → Edge Functions → Secrets: {0}", secrets))}</p>
      <ul className="mt-2 grid gap-1">
        {urls.map(([label, url]) => (
          <li key={label} className="break-all"><span className="text-muted">{label}:</span> <code>{url}</code></li>
        ))}
      </ul>
      {/* Включить без ключей нельзя: покупатель не смог бы заплатить */}
      <button type="button" className={`btn mt-3 min-h-9 w-fit px-3 text-xs ${on ? "btn-danger" : "btn-primary"}`} disabled={busy || (!on && !ready)} onClick={onToggle}>
        {on ? s("Выключить на сайте") : s("Включить на сайте")}
      </button>
    </div>
  );
}

/** Онлайн-оплата: что настроено на сервере, адреса для кабинетов и включение способа оплаты */
export function PaymentSettings({ flags, onChange }: { flags: Flags; onChange: (f: Flags) => void }) {
  const sb = browserClient();
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data: sess } = await sb.auth.getSession();
      const r = await fetch(`${BASE}/status`, { method: "POST", headers: { Authorization: `Bearer ${sess.session?.access_token ?? ""}` } });
      const res = await r.json().catch(() => null);
      if (!live) return;
      if (res?.ok) setSt(res as Status);
      else setErr(s("Не удалось получить настройки оплаты."));
    })().catch(() => live && setErr(s("Не удалось получить настройки оплаты.")));
    return () => {
      live = false;
    };
  }, [sb]);

  async function toggle(key: keyof Flags, value: boolean) {
    setBusy(true);
    setErr(null);
    const { error } = await sb.from("settings").update({ [key]: value, updated_at: new Date().toISOString() }).eq("id", 1);
    setBusy(false);
    if (error) setErr(error.message);
    else onChange({ ...flags, [key]: value });
  }

  return (
    <Section title={s("Онлайн-оплата")}>
      <div className="card grid gap-3 p-4 text-sm">
        {!st && !err && <p className="text-muted">{s("Загрузка…")}</p>}
        {st && (
          <>
            <Provider
              busy={busy} onToggle={() => toggle("payme_enabled", !flags.payme_enabled)}
              name="Payme" on={flags.payme_enabled} ready={st.payme.ready}
              secrets="`PAYME_MERCHANT_ID`, `PAYME_KEY`, `PAYME_TEST_KEY`, `PAYME_TEST_MODE`"
              urls={[["Endpoint URL", `${BASE}/payme`], [s("Поле счёта"), "order_id"]]}
              note={st.payme.test_mode ? s("Тестовый режим: настоящие деньги не списываются. Перед запуском удалите секрет PAYME_TEST_MODE.") : undefined}
            />
            <Provider
              busy={busy} onToggle={() => toggle("click_enabled", !flags.click_enabled)}
              name="Click" on={flags.click_enabled} ready={st.click.ready}
              secrets="`CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY`"
              urls={[["Prepare URL", `${BASE}/click/prepare`], ["Complete URL", `${BASE}/click/complete`]]}
            />
            <p className="text-xs text-muted">{s("Деньги при отмене оплаченного заказа возвращаются вручную в кабинете Payme или Click. Отметка в этой панели сама деньги не возвращает.")}</p>
          </>
        )}
        <ErrorNote text={err} />
      </div>
    </Section>
  );
}
