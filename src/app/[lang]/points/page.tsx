import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFridges } from "@/lib/data";
import { t } from "@/lib/i18n";
import { isLang } from "@/lib/types";
import { PointCard } from "@/components/PointCard";

export async function generateMetadata({ params }: PageProps<"/[lang]/points">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return { title: t(lang).points_title, alternates: { canonical: `/${lang}/points`, languages: { uz: "/uz/points", ru: "/ru/points", en: "/en/points" } } };
}

export default async function PointsPage({ params }: PageProps<"/[lang]/points">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = t(lang);
  const fridges = await getFridges();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-brand-900">{d.points_title}</h1>
      <p className="mt-3 max-w-xl text-muted">{d.points_text}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {fridges.map((f) => (
          <PointCard key={f.id} fridge={f} lang={lang} />
        ))}
      </div>
    </div>
  );
}
