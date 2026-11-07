import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCatalog, getFridge } from "@/lib/data";
import { t } from "@/lib/i18n";
import { pick } from "@/lib/format";
import { isLang, type Lang } from "@/lib/types";
import { PointCatalog } from "@/components/PointCatalog";
import { mapUrl } from "@/components/PointCard";

export async function generateMetadata({ params }: PageProps<"/[lang]/point/[code]">): Promise<Metadata> {
  const { lang, code } = await params;
  if (!isLang(lang)) return {};
  const f = await getFridge(code);
  return {
    title: f ? `${t(lang).point} ${f.name}` : t(lang).not_found_point,
    alternates: { canonical: `/${lang}/point/${code}`, languages: { uz: `/uz/point/${code}`, ru: `/ru/point/${code}`, en: `/en/point/${code}` } },
  };
}

export default function PointPage({ params }: PageProps<"/[lang]/point/[code]">) {
  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <PointContent params={params} />
    </Suspense>
  );
}

async function PointContent({ params }: { params: PageProps<"/[lang]/point/[code]">["params"] }) {
  const { lang, code } = await params;
  if (!isLang(lang)) notFound();
  const fridge = await getFridge(code);
  if (!fridge) notFound();
  const products = await getCatalog(code);
  const d = t(lang as Lang);
  const map = mapUrl(fridge);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-36 pt-6">
      <section className="grain relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-5 text-white shadow-[var(--shadow-float)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-white/70">{d.points_title}</p>
        <h1 className="font-display mt-1.5 text-2xl font-bold">{fridge.name}</h1>
        <p className="mt-2 text-sm text-white/85">{pick(fridge, "address", lang)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="chip bg-white/15 text-white">
            {d.open_hours}: {fridge.open_time.slice(0, 5)}–{fridge.close_time.slice(0, 5)}
          </span>
          {fridge.status === "maintenance" && <span className="chip bg-aged-50 text-aged">{d.status_maintenance}</span>}
          {map && (
            <a href={map} target="_blank" rel="noopener noreferrer" className="chip bg-white text-brand-700">
              {d.on_map} ↗
            </a>
          )}
        </div>
      </section>
      <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <b>{d.important}:</b> {d.self_service_note}
      </p>
      <PointCatalog lang={lang} code={code} products={products} disabled={fridge.status !== "active"} />
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 pt-6" aria-busy="true">
      <div className="h-36 rounded-[1.5rem] bg-brand-100" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-56 rounded-[1.25rem] bg-brand-50" />
        ))}
      </div>
      <Link href="/" className="sr-only">BOLAKAY</Link>
    </div>
  );
}
