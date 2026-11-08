"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { rememberOrder, useCart } from "@/lib/cart";
import { addDays, formatPhoneInput, money, normalizePhone, pick, pickupSlots, shortDate, sizeLabel, tashkentDate, tashkentTime } from "@/lib/format";
import { errorText, t } from "@/lib/i18n";
import { browserClient } from "@/lib/supabase";
import { linkOrderToBot } from "@/lib/telegram-webapp";
import { paymentUrl } from "@/lib/payment";
import { groupCatalog, type CatalogRow, type Fridge, type Lang, type PaymentMethod } from "@/lib/types";
import { ProductArt } from "./ProductArt";
import { Stepper } from "./PointCatalog";

interface Settings { click_enabled: boolean; payme_enabled: boolean; pickup_grace_minutes: number }

export function Checkout({ lang }: { lang: Lang }) {
  const d = t(lang);
  const router = useRouter();
  const code = useSearchParams().get("point") || "";
  const { lines, setQty, clear } = useCart(code);

  const [fridge, setFridge] = useState<Fridge | null>(null);
  const [rows, setRows] = useState<CatalogRow[] | null>(null);
  const [settings, setSettings] = useState<Settings>({ click_enabled: false, payme_enabled: false, pickup_grace_minutes: 60 });
  const [loadErr, setLoadErr] = useState(false);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [day, setDay] = useState<0 | 1>(0);
  const [slot, setSlot] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("on_pickup");
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = browserClient();
    const [f, c, s] = await Promise.all([
      sb.from("fridges").select("*").eq("code", code).maybeSingle(),
      sb.rpc("fridge_catalog", { p_code: code }),
      sb.from("settings").select("click_enabled,payme_enabled,pickup_grace_minutes").maybeSingle(),
    ]);
    if (f.error || c.error) return setLoadErr(true);
    setFridge(f.data as Fridge | null);
    setRows((c.data ?? []) as CatalogRow[]);
    if (s.data) setSettings(s.data as Settings);
  }, [code]);

  useEffect(() => {
    // загрузка данных точки при открытии страницы
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (code) void load();
  }, [code, load]);

  const products = useMemo(() => groupCatalog(rows ?? []), [rows]);
  const index = useMemo(() => {
    const m = new Map<string, { available: number; produced_at: string; sell_until: string; p: (typeof products)[number] }>();
    products.forEach((p) => p.batches.forEach((b) => m.set(b.batch_id, { available: b.available, produced_at: b.produced_at, sell_until: b.sell_until, p })));
    return m;
  }, [products]);

  const items = lines.filter((l) => index.has(l.batch_id)).map((l) => ({ ...l, ...index.get(l.batch_id)! }));
  const total = items.reduce((s, i) => s + i.p.price * i.qty, 0);

  const today = tashkentDate();
  const tomorrow = addDays(today, 1);

  // Товар должен быть в сроке до конца интервала: те же правила проверяет сервер при оформлении.
  // Берём самую раннюю партию в корзине — один заказ получают за один раз.
  const lastSell = items.length ? Math.min(...items.map((i) => Date.parse(i.sell_until))) : Infinity;
  const slotsFor = useCallback(
    (date: string) => {
      if (!fridge) return [];
      return pickupSlots(fridge.open_time, fridge.close_time, date).filter((s) => Date.parse(`${date}T${s.split("-")[1]}:00+05:00`) <= lastSell);
    },
    [fridge, lastSell],
  );
  const tomorrowOpen = slotsFor(tomorrow).length > 0;
  const tomorrowClosedByDate = !tomorrowOpen && !!fridge && pickupSlots(fridge.open_time, fridge.close_time, tomorrow).length > 0;
  const activeDay = day === 1 && tomorrowOpen ? 1 : 0;
  const ymd = activeDay === 0 ? today : tomorrow;
  const slots = useMemo(() => slotsFor(ymd), [slotsFor, ymd]);
  // До какого времени продержится бронь: конец интервала + ожидание, но не дольше срока продажи
  const holdText = (date: string, s: string) => {
    const end = Date.parse(`${date}T${s.split("-")[1]}:00+05:00`) + settings.pickup_grace_minutes * 60000;
    return tashkentTime(new Date(Math.min(end, lastSell)));
  };
  // «Заберу сейчас» — текущий интервал сегодняшнего дня, пока точка работает
  const nowHm = tashkentTime();
  const nowSlot = slotsFor(today).find((s) => s.split("-")[0] <= nowHm && nowHm < s.split("-")[1]) ?? null;
  const takeNowOn = !!nowSlot && activeDay === 0 && slot === nowSlot;
  useEffect(() => {
    // сбрасываем интервал, если он стал недоступен
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (slot && !slots.includes(slot)) setSlot("");
  }, [slot, slots]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const p = normalizePhone(phone);
    if (!p) return setErr(d.err_INVALID_PHONE);
    if (!slot) return setErr(d.err_INVALID_SLOT);
    if (!items.length) return;
    setSending(true);
    const { data, error } = await browserClient().rpc("create_order", {
      p_fridge_code: code,
      p_phone: p,
      p_name: name.trim() || null,
      p_items: items.map((i) => ({ batch_id: i.batch_id, qty: i.qty })),
      p_pickup_date: ymd,
      p_pickup_slot: slot,
      p_payment_method: method,
      p_comment: comment.trim() || null,
    });
    if (error) {
      setSending(false);
      setErr(errorText(lang, error.message));
      if (/STOCK|BATCH/.test(error.message)) void load();
      return;
    }
    const token = (data as { token: string }).token;
    rememberOrder(token);
    await linkOrderToBot(token);
    clear();
    // Онлайн-оплата: сразу на форму Payme или Click. Без ссылки на странице заказа останется кнопка «Оплатить»
    const payUrl = method === "on_pickup" ? null : await paymentUrl(token, lang);
    if (payUrl) window.location.assign(payUrl);
    else router.replace(`/${lang}/order/${token}`);
  }

  if (!code) return <Empty lang={lang} text={d.cart_empty} />;
  if (loadErr) return <Empty lang={lang} text={d.err_generic} code={code} />;
  if (!rows) return <p className="mx-auto max-w-lg px-4 py-10 text-muted">{d.loading}</p>;
  if (!fridge) return <Empty lang={lang} text={d.not_found_point} />;
  if (!items.length) return <Empty lang={lang} text={d.cart_empty} code={code} />;

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <Link href={`/${lang}/point/${code}`} className="text-sm font-bold text-brand-700">← {d.back_to_point}</Link>
      <h1 className="font-display mt-3 text-2xl font-bold text-brand-900">{d.checkout_title}</h1>
      <p className="mt-1 text-sm text-muted">{d.point} {fridge.name} · {pick(fridge, "address", lang)}</p>

      <section className="card mt-5 divide-y divide-line">
        {items.map((i) => (
          <div key={i.batch_id} className="flex items-center gap-3 p-3">
            <ProductArt category={i.p.category} image={i.p.image_url} alt="" className="h-14 w-14 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold">{pick(i.p, "name", lang)} <span className="font-semibold text-muted">· {sizeLabel(i.p.size_label, lang)}</span></p>
              <p className="text-xs text-muted">{d.produced}: {shortDate(i.produced_at, lang)}</p>
              <p className="text-sm font-bold text-brand-700">{money(i.p.price * i.qty, lang)}</p>
            </div>
            <div className="w-28 shrink-0"><Stepper value={i.qty} max={i.available} onChange={(v) => setQty(i.batch_id, i.product_id, v)} /></div>
          </div>
        ))}
        <div className="flex items-center justify-between p-4">
          <span className="font-bold">{d.total}</span>
          <span className="font-display text-xl font-bold">{money(total, lang)}</span>
        </div>
      </section>

      <section className="mt-6 grid gap-4">
        <div>
          <label className="label" htmlFor="phone">{d.phone} *</label>
          <div className="flex gap-2">
            <span className="field flex w-auto items-center font-bold text-muted">+998</span>
            <input id="phone" className="field" inputMode="tel" autoComplete="tel-national" placeholder="90 123 45 67" value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} required />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="name">{d.name}</label>
          <input id="name" className="field" autoComplete="given-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {nowSlot && (
          <button type="button" className="option justify-start gap-3 py-2.5 text-left" aria-pressed={takeNowOn} onClick={() => { setDay(0); setSlot(nowSlot); }}>
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-butter-100 text-butter-700">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3 5 14h6l-1 7 8-11h-6Z" /></svg>
            </span>
            <span>
              {d.take_now}
              <span className="block text-xs font-semibold text-muted">{d.take_now_d.replace("{time}", holdText(today, nowSlot))}</span>
            </span>
          </button>
        )}

        <fieldset>
          <legend className="label">{d.pickup_day}</legend>
          <div className={`grid gap-2 ${tomorrowOpen ? "grid-cols-2" : "grid-cols-1"}`}>
            {(tomorrowOpen ? ([0, 1] as const) : ([0] as const)).map((n) => (
              <button type="button" key={n} className="option" aria-pressed={activeDay === n} onClick={() => setDay(n)}>
                {n === 0 ? d.today : d.tomorrow} · {shortDate(`${n === 0 ? today : tomorrow}T12:00:00+05:00`, lang)}
              </button>
            ))}
          </div>
          {tomorrowClosedByDate && <p className="mt-2 text-xs font-semibold text-muted">{d.tomorrow_closed}</p>}
        </fieldset>

        <fieldset>
          <legend className="label">{d.pickup_time}</legend>
          {slots.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slots.map((s) => (
                <button type="button" key={s} className="option tabular-nums" aria-pressed={slot === s} onClick={() => setSlot(s)}>
                  {s.replace("-", "–")}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-aged-50 p-3 text-sm font-bold text-aged">{d.no_slots}</p>
          )}
          {slot && slots.includes(slot) && <p className="mt-2 text-sm font-bold text-brand-700">{d.hold_until.replace("{time}", holdText(ymd, slot))}</p>}
        </fieldset>

        <fieldset>
          <legend className="label">{d.payment}</legend>
          {settings.click_enabled || settings.payme_enabled ? (
            <div className="grid gap-2">
              <label className="option justify-start gap-3 py-2 text-left">
                <input type="radio" name="pay" className="h-5 w-5 accent-brand-600" checked={method === "on_pickup"} onChange={() => setMethod("on_pickup")} />
                <span>{d.pay_on_pickup}<span className="block text-xs font-semibold text-muted">{d.pay_on_pickup_d}</span></span>
              </label>
              {(["click", "payme"] as const).filter((m) => (m === "click" ? settings.click_enabled : settings.payme_enabled)).map((m) => (
                <label key={m} className="option justify-start gap-3">
                  <input type="radio" name="pay" className="h-5 w-5 accent-brand-600" checked={method === m} onChange={() => setMethod(m)} />
                  <span>{m === "click" ? d.pay_click : d.pay_payme}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-brand-50 px-4 py-3 font-bold">{d.pay_on_pickup}<span className="block text-xs font-semibold text-muted">{d.pay_on_pickup_d}</span></p>
          )}
        </fieldset>

        <details>
          <summary className="cursor-pointer text-sm font-bold text-brand-700">{d.comment_add}</summary>
          <textarea id="comment" aria-label={d.comment} className="field mt-2 min-h-20" maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
        </details>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span>{d.consent}</span>
        </label>
      </section>

      {err && <p className="mt-4 rounded-xl bg-danger-50 p-3 text-sm font-bold text-danger" role="alert">{err}</p>}

      <button className="btn btn-primary mt-6 w-full text-base" disabled={sending || !consent || !slot}>
        {sending ? d.placing : `${method === "on_pickup" ? d.place_order : d.pay_now} · ${money(total, lang)}`}
      </button>
      <p className="mt-2 text-center text-xs font-semibold text-muted">{method === "on_pickup" ? d.pay_note : d.pay_online_note}</p>
    </form>
  );
}

function Empty({ lang, text, code }: { lang: Lang; text: string; code?: string }) {
  const d = t(lang);
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-lg font-bold">{text}</p>
      <Link href={code ? `/${lang}/point/${code}` : `/${lang}/points`} className="btn btn-primary mt-6">
        {code ? d.back_to_point : d.pick_point}
      </Link>
    </div>
  );
}
