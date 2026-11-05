"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart, writeCart } from "@/lib/cart";
import { haptic } from "@/lib/haptic";
import { dateTime, daysAgo, formatPhoneInput, money, normalizePhone, pick, shortDate } from "@/lib/format";
import { errorText, t } from "@/lib/i18n";
import { browserClient } from "@/lib/supabase";
import type { CartLine, CatalogBatch, CatalogProduct, Category, Lang, PublicOrder } from "@/lib/types";
import { CartIsland, type IslandItem } from "./CartIsland";
import { ProductArt } from "./ProductArt";
import { RollingNumber } from "./RollingNumber";

const CATS: Category[] = ["milk", "yogurt", "butter", "drinks"];

export function PointCatalog({ lang, code, products, disabled }: { lang: Lang; code: string; products: CatalogProduct[]; disabled: boolean }) {
  const d = t(lang);
  const { lines, setQty: writeQty } = useCart(code);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [cat, setCat] = useState<Category | "all">("all");
  const [open, setOpen] = useState<CatalogProduct | null>(null);

  // Все партии точки — для проверки корзины
  const batchIndex = useMemo(() => {
    const m = new Map<string, { b: CatalogBatch; p: CatalogProduct }>();
    products.forEach((p) => p.batches.forEach((b) => m.set(b.batch_id, { b, p })));
    return m;
  }, [products]);

  // Убираем из корзины то, что уже распродано/снято, и ограничиваем количество остатком
  useEffect(() => {
    const fixed = lines
      .filter((l) => batchIndex.has(l.batch_id))
      .map((l) => ({ ...l, qty: Math.min(l.qty, batchIndex.get(l.batch_id)!.b.available) }))
      .filter((l) => l.qty > 0);
    if (fixed.length !== lines.length || fixed.some((l, i) => l.qty !== lines[i].qty)) writeCart(code, fixed);
  }, [lines, batchIndex, code]);

  // Повтор заказа из Telegram: /point/<code>?repeat=<token заказа>
  const params = useSearchParams();
  const router = useRouter();
  const repeatDone = useRef(false);
  const [notice, setNotice] = useState<{ added: boolean; missing: string[] } | null>(null);
  useEffect(() => {
    const rt = params.get("repeat");
    if (!rt || repeatDone.current || !/^[0-9a-f-]{36}$/i.test(rt)) return;
    repeatDone.current = true;
    browserClient().rpc("get_order", { p_token: rt }).then(({ data }) => {
      router.replace(`/${lang}/point/${code}`, { scroll: false });
      const o = data as PublicOrder | null;
      if (!o || o.fridge.code !== code) return;
      const want = new Map<string, number>();
      o.items.forEach((i) => want.set(i.product_id, (want.get(i.product_id) ?? 0) + i.qty));
      const next: CartLine[] = lines.map((l) => ({ ...l }));
      const missing: string[] = [];
      let added = false;
      for (const [pid, qty] of want) {
        const p = products.find((x) => x.product_id === pid);
        const b = p?.batches[0];
        if (!p || !b) {
          const it = o.items.find((i) => i.product_id === pid)!;
          missing.push(`${pick(it, "name", lang)} ${it.size_label}`);
          continue;
        }
        const ex = next.find((l) => l.batch_id === b.batch_id);
        const q = Math.min(b.available, (ex?.qty ?? 0) + qty);
        if (ex) ex.qty = q;
        else next.push({ batch_id: b.batch_id, product_id: pid, qty: q });
        added = true;
      }
      writeCart(code, next);
      setNotice({ added, missing });
    });
  }, [params, router, lang, code, lines, products]);

  const qtyOf = (batchId: string) => lines.find((l) => l.batch_id === batchId)?.qty ?? 0;
  // Любое изменение корзины: вибро-отклик, а первое добавление показывает галочку на кнопке
  const setQty = (batchId: string, productId: string, qty: number) => {
    const prev = qtyOf(batchId);
    haptic(qty > prev ? 12 : 6);
    if (prev === 0 && qty > 0) setJustAdded(batchId);
    writeQty(batchId, productId, qty);
  };
  const islandItems = lines
    .map((l) => {
      const e = batchIndex.get(l.batch_id);
      return e ? { batch: e.b, product: e.p, qty: l.qty } : null;
    })
    .filter((x): x is IslandItem => x !== null);

  const present = CATS.filter((c) => products.some((p) => p.category === c));
  const shown = products.filter((p) => cat === "all" || p.category === cat);

  return (
    <>
      {notice && (
        <div className="animate-fade mt-4 rounded-2xl bg-fresh-50 px-4 py-3 text-sm" role="status">
          {notice.added && <p className="font-bold text-fresh">✓ {d.repeat_added}</p>}
          {notice.missing.length > 0 && (
            <p className="mt-1 text-aged"><b>{d.repeat_missing}:</b> {notice.missing.join(", ")}</p>
          )}
        </div>
      )}
      <div className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
        {(["all", ...present] as const).map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={cat === c}
            onClick={() => setCat(c)}
            className={`chip shrink-0 px-4 py-2.5 text-sm transition ${cat === c ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700"}`}
          >
            {c === "all" ? ({ uz: "Hammasi", ru: "Все", en: "All" }[lang]) : d[`cat_${c}`]}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((p) => {
          const first = p.batches[0];
          const inStock = p.batches.reduce((s, b) => s + b.available, 0);
          const q = first ? qtyOf(first.batch_id) : 0;
          return (
            <article key={p.product_id} className={`card flex flex-col overflow-hidden ${inStock ? "" : "opacity-90"}`}>
              <button onClick={() => setOpen(p)} className="relative text-left" aria-label={pick(p, "name", lang)}>
                <ProductArt category={p.category} image={p.image_url} alt={pick(p, "name", lang)} className={`aspect-[4/3] w-full ${inStock ? "" : "grayscale-[60%]"}`} />
                {first && <FreshChip iso={first.produced_at} lang={lang} className="absolute left-2 top-2" />}
                {p.batches.length > 1 && (
                  <span className="chip absolute right-2 top-2 bg-white/90 text-ink">+{p.batches.length - 1}</span>
                )}
              </button>
              <div className="flex flex-1 flex-col p-3">
                <button onClick={() => setOpen(p)} className="text-left">
                  <h3 className="text-[0.95rem] font-extrabold leading-snug">{pick(p, "name", lang)}</h3>
                  <p className="mt-0.5 text-xs font-semibold text-muted">
                    {p.size_label}
                    {inStock > 0 ? ` · ${d.in_stock}: ${inStock}` : ""}
                  </p>
                </button>
                <p className="mt-2 font-extrabold text-brand-700">{money(p.price, lang)}</p>
                <div className="mt-auto pt-3">
                  {first ? (
                    q > 0 ? (
                      <Stepper value={q} max={first.available} flash={justAdded === first.batch_id} onChange={(v) => setQty(first.batch_id, p.product_id, v)} />
                    ) : (
                      <button disabled={disabled} onClick={() => setQty(first.batch_id, p.product_id, 1)} className="btn btn-primary min-h-10 w-full text-sm">
                        {d.add}
                      </button>
                    )
                  ) : (
                    <button onClick={() => setOpen(p)} className="btn btn-soft min-h-10 w-full text-sm">
                      {d.preorder}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {islandItems.length > 0 && <CartIsland lang={lang} code={code} items={islandItems} setQty={setQty} />}

      {open && (
        <ProductSheet
          lang={lang}
          code={code}
          product={open}
          disabled={disabled}
          qtyOf={qtyOf}
          justAdded={justAdded}
          setQty={setQty}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function FreshChip({ iso, lang, className = "" }: { iso: string; lang: Lang; className?: string }) {
  const d = t(lang);
  const n = daysAgo(iso);
  if (n <= 0) return <span className={`chip bg-fresh-50 text-fresh ${className}`}>● {d.fresh}</span>;
  if (n === 1) return <span className={`chip bg-aged-50 text-aged ${className}`}>● {d.yesterday}</span>;
  return <span className={`chip bg-white/90 text-muted ${className}`}>{n} {d.days_ago}</span>;
}

export function Stepper({ value, max, onChange, flash = false }: { value: number; max: number; onChange: (v: number) => void; flash?: boolean }) {
  // flash: степпер только что появился вместо «Добавить» → на мгновение показываем галочку
  const [check, setCheck] = useState(flash);
  useEffect(() => {
    if (!check) return;
    const id = setTimeout(() => setCheck(false), 700);
    return () => clearTimeout(id);
  }, [check]);

  return (
    <div className={`flex h-10 items-center justify-between rounded-full p-1 transition-colors duration-300 ${check ? "animate-pop bg-fresh-50" : "bg-brand-50"}`}>
      <button aria-label="−" onClick={() => onChange(value - 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-extrabold text-brand-700 shadow-sm">−</button>
      <span className="flex min-w-6 justify-center font-extrabold" aria-live="polite">
        {check ? (
          <svg viewBox="0 0 24 24" className="animate-pop h-5 w-5 text-fresh" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path className="draw-check" d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <RollingNumber text={String(value)} />
        )}
      </span>
      <button aria-label="+" disabled={value >= max} onClick={() => onChange(value + 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-extrabold text-brand-700 shadow-sm disabled:opacity-40">+</button>
    </div>
  );
}

function ProductSheet({
  lang, code, product: p, disabled, qtyOf, justAdded, setQty, onClose,
}: {
  lang: Lang; code: string; product: CatalogProduct; disabled: boolean;
  qtyOf: (id: string) => number; justAdded: string | null; setQty: (b: string, p: string, q: number) => void; onClose: () => void;
}) {
  const d = t(lang);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={pick(p, "name", lang)}>
      <button aria-label={d.close} className="animate-fade absolute inset-0 bg-night/55" onClick={onClose} />
      <div className="animate-sheet relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] bg-white sm:rounded-[1.75rem]">
        <div className="relative">
          <ProductArt category={p.category} image={p.image_url} alt={pick(p, "name", lang)} className="aspect-[16/10] w-full" />
          <button onClick={onClose} aria-label={d.close} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-xl font-bold shadow">×</button>
        </div>
        <div className="safe-bottom p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">{pick(p, "name", lang)}</h2>
              <p className="mt-1 text-sm font-semibold text-muted">{p.size_label}</p>
            </div>
            <p className="font-display text-xl font-bold text-brand-700">{money(p.price, lang)}</p>
          </div>
          {pick(p, "description", lang) && <p className="mt-3 leading-relaxed text-ink/80">{pick(p, "description", lang)}</p>}

          {p.batches.length > 0 ? (
            <div className="mt-5">
              <h3 className="label">{d.choose_batch}</h3>
              <ul className="grid gap-2">
                {p.batches.map((b) => {
                  const q = qtyOf(b.batch_id);
                  return (
                    <li key={b.batch_id} className={`rounded-2xl border-[1.5px] p-3.5 ${q ? "border-brand-500 bg-brand-50/60" : "border-line"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <FreshChip iso={b.produced_at} lang={lang} />
                        <span className="text-xs font-bold text-muted">{d.left}: {b.available}</span>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                        <dt className="text-muted">{d.produced}</dt>
                        <dd className="text-right font-bold">{dateTime(b.produced_at, lang)}</dd>
                        <dt className="text-muted">{d.expires}</dt>
                        <dd className="text-right font-bold">{shortDate(b.expires_at, lang)}</dd>
                      </dl>
                      <div className="mt-3">
                        {q > 0 ? (
                          <Stepper value={q} max={b.available} flash={justAdded === b.batch_id} onChange={(v) => setQty(b.batch_id, p.product_id, v)} />
                        ) : (
                          <button disabled={disabled} onClick={() => setQty(b.batch_id, p.product_id, 1)} className="btn btn-primary min-h-10 w-full text-sm">{d.add}</button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <PreorderForm lang={lang} code={code} productId={p.product_id} />
          )}

          <dl className="mt-5 grid gap-3 text-sm">
            {pick(p, "composition", lang) && (
              <div><dt className="label mb-0.5">{d.composition}</dt><dd>{pick(p, "composition", lang)}</dd></div>
            )}
            {pick(p, "storage", lang) && (
              <div><dt className="label mb-0.5">{d.storage}</dt><dd>{pick(p, "storage", lang)}</dd></div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}

function PreorderForm({ lang, code, productId }: { lang: Lang; code: string; productId: string }) {
  const d = t(lang);
  const [phone, setPhone] = useState("");
  const [qty, setQ] = useState(1);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = normalizePhone(phone);
    if (!p) return setErr(d.err_INVALID_PHONE);
    setErr(null);
    setState("sending");
    const { error } = await browserClient().rpc("create_preorder", { p_fridge_code: code, p_phone: p, p_product_id: productId, p_qty: qty });
    if (error) {
      setErr(errorText(lang, error.message));
      setState("idle");
    } else setState("done");
  }

  if (state === "done") return <p className="mt-5 rounded-2xl bg-fresh-50 p-4 font-bold text-fresh">{d.preorder_done}</p>;

  return (
    <form onSubmit={submit} className="mt-5 rounded-2xl bg-brand-50 p-4">
      <p className="font-extrabold text-brand-900">{d.out_of_stock} · {d.preorder}</p>
      <p className="mt-1 text-sm text-muted">{d.preorder_text}</p>
      <label className="label mt-3" htmlFor="pre-phone">{d.phone}</label>
      <div className="flex gap-2">
        <span className="field flex w-auto items-center font-bold text-muted">+998</span>
        <input id="pre-phone" className="field" inputMode="tel" autoComplete="tel-national" placeholder="90 123 45 67" value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} required />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="w-36"><Stepper value={qty} max={20} onChange={(v) => setQ(Math.max(1, v))} /></div>
        <button className="btn btn-primary flex-1" disabled={state === "sending"}>{state === "sending" ? d.placing : d.preorder}</button>
      </div>
      {err && <p className="mt-2 text-sm font-bold text-danger" role="alert">{err}</p>}
    </form>
  );
}
