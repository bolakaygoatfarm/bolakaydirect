"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { money, pick } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { CatalogBatch, CatalogProduct, Lang } from "@/lib/types";
import { RollingNumber } from "./RollingNumber";

export interface IslandItem {
  batch: CatalogBatch;
  product: CatalogProduct;
  qty: number;
}

/**
 * «Динамический остров» корзины: плашка внизу экрана с количеством и суммой.
 * Нажатие раскрывает мини-корзину, где можно поменять количество, не уходя с витрины.
 */
export function CartIsland({
  lang, code, items, setQty,
}: {
  lang: Lang; code: string; items: IslandItem[];
  setQty: (batchId: string, productId: string, qty: number) => void;
}) {
  const d = t(lang);
  const [open, setOpen] = useState(false);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.product.price * i.qty, 0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && <button aria-label={d.close} tabIndex={-1} className="animate-fade fixed inset-0 z-30 bg-night/50" onClick={() => setOpen(false)} />}
      <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pt-3">
        <div
          data-open={open}
          className="island animate-island pointer-events-auto mx-auto max-w-md bg-night text-white ring-1 ring-white/10 shadow-[var(--shadow-float)]"
        >
          <div className="island-body" id="cart-island-list">
            <div className="min-h-0 overflow-hidden">
              <div className="px-4 pb-1 pt-4">
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/60">{d.cart}</p>
                <ul className="no-scrollbar mt-2 max-h-[45dvh] divide-y divide-white/10 overflow-y-auto">
                  {items.map((i) => (
                    <li key={i.batch.batch_id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{pick(i.product, "name", lang)}</p>
                        <p className="text-xs text-white/60">
                          {i.product.size_label} · {money(i.product.price, lang)}
                        </p>
                      </div>
                      <div className="flex h-9 items-center gap-1 rounded-full bg-white/10 p-0.5">
                        <button
                          aria-label="−"
                          onClick={() => setQty(i.batch.batch_id, i.product.product_id, i.qty - 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-extrabold hover:bg-white/15"
                        >−</button>
                        <RollingNumber text={String(i.qty)} className="min-w-5 justify-center text-sm font-extrabold" />
                        <button
                          aria-label="+"
                          disabled={i.qty >= i.batch.available}
                          onClick={() => setQty(i.batch.batch_id, i.product.product_id, i.qty + 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-extrabold hover:bg-white/15 disabled:opacity-35"
                        >+</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2">
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="cart-island-list"
              aria-label={open ? d.cart_hide : d.cart_show}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-full py-1 pl-1 pr-2 text-left transition hover:bg-white/5"
            >
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 7h12l-1 13H7L6 7Z" /><path d="M9 7a3 3 0 0 1 6 0" />
                </svg>
                <span key={count} className="animate-bump absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[0.7rem] font-extrabold text-brand-700">
                  <RollingNumber text={String(count)} />
                </span>
              </span>
              <span className="min-w-0 leading-tight">
                <span className="flex items-center gap-1 text-xs font-bold text-white/65">
                  {d.cart}
                  <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="m6 15 6-6 6 6" />
                  </svg>
                </span>
                <RollingNumber text={money(total, lang)} className="text-base font-extrabold" />
              </span>
            </button>
            <Link href={`/${lang}/checkout?point=${encodeURIComponent(code)}`} className="btn min-h-11 shrink-0 bg-white px-5 text-brand-700">
              {d.to_checkout} →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
