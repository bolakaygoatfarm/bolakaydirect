"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { rememberOrder } from "@/lib/cart";
import { addDays, dateTime, formatPhone, money, pick, realPhone, shortDate, sizeLabel, tashkentDate, tashkentTime } from "@/lib/format";
import { errorText, t } from "@/lib/i18n";
import { browserClient } from "@/lib/supabase";
import type { Lang, OrderStatus, PublicOrder } from "@/lib/types";
import { mapUrlClient } from "./mapUrl";
import { PickupCode, legacyCopy } from "./PickupCode";

const TONE: Record<OrderStatus, string> = {
  pending_payment: "bg-aged-50 text-aged",
  confirmed: "bg-fresh-50 text-fresh",
  issued: "bg-brand-50 text-brand-700",
  cancelled: "bg-danger-50 text-danger",
  expired: "bg-danger-50 text-danger",
};

export function OrderView({ lang, token, loadingText }: { lang: Lang; token: string; loadingText: string }) {
  const d = t(lang);
  const [order, setOrder] = useState<PublicOrder | null | undefined>(undefined);
  const [bot, setBot] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(0); // время последней проверки статуса

  const load = useCallback(async () => {
    const { data, error } = await browserClient().rpc("get_order", { p_token: token });
    if (error) return setErr(d.err_generic);
    setOrder((data as PublicOrder | null) ?? null);
    setNow(Date.now());
  }, [token, d.err_generic]);

  useEffect(() => {
    browserClient().from("settings").select("telegram_bot_username,support_phone").maybeSingle()
      .then(({ data }) => {
        setBot((data?.telegram_bot_username as string | null) ?? null);
        setPhone(realPhone((data?.support_phone as string | null) ?? null));
      });
  }, []);

  useEffect(() => {
    rememberOrder(token);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // обновляем статус каждые 20 секунд, пока страница открыта
    const id = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(id);
  }, [load, token]);

  // Ссылка — единственный ключ к заказу с другого устройства: на телефоне открываем «Поделиться», иначе копируем
  async function saveLink() {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `BOLAKAY · ${d.order}`, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // пользователь закрыл окно
      }
    }
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      ok = legacyCopy(url);
    }
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    }
  }

  async function cancel() {
    if (!confirm(d.cancel_confirm)) return;
    setBusy(true);
    const { data, error } = await browserClient().rpc("cancel_order_by_token", { p_token: token });
    setBusy(false);
    if (error) setErr(errorText(lang, error.message));
    else setOrder(data as PublicOrder);
  }

  if (order === undefined) return <p className="mx-auto max-w-lg px-4 py-10 text-muted">{err ?? loadingText}</p>;
  if (order === null) return <p className="mx-auto max-w-lg px-4 py-16 text-center text-lg font-bold">404</p>;

  const active = order.status === "confirmed" || order.status === "pending_payment";
  const map = mapUrlClient(order.fridge);

  // Забронировано ≠ готово к выдаче: «Можно забирать» появляется только с начала выбранного интервала
  const slotStart = Date.parse(`${order.pickup_date}T${order.pickup_slot.split("-")[0]}:00+05:00`);
  const ready = order.status === "confirmed" && now >= slotStart;
  const today = tashkentDate(now ? new Date(now) : undefined);
  const dayText =
    order.pickup_date === today ? d.today.toLowerCase()
    : order.pickup_date === addDays(today, 1) ? d.tomorrow.toLowerCase()
    : shortDate(`${order.pickup_date}T12:00:00+05:00`, lang);
  const slotText = order.pickup_slot.replace("-", "–");
  const paid = order.payment_status === "paid";

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <p className="text-sm font-bold text-muted">{d.order} № {order.number}</p>
      <span className={`chip mt-2 px-3 py-1.5 text-sm ${ready ? TONE.confirmed : order.status === "confirmed" ? "bg-brand-50 text-brand-700" : TONE[order.status]}`}>
        {ready ? d.st_ready : d[`st_${order.status}`]}
      </span>
      {active && (
        <p className="mt-2 font-extrabold text-ink">
          {ready ? `${d.ready_until} ${tashkentTime(new Date(order.reserved_until))}` : `${d.pickup_at}: ${dayText}, ${slotText}`}
        </p>
      )}

      {active && (
        <section className="grain relative mt-5 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-6 text-center text-white shadow-[var(--shadow-float)]">
          <p className="text-sm font-bold uppercase tracking-widest text-white/75">{d.pickup_code}</p>
          <PickupCode code={order.pickup_code} lang={lang} />
          <p className="mt-3 text-sm text-white/85">{d.pickup_code_hint}</p>
          {!paid && <p className="mt-1 text-xs text-white/75">{d.code_not_payment}</p>}
        </section>
      )}

      {bot && (order.telegram_linked ? (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-fresh-50 px-4 py-3 text-sm font-bold text-fresh">
          <TgIcon /> {d.tg_linked}
        </p>
      ) : (
        <a
          href={`https://t.me/${bot}?start=${order.token}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-3 rounded-2xl bg-[#229ED9] px-4 py-3.5 text-white shadow-[var(--shadow-card)] transition hover:bg-[#1b8cc2]"
        >
          <TgIcon />
          <span>
            <span className="block font-extrabold">{d.tg_connect}</span>
            <span className="block text-xs text-white/85">{d.tg_connect_d}</span>
          </span>
        </a>
      ))}

      <section className="card mt-5 grid gap-3 p-5 text-sm">
        <Row k={d.point} v={`${order.fridge.name}`} />
        <Row k="" v={pick(order.fridge, "address", lang)} />
        <Row k={d.pickup_at} v={`${shortDate(`${order.pickup_date}T12:00:00+05:00`, lang)}, ${order.pickup_slot.replace("-", "–")}`} />
        {active && <Row k={d.reserved_until} v={dateTime(order.reserved_until, lang)} />}
        <Row k={d.payment} v={order.payment_method === "on_pickup" ? d.pay_on_pickup : order.payment_method.toUpperCase()} />
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted">{d.pay_status}</span>
          <span className={`chip ${paid ? "bg-fresh-50 text-fresh" : order.payment_status === "refunded" ? "bg-brand-50 text-brand-700" : "bg-aged-50 text-aged"}`}>
            {d[`pay_${order.payment_status}`]}
          </span>
        </div>
        {map && (
          <a href={map} target="_blank" rel="noopener noreferrer" className="btn btn-soft mt-1">{d.on_map} ↗</a>
        )}
      </section>

      <section className="card mt-4 divide-y divide-line">
        {order.items.map((i, n) => (
          <div key={n} className="flex items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-extrabold">{pick(i, "name", lang)} · {sizeLabel(i.size_label, lang)}</p>
              <p className="text-xs text-muted">{d.produced}: {shortDate(i.produced_at, lang)} · {d.expires}: {shortDate(i.expires_at, lang)}</p>
            </div>
            <p className="shrink-0 font-bold">{i.qty} × {money(i.price, lang)}</p>
          </div>
        ))}
        <div className="flex items-center justify-between p-4">
          <span className="font-bold">{d.total}</span>
          <span className="font-display text-xl font-bold">{money(order.total, lang)}</span>
        </div>
      </section>

      {err && <p className="mt-4 rounded-xl bg-danger-50 p-3 text-sm font-bold text-danger" role="alert">{err}</p>}

      <div className="mt-6 grid gap-2">
        <button type="button" onClick={saveLink} className="btn btn-soft" aria-live="polite">{linkCopied ? d.link_copied : d.save_link}</button>
        {phone && <a href={`tel:${phone}`} className="btn btn-ghost">{d.call_support} · {formatPhone(phone)}</a>}
        <Link href={`/${lang}/point/${order.fridge.code}`} className="btn btn-ghost">{d.back_to_point}</Link>
        {active && order.payment_status === "unpaid" && (
          <button onClick={cancel} disabled={busy} className="btn btn-danger">{d.cancel_order}</button>
        )}
      </div>
    </div>
  );
}

function TgIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0" aria-hidden fill="currentColor">
      <path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1l-4.8-1.5c-1-.3-1-1 .2-1.5L20.4 2.9c.9-.3 1.7.2 1.5 1.4Z" />
    </svg>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{k}</span>
      <span className="text-right font-bold">{v}</span>
    </div>
  );
}
