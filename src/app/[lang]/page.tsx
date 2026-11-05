import Link from "next/link";
import { notFound } from "next/navigation";
import { getFridges, getProducts } from "@/lib/data";
import { t } from "@/lib/i18n";
import { money, pick } from "@/lib/format";
import { isLang, type Category, type Lang } from "@/lib/types";
import { ProductArt } from "@/components/ProductArt";
import { LogoMark } from "@/components/Logo";
import { PointCard } from "@/components/PointCard";

const CATS: Category[] = ["milk", "yogurt", "butter", "drinks"];

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = t(lang);
  const [products, fridges] = await Promise.all([getProducts(), getFridges()]);

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-100/70 blur-2xl" />
        <div className="relative mx-auto grid max-w-5xl items-center gap-10 px-4 pb-14 pt-10 md:grid-cols-[1.15fr_1fr] md:pt-16">
          <div className="animate-rise">
            <span className="chip bg-white text-brand-700 shadow-sm ring-1 ring-brand-100">
              <span className="h-2 w-2 rounded-full bg-fresh" /> BOLAKAY DIRECT · Toshkent
            </span>
            <h1 className="font-display mt-5 text-[2rem] font-bold leading-[1.1] text-brand-900 sm:text-5xl">{d.hero_title}</h1>
            <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-muted">{d.hero_text}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/${lang}/points`} className="btn btn-primary px-6">{d.hero_cta}</Link>
              <a href="#how" className="btn btn-ghost">{d.hero_cta2}</a>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-sm animate-rise [animation-delay:120ms]">
            <div className="grid grid-cols-2 gap-3">
              {CATS.map((c, i) => (
                <div key={c} className={`overflow-hidden rounded-[1.5rem] bg-white shadow-[var(--shadow-card)] ring-1 ring-line ${i % 2 ? "translate-y-6" : ""}`}>
                  <ProductArt category={c} alt={d[`cat_${c}`]} className="aspect-square w-full" />
                  <p className="px-3 py-2.5 text-sm font-bold">{d[`cat_${c}`]}</p>
                </div>
              ))}
            </div>
            <div className="absolute -bottom-4 -left-3 hidden items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-bold shadow-[var(--shadow-float)] ring-1 ring-line sm:flex">
              <LogoMark className="h-7 w-7" /> {d.farm_p2}
            </div>
          </div>
        </div>
      </section>

      {/* КАК ЭТО РАБОТАЕТ */}
      <section id="how" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-14">
        <h2 className="font-display text-2xl font-bold text-brand-900 sm:text-3xl">{d.how_title}</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <li key={n} className="card p-5">
              <span className="font-display flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">{n}</span>
              <h3 className="mt-4 text-lg font-extrabold">{d[`how_${n}_t` as keyof typeof d]}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{d[`how_${n}_d` as keyof typeof d]}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* КАТАЛОГ */}
      <section className="bg-milk">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="font-display text-2xl font-bold text-brand-900 sm:text-3xl">{d.catalog_title}</h2>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <article key={p.id} className="card overflow-hidden">
                <ProductArt category={p.category} image={p.image_url} alt={pick(p, "name", lang)} className="aspect-[4/3] w-full" />
                <div className="p-3.5">
                  <h3 className="text-[0.95rem] font-extrabold leading-snug">{pick(p, "name", lang)}</h3>
                  <p className="mt-0.5 text-xs font-semibold text-muted">{p.size_label}</p>
                  <p className="mt-2 font-extrabold text-brand-700">{money(p.price, lang as Lang)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* О ФЕРМЕ */}
      <section id="farm" className="mx-auto grid max-w-5xl scroll-mt-20 gap-8 px-4 py-14 md:grid-cols-2 md:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-brand-900 sm:text-3xl">{d.farm_title}</h2>
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
      <section className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="font-display text-2xl font-bold text-brand-900 sm:text-3xl">{d.points_title}</h2>
          <p className="mt-3 max-w-xl text-muted">{d.points_text}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {fridges.map((f) => (
              <PointCard key={f.id} fridge={f} lang={lang} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
