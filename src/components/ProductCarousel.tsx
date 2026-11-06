"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { money, pick, sizeLabel } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Lang, Product } from "@/lib/types";
import { ProductArt } from "./ProductArt";

/**
 * Карусель продукции «в фокусе» — по мотивам Watermelon Wiggling Cards, но спокойная:
 * без наклона и тряски. Центральная карточка чёткая, соседние уменьшаются, бледнеют и
 * слегка размываются в зависимости от расстояния до центра.
 * Прокрутка — нативная (scroll-snap): на телефоне свайп с инерцией, на компьютере
 * стрелки, точки, перетаскивание мышью и колесо с Shift.
 */
export function ProductCarousel({ lang, products }: { lang: Lang; products: Product[] }) {
  const d = t(lang);
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);

  // Пересчёт «фокуса» каждой карточки по её расстоянию до центра ленты
  const paint = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = window.matchMedia("(hover: none)").matches;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    Array.from(el.children).forEach((node, i) => {
      const card = node as HTMLElement;
      const center = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(center - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
      const k = Math.min(dist / (card.offsetWidth + 24), 1.4); // 0 — в центре, 1 — соседняя
      const inner = card.firstElementChild as HTMLElement;
      if (reduce) {
        inner.style.opacity = k > 0.5 ? "0.6" : "1";
        return;
      }
      inner.style.transform = `scale(${1 - 0.1 * Math.min(k, 1)})`;
      inner.style.opacity = String(1 - 0.5 * Math.min(k, 1));
      // Размытие — только на компьютере: на телефоне при свайпе оно дорого обходится
      if (!touch) inner.style.filter = k > 0.05 ? `blur(${(2.5 * Math.min(k, 1)).toFixed(2)}px)` : "none";
    });
    if (best !== activeRef.current) {
      activeRef.current = best;
      setActive(best);
    }
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    };
    // Стартуем со второй карточки, чтобы сразу было видно соседей с обеих сторон
    const start = el.children[Math.min(1, el.children.length - 1)] as HTMLElement | undefined;
    if (start) el.scrollLeft = start.offsetLeft + start.offsetWidth / 2 - el.clientWidth / 2;
    paint();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [paint]);

  const goTo = (i: number) => {
    const el = track.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2, behavior: "smooth" });
  };

  // Перетаскивание мышью (на телефоне работает обычный свайп)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !track.current) return;
    drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false };
    track.current.classList.add("is-dragging");
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = drag.current;
    if (!s || !track.current) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 4) s.moved = true;
    track.current.scrollLeft = s.left - dx;
  };
  const suppressClick = useRef(false);
  const endDrag = () => {
    const s = drag.current;
    if (!s || !track.current) return;
    drag.current = null;
    track.current.classList.remove("is-dragging");
    suppressClick.current = s.moved; // после перетаскивания клик по ссылке не срабатывает
    if (s.moved) goTo(activeRef.current);
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick.current = false;
    }
  };

  return (
    <div className="relative" role="region" aria-roledescription="carousel" aria-label={d.catalog_title}>
      <div
        ref={track}
        className="focus-track no-scrollbar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
      >
        {products.map((p, i) => (
          <div key={p.id} className="focus-slide" aria-roledescription="slide" aria-label={`${i + 1} / ${products.length}`}>
            <article className="focus-card glass-card flex h-full flex-col overflow-hidden">
              <ProductArt category={p.category} image={p.image_url} alt={pick(p, "name", lang)} className="aspect-[4/3] w-full rounded-[1.15rem]" />
              <div className="flex flex-1 flex-col p-4">
                <span className="chip w-fit bg-brand-50 text-brand-700">{d[`cat_${p.category}`]}</span>
                <h3 className="mt-3 text-lg font-extrabold leading-snug">{pick(p, "name", lang)}</h3>
                <p className="mt-0.5 text-sm font-semibold text-muted">
                  {sizeLabel(p.size_label, lang)} · {d.sell_days_label}: {p.sell_days} {d.days_short}
                </p>
                <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                  <p className="font-display text-xl font-bold text-brand-700">{money(p.price, lang)}</p>
                  <Link
                    href={`/${lang}/points`}
                    tabIndex={i === active ? 0 : -1}
                    draggable={false}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700"
                    aria-label={`${pick(p, "name", lang)} — ${d.hero_cta}`}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M7 17 17 7M9 7h8v8" />
                    </svg>
                  </Link>
                </div>
              </div>
            </article>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        <button onClick={() => goTo(Math.max(0, active - 1))} disabled={active === 0} aria-label={d.prev} className="carousel-arrow">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <div className="flex gap-2">
          {products.map((p, i) => (
            <button
              key={p.id}
              onClick={() => goTo(i)}
              aria-label={`${i + 1}: ${pick(p, "name", lang)}`}
              aria-current={i === active}
              className={`h-2.5 rounded-full transition-all duration-300 ${i === active ? "w-7 bg-brand-600" : "w-2.5 bg-brand-200 hover:bg-brand-400"}`}
            />
          ))}
        </div>
        <button onClick={() => goTo(Math.min(products.length - 1, active + 1))} disabled={active === products.length - 1} aria-label={d.next} className="carousel-arrow">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}
