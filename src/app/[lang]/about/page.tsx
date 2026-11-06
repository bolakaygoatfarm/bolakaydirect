import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProducts } from "@/lib/data";
import { t } from "@/lib/i18n";
import { isLang, type Category } from "@/lib/types";
import { LogoMark } from "@/components/Logo";
import { Eyebrow, Wave } from "@/components/Backdrop";
import { WhyBlock } from "@/components/WhyBlock";
import { Arrow, H2 } from "@/components/Section";

const CATS: Category[] = ["milk", "yogurt", "butter", "drinks"];

export async function generateMetadata({ params }: PageProps<"/[lang]/about">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return { title: t(lang).about_title, alternates: { canonical: `/${lang}/about`, languages: { uz: "/uz/about", ru: "/ru/about", en: "/en/about" } } };
}

/** Подробности о ферме и качестве: вынесено с главной, чтобы покупатель быстрее дошёл до витрины. */
export default async function AboutPage({ params }: PageProps<"/[lang]/about">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = t(lang);
  const products = await getProducts();
  // Сроки продажи по категориям — из реальных данных товаров (максимум в категории)
  const sellDays = CATS.flatMap((c) => {
    const n = Math.max(0, ...products.filter((p) => p.category === c).map((p) => p.sell_days));
    return n ? [[c, n] as const] : [];
  });

  return (
    <>
      {/* О ФЕРМЕ */}
      <section className="mx-auto grid max-w-5xl gap-8 px-4 py-12 md:grid-cols-2 md:items-center">
        <div>
          <h1 className="font-display text-[1.9rem] font-bold leading-tight text-brand-900 sm:text-4xl">{d.about_title}</h1>
          <p className="mt-4 leading-relaxed text-muted">{d.farm_text}</p>
        </div>
        <ul className="grid gap-3">
          {[d.farm_p1, d.farm_p2, d.farm_p3].map((s) => (
            <li key={s} className="flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3.5 font-bold text-brand-900">
              <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-brand-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              {s}
            </li>
          ))}
        </ul>
      </section>

      {/* ПОЧЕМУ ВЫБИРАЮТ */}
      <section className="relative overflow-hidden why-bg">
        <WhyBlock lang={lang} />
      </section>

      {/* СВЕЖЕСТЬ — тёмная секция */}
      <Wave className="bg-butter-50 text-night" />
      <section className="night">
        <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-8">
          <div className="reveal grid gap-10 md:grid-cols-[1fr_1.05fr] md:items-center">
            <div>
              <Eyebrow dark>{d.fresh}</Eyebrow>
              <h2 className="font-display mt-4 text-[1.75rem] font-bold leading-tight sm:text-4xl">{d.fresh_title}</h2>
              <p className="mt-4 leading-relaxed text-white/75">{d.fresh_text}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur">
                  <p className="font-display text-2xl font-bold text-brand-400">{d.fresh_temp_t}</p>
                  <p className="mt-1 text-sm text-white/70">{d.fresh_temp_d}</p>
                </div>
                <div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur">
                  <p className="font-extrabold text-white">{d.fresh_lots_t}</p>
                  <p className="mt-1 text-sm text-white/70">{d.fresh_lots_d}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] bg-white p-5 text-ink shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)] sm:p-6">
              <p className="label">{d.fresh_milk_note}</p>
              <ol className="relative mt-3 grid gap-5 border-l-2 border-line pl-6">
                {([
                  [d.fresh_day1, d.fresh_day1_d, "bg-fresh"],
                  [d.fresh_day2, d.fresh_day2_d, "bg-butter"],
                  [d.fresh_day3, d.fresh_day3_d, "bg-danger"],
                ] as const).map(([day, text, dot]) => (
                  <li key={day} className="relative">
                    <span className={`absolute -left-[1.95rem] top-1 h-3.5 w-3.5 rounded-full ring-4 ring-white ${dot}`} />
                    <p className="font-extrabold">{day}</p>
                    <p className="text-sm text-muted">{text}</p>
                  </li>
                ))}
              </ol>
              <p className="label mt-6">{d.fresh_by_cat}</p>
              <ul className="grid grid-cols-2 gap-2 text-sm">
                {sellDays.map(([c, n]) => (
                  <li key={c} className="flex items-center justify-between gap-2 rounded-xl bg-milk px-3 py-2.5">
                    <span className="truncate font-bold">{d[`cat_${c}`]}</span>
                    <span className="shrink-0 font-extrabold text-brand-700">{n} {d.days_short}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
      <Wave flip className="bg-page text-night" />

      {/* ЧАСТЫЕ ВОПРОСЫ */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <div className="text-center">
          <Eyebrow>{d.eb_faq}</Eyebrow>
          <H2>{d.faq_title}</H2>
        </div>
        <div className="mt-8 grid gap-3">
          {([1, 2, 3, 4, 5, 6] as const).map((n) => (
            <details key={n} className="faq group rounded-2xl bg-brand-50/60 px-5 ring-1 ring-brand-100 open:bg-white open:shadow-[var(--shadow-card)]" name="faq">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-extrabold">
                {d[`faq_${n}_q`]}
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-butter-100 text-butter-700 transition-transform duration-300 group-open:rotate-45">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </span>
              </summary>
              <p className="pb-5 leading-relaxed text-muted">{d[`faq_${n}_a`]}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ПРИЗЫВ */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="reveal grain relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 px-6 py-12 text-center text-white shadow-[0_30px_60px_-24px_rgb(4_169_228/0.55)] sm:px-12">
          <LogoMark className="relative mx-auto h-16 w-16 ring-4 ring-white/25" />
          <h2 className="font-display relative mx-auto mt-5 max-w-xl text-2xl font-bold sm:text-3xl">{d.cta_title}</h2>
          <p className="relative mx-auto mt-3 max-w-md text-white/80">{d.cta_text}</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href={`/${lang}/points`} className="btn btn-butter px-6">{d.hero_cta} <Arrow /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
