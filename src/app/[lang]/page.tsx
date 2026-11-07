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
  // Заголовок с разметкой: "\n" — перенос строки, [текст] — под тёплым маркером
  const titleLines = d.hero_title.split("\n").map((line, i) => (
    <span key={i} className="block">
      {line.split(/(\[[^\]]+\])/).map((part, j) =>
        part.startsWith("[") ? (
          <span key={j} className="hl hl--thin">{part.slice(1, -1)}</span>
        ) : (
          // Слова через дефис («когда-либо») не рвём на узком экране
          part.split(/(\S+-\S+)/).map((w, k) =>
            k % 2 ? <span key={`${j}-${k}`} className="whitespace-nowrap">{w}</span> : w,
          )
        ),
      )}
    </span>
  ));

  return (
    <>
      {/* ЧТО ПРОДАЁМ + ВЫБОР ТОЧКИ: видео всплеска на фоне */}
      <HeroScrub>
        <div className="max-w-xl animate-rise md:max-w-[34rem]">
          <span className="eyebrow">
            <span className="h-2 w-2 rounded-full bg-fresh" /> BOLAKAY DIRECT · Toshkent
          </span>
          <h1 className="font-display mt-5 text-[clamp(2.1rem,9vw,2.6rem)] font-bold leading-[1.08] text-white [overflow-wrap:break-word] sm:text-[3.4rem] md:text-[3.6rem]">
            {titleLines}
          </h1>
          <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-white/85">{d.hero_text}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#catalog" className="btn btn-butter px-6">
              {d.hero_cta} <Arrow />
            </a>
            <Link href={`/${lang}/points`} className="btn border border-white/40 bg-[#0a2747]/55 text-white hover:bg-[#0a2747]/75">
              {d.hero_cta2}
            </Link>
          </div>
        </div>
      </HeroScrub>

      {/* АССОРТИМЕНТ */}
      <section id="catalog" className="relative scroll-mt-20 overflow-hidden">
        <MilkBackdrop />
        <div className="relative mx-auto max-w-5xl px-4 pt-8">
          <H2 className="mt-0">{d.catalog_title}</H2>
          <p className="mt-3 max-w-xl text-ink/70">{d.catalog_hint}</p>
        </div>
        <div className="relative mx-auto max-w-6xl pb-16 pt-4 md:pb-20">
          <ProductCarousel lang={lang} products={products} />
        </div>
      </section>

      {/* ПОЧЕМУ ВЫБИРАЮТ */}
      <section className="why-bg">
        <WhyBlock lang={lang} className="pb-20 pt-16" />
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
