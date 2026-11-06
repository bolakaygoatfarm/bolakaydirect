import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { Eyebrow } from "./Backdrop";
import { H2 } from "./Section";

/**
 * «Почему выбирают BOLAKAY DIRECT»: три преимущества и фото продукции (public/why.webp).
 * Серверный компонент: на главной и на /about. Фон задаёт секция снаружи.
 */
export function WhyBlock({ lang, className = "py-14" }: { lang: Lang; className?: string }) {
  const d = t(lang);
  const perks = [
    { t: d.why_1, s: d.why_1_d, icon: <path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14Zm0 0 7-7" /> },
    { t: d.why_2, s: d.why_2_d, icon: <><path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6Z" /><path d="m9 12 2 2 4-4" /></> },
    { t: d.why_3, s: d.why_3_d, icon: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2" /></> },
  ];

  return (
    <div className={`relative mx-auto grid max-w-5xl items-center gap-8 px-4 md:grid-cols-[1fr_1.1fr] ${className}`}>
      <div className="reveal">
        <Eyebrow>{d.eb_why}</Eyebrow>
        <H2>{d.why_title}</H2>
        <p className="mt-3 max-w-md text-lg text-ink/75">{d.why_text}</p>
        <ul className="mt-7 grid gap-4">
          {perks.map((p) => (
            <li key={p.t} className="flex items-center gap-4">
              <span className="perk-icon">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p.icon}</svg>
              </span>
              <span>
                <span className="block font-extrabold text-ink">{p.t}</span>
                <span className="block text-sm text-muted">{p.s}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative">
        <div aria-hidden className="absolute inset-10 rounded-full bg-brand-200/45 blur-3xl" />
        <div aria-hidden className="absolute bottom-6 right-6 h-40 w-40 rounded-full bg-butter-100/80 blur-3xl" />
        {/* Фото с прозрачным фоном: без обрезки и рамки, width/height резервируют место до загрузки */}
        {/* eslint-disable-next-line @next/next/no-img-element -- статичное фото из /public, размер задаётся вёрсткой */}
        <img src="/why.webp" alt={d.why_photo_alt} width={1024} height={1013} loading="lazy" decoding="async" className="relative mx-auto h-auto w-full max-w-lg drop-shadow-[0_24px_30px_rgb(10_39_71/0.28)]" />
      </div>
    </div>
  );
}
