"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { rememberOrder, useCart } from "@/lib/cart";
import { addDays, formatPhoneInput, money, normalizePhone, pick, pickupSlots, shortDate, tashkentDate } from "@/lib/format";
import { errorText, t } from "@/lib/i18n";
import { browserClient } from "@/lib/supabase";
import { groupCatalog, type CatalogRow, type Fridge, type Lang, type PaymentMethod } from "@/lib/types";
import { ProductArt } from "./ProductArt";
import { Stepper } from "./PointCatalog";

interface Settings { click_enabled: boolean; payme_enabled: boolean }

export function Checkout({ lang }: { lang: Lang }) {
  const d = t(lang);
  const router = useRouter();
  const code = useSearchParams().get("point") || "";
  const { lines, setQty, clear } = useCart(code);

  const [fridge, setFridge] = useState<Fridge | null>(null);
  const [rows, setRows] = useState<CatalogRow[] | null>(null);
  const [settings, setSettings] = useState<Settings>({ click_enabled: false, payme_enabled: false });
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
      sb.from("settings").select("click_enabled,payme_enabled").maybeSingle(),
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
    const m = new Map<string, { available: number; produced_at: string; p: (typeof products)[number] }>();
    products.forEach((p) => p.batches.forEach((b) => m.set(b.batch_id, { available: b.available, produced_at: b.produced_at, p })));
    return m;
  }, [products]);

  const items = lines.filter((l) => index.has(l.batch_id)).map((l) => ({ ...l, ...index.get(l.batch_id)! }));
  const total = items.reduce((s, i) => s + i.p.price * i.qty, 0);

  const today = tashkentDate();
  const ymd = day === 0 ? today : addDays(today, 1);
  const slots = useMemo(() => (fridge ? pickupSlots(fridge.open_time, fridge.close_time, ymd) : []), [fridge, ymd]);
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
    clear();
    router.replace(`/${lang}/order/${token}`);
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
              <p className="truncate font-extrabold">{pick(i.p, "name", lang)} <span className="font-semibold text-muted">· {i.p.size_label}</span></p>
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

        <fieldset>
          <legend className="label">{d.pickup_day}</legend>
          <div className="grid grid-cols-2 gap-2">
            {([0, 1] as const).map((n) => (
              <button type="button" key={n} className="option" aria-pressed={day === n} onClick={() => setDay(n)}>
                {n === 0 ? d.today : d.tomorrow} · {shortDate(`${n === 0 ? today : addDays(today, 1)}T12:00:00+05:00`, lang)}
              </button>
            ))}
          </div>
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
        </fieldset>

        <fieldset>
          <legend className="label">{d.payment}</legend>
          <div className="grid gap-2">
            <label className="option justify-start gap-3 py-2 text-left">
              <input type="radio" name="pay" className="h-5 w-5 accent-brand-600" checked={method === "on_pickup"} onChange={() => setMethod("on_pickup")} />
              <span>{d.pay_on_pickup}<span className="block text-xs font-semibold text-muted">{d.pay_on_pickup_d}</span></span>
            </label>
            {(["click", "payme"] as const).map((m) => {
              const enabled = m === "click" ? settings.click_enabled : settings.payme_enabled;
              return (
                <label key={m} className={`option justify-start gap-3 ${enabled ? "" : "cursor-not-allowed opacity-50"}`}>
                  <input type="radio" name="pay" className="h-5 w-5 accent-brand-600" disabled={!enabled} checked={method === m} onChange={() => setMethod(m)} />
                  <span>{m === "click" ? d.pay_click : d.pay_payme}{!enabled && <span className="ml-2 text-xs text-muted">({d.soon})</span>}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label className="label" htmlFor="comment">{d.comment}</label>
          <textarea id="comment" className="field min-h-20" maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span>{d.consent}</span>
        </label>
      </section>

      {err && <p className="mt-4 rounded-xl bg-danger-50 p-3 text-sm font-bold text-danger" role="alert">{err}</p>}

      <button className="btn btn-primary mt-6 w-full text-base" disabled={sending || !consent || !slot}>
        {sending ? d.placing : `${d.place_order} · ${money(total, lang)}`}
      </button>
    </form>
  );
}

function Empty({ lang, text, code }: { lang: Lang; text: string; code?: string }) {
  const d = t(lang);
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-lg font-bold">{text}</p>
      <Link href={code ? `/${lang}/point/${code}` : `/${lang}/points`} className="btn btn-primary mt-6">
        {code ? d.back_to_point : d.hero_cta}
      </Link>
    </div>
  );
}
