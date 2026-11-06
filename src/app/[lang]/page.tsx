import Link from "next/link";
import { notFound } from "next/navigation";
import { getProducts } from "@/lib/data";
import { t } from "@/lib/i18n";
import { isLang } from "@/lib/types";
import { HeroScrub } from "@/components/HeroScrub";
import { ProductCarousel } from "@/components/ProductCarousel";
import { WhyBlock } from "@/components/WhyBlock";
import { Eyebrow, MilkBackdrop } from "@/components/Backdrop";
import { Arrow, H2 } from "@/components/Section";

/**
 * Главная для тех, кто пришёл не по QR: что продаём → выбрать точку → ассортимент → почему мы → три шага → о ферме.
 * Подробности о ферме, качестве и вопросы — на /about. По QR покупатель сразу попадает на витрину точки.
 */
export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = t(lang);
  const products = await getProducts();
  // Два последних слова заголовка — под тёплым маркером («один день» / «bir kun»)
  const words = d.hero_title.split(" ");
  const titleHead = words.slice(0, -2).join(" ");
  const titleTail = words.slice(-2).join(" ");

  return (
    <>
      {/* ЧТО ПРОДАЁМ + ВЫБОР ТОЧКИ: видео молока управляется прокруткой */}
      <HeroScrub hint={d.scroll_hint}>
        <div className="max-w-xl animate-rise md:max-w-[34rem]">
          <span className="eyebrow">
            <span className="h-2 w-2 rounded-full bg-fresh" /> BOLAKAY DIRECT · Toshkent
          </span>
          <h1 className="font-display mt-5 text-[2.35rem] font-bold leading-[1.06] text-white sm:text-[3.4rem]">
            {titleHead} <span className="hl hl--thin">{titleTail}</span>
          </h1>
          <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-white/85">{d.hero_text}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={`/${lang}/points`} className="btn btn-butter px-6">
              {d.hero_cta} <Arrow />
            </Link>
            <a href="#how" className="btn border border-white/40 bg-[#0a2747]/55 text-white hover:bg-[#0a2747]/75">{d.hero_cta2}</a>
          </div>
        </div>
      </HeroScrub>

      {/* АССОРТИМЕНТ */}
      <section className="relative overflow-hidden">
        <MilkBackdrop variant="soft" />
        <div className="relative mx-auto max-w-5xl px-4 pt-8">
          <H2 className="mt-0">{d.catalog_title}</H2>
          <p className="mt-3 max-w-xl text-ink/70">{d.catalog_hint}</p>
        </div>
        <div className="relative mx-auto max-w-6xl pb-16 pt-4 md:pb-20">
          <ProductCarousel lang={lang} products={products} />
        </div>
      </section>

      {/* ПОЧЕМУ ВЫБИРАЮТ */}
      <section>
        <WhyBlock lang={lang} className="pb-10 pt-6" />
      </section>

      {/* ТРИ ШАГА */}
      <section id="how" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-10">
        <Eyebrow>{d.eb_how}</Eyebrow>
        <H2>{d.how_title}</H2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
          {[1, 2, 3].map((n) => (
            <li key={n} className="reveal rounded-[1.5rem] step-card p-5 ring-1 ring-brand-100">
              <span className="font-display flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-b from-[#ffd27a] to-butter text-lg font-bold text-[#0a2747]">{n}</span>
              <h3 className="mt-3 text-lg font-extrabold">{d[`how_${n}_t` as keyof typeof d]}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{d[`how_${n}_d` as keyof typeof d]}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* КОРОТКО О ФЕРМЕ (контакты — в подвале) */}
      <section className="mx-auto max-w-5xl px-4 pb-14 pt-2">
        <div className="rounded-[1.5rem] bg-brand-50 p-6 sm:p-8">
          <H2 className="mt-0 text-2xl sm:text-3xl">{d.farm_title}</H2>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted">{d.farm_text}</p>
          <Link href={`/${lang}/about`} className="mt-4 inline-flex items-center gap-2 font-bold text-brand-700 hover:underline">
            {d.about_more} <Arrow />
          </Link>
        </div>
      </section>
    </>
  );
}
