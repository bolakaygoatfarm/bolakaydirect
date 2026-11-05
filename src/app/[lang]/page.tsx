import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFridges, getProducts } from "@/lib/data";
import { t } from "@/lib/i18n";
import { isLang, type Category } from "@/lib/types";
import { ProductArt } from "@/components/ProductArt";
import { LogoMark } from "@/components/Logo";
import { PointCard } from "@/components/PointCard";
import { ProductCarousel } from "@/components/ProductCarousel";
import { Eyebrow, MilkBackdrop, Wave } from "@/components/Backdrop";
import { MilkScene } from "@/components/MilkScene";

const CATS: Category[] = ["milk", "yogurt", "butter", "drinks"];

const Arrow = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const H2 = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <h2 className={`font-display mt-3 text-[1.75rem] font-bold leading-tight text-brand-900 sm:text-4xl ${className}`}>{children}</h2>
);

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = t(lang);
  const [products, fridges] = await Promise.all([getProducts(), getFridges()]);
  // Сроки продажи по категориям — из реальных данных товаров (максимум в категории)
  const sellDays = CATS.flatMap((c) => {
    const n = Math.max(0, ...products.filter((p) => p.category === c).map((p) => p.sell_days));
    return n ? [[c, n] as const] : [];
  });

  // Фото для блока «Почему выбирают»: положите public/why.webp (или .jpg/.png) — заменит иллюстрацию
  const whyPhoto = ["why.webp", "why.jpg", "why.jpeg", "why.png"].find((f) => existsSync(join(process.cwd(), "public", f)));
  // Фото категорий на первом экране — берутся из первых товаров категории с загруженным фото
  const catImage = (c: Category) => products.find((p) => p.category === c && p.image_url)?.image_url ?? null;

  // Два последних слова заголовка — под тёплым маркером («один день» / «bir kun»)
  const words = d.hero_title.split(" ");
  const titleHead = words.slice(0, -2).join(" ");
  const titleTail = words.slice(-2).join(" ");

  const perks = [
    { t: d.why_1, s: d.why_1_d, icon: <path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14Zm0 0 7-7" /> },
    { t: d.why_2, s: d.why_2_d, icon: <><path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6Z" /><path d="m9 12 2 2 4-4" /></> },
    { t: d.why_3, s: d.why_3_d, icon: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2" /></> },
  ];

  return (
    <>
      {/* HERO — молочные волны */}
      <section className="relative -mt-16 overflow-hidden pt-16">
        <MilkBackdrop />
        <div className="relative mx-auto grid max-w-5xl items-center gap-10 px-4 pb-28 pt-10 md:grid-cols-[1.3fr_1fr] md:pb-36 md:pt-16">
          <div className="animate-rise">
            <span className="eyebrow">
              <span className="h-2 w-2 rounded-full bg-fresh" /> BOLAKAY DIRECT · Toshkent
            </span>
            <h1 className="font-display mt-5 text-[2.1rem] font-bold leading-[1.08] text-brand-900 sm:text-5xl lg:text-[3.1rem]">
              {titleHead} <span className="hl">{titleTail}</span>
            </h1>
            <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-ink/75">{d.hero_text}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/${lang}/points`} className="btn btn-primary px-6 shadow-[0_12px_24px_-12px_rgb(10_123_191/0.8)]">
                {d.hero_cta} <Arrow />
              </Link>
              <a href="#how" className="btn glass text-ink">{d.hero_cta2}</a>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-sm animate-rise [animation-delay:120ms]">
            <div className="grid grid-cols-2 gap-3">
              {CATS.map((c, i) => (
                <div key={c} className={`glass overflow-hidden rounded-[1.5rem] p-1.5 ${i % 2 ? "translate-y-5" : ""}`}>
                  <ProductArt category={c} image={catImage(c)} alt={d[`cat_${c}`]} className="aspect-[1/0.95] w-full rounded-[1.1rem]" />
                  <p className="px-2 pb-1.5 pt-2.5 text-sm font-bold">{d[`cat_${c}`]}</p>
                </div>
              ))}
            </div>
            <div className="glass absolute -bottom-12 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold">
              <LogoMark className="h-6 w-6" /> {d.farm_p2}
            </div>
          </div>
        </div>
      </section>

      {/* ПРОДУКЦИЯ — карусель на молочном фоне */}
      <section className="relative overflow-hidden">
        <MilkBackdrop variant="soft" />
        <div className="relative mx-auto max-w-5xl px-4 pt-12">
          <Eyebrow>{d.eb_products}</Eyebrow>
          <H2>{d.catalog_title}</H2>
          <p className="mt-3 max-w-xl text-ink/70">{d.catalog_hint}</p>
        </div>
        <div className="relative mx-auto max-w-6xl pb-24 pt-6 md:pb-32">
          <ProductCarousel lang={lang} products={products} />
        </div>
      </section>

      {/* ПОЧЕМУ ВЫБИРАЮТ */}
      <section className="relative overflow-hidden why-bg">
        <div className="relative mx-auto grid max-w-5xl items-center gap-8 px-4 py-16 md:grid-cols-[1fr_1.1fr]">
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
            <a href="#farm" className="btn btn-butter mt-8 px-6">{d.more} <Arrow /></a>
          </div>
          <div className="relative">
            <div aria-hidden className="absolute inset-10 rounded-full bg-brand-200/45 blur-3xl" />
            <div aria-hidden className="absolute bottom-6 right-6 h-40 w-40 rounded-full bg-butter-100/80 blur-3xl" />
            {whyPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element -- статичное фото из /public, размер задаётся вёрсткой
              <img src={`/${whyPhoto}`} alt={d.why_title} loading="lazy" className="relative mx-auto aspect-[5/4] w-full max-w-lg rounded-[2rem] object-cover shadow-[0_30px_60px_-30px_rgb(10_91_150/0.45)]" />
            ) : (
              <MilkScene className="relative mx-auto w-full max-w-lg" />
            )}
          </div>
        </div>
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

      {/* КАК ЭТО РАБОТАЕТ */}
      <section id="how" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-14">
        <Eyebrow>{d.eb_how}</Eyebrow>
        <H2>{d.how_title}</H2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <li key={n} className="reveal rounded-[1.5rem] step-card p-5 ring-1 ring-brand-100">
              <span className="font-display flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-b from-[#ffd27a] to-butter text-lg font-bold text-brand-900 shadow-[0_8px_18px_-8px_rgb(190_120_0/0.7)]">{n}</span>
              <h3 className="mt-4 text-lg font-extrabold">{d[`how_${n}_t` as keyof typeof d]}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{d[`how_${n}_d` as keyof typeof d]}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* О ФЕРМЕ */}
      <section id="farm" className="mx-auto grid max-w-5xl scroll-mt-20 gap-8 px-4 pb-14 md:grid-cols-2 md:items-center">
        <div>
          <H2 className="mt-0">{d.farm_title}</H2>
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

      {/* ТОЧКИ */}
      <section className="relative overflow-hidden">
        <MilkBackdrop variant="soft" />
        <div className="relative mx-auto max-w-5xl px-4 pb-28 pt-14 md:pb-36">
          <Eyebrow>{d.eb_points}</Eyebrow>
          <H2>{d.points_title}</H2>
          <p className="mt-3 max-w-xl text-ink/70">{d.points_text}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {fridges.map((f) => (
              <PointCard key={f.id} fridge={f} lang={lang} />
            ))}
          </div>
        </div>
      </section>

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

      {/* ФИНАЛЬНЫЙ ПРИЗЫВ */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="reveal grain relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 px-6 py-12 text-center text-white shadow-[0_30px_60px_-24px_rgb(4_169_228/0.55)] sm:px-12">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/15 blur-2xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-butter/30 blur-3xl" />
          <LogoMark className="relative mx-auto h-16 w-16 ring-4 ring-white/25" />
          <h2 className="font-display relative mx-auto mt-5 max-w-xl text-2xl font-bold sm:text-3xl">{d.cta_title}</h2>
          <p className="relative mx-auto mt-3 max-w-md text-white/80">{d.cta_text}</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href={`/${lang}/points`} className="btn btn-butter px-6">{d.hero_cta} <Arrow /></Link>
            <Link href={`/${lang}/orders`} className="btn border border-white/30 text-white hover:bg-white/10">{d.nav_orders}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
