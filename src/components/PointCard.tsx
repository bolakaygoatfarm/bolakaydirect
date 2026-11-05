import Link from "next/link";
import { t } from "@/lib/i18n";
import { pick } from "@/lib/format";
import type { Fridge, Lang } from "@/lib/types";

import { mapUrlClient as mapUrl } from "./mapUrl";
export { mapUrl };

export function PointCard({ fridge: f, lang }: { fridge: Fridge; lang: Lang }) {
  const d = t(lang);
  const map = mapUrl(f);
  return (
    <article className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-brand-600">{d.point}</p>
          <h3 className="font-display mt-1 text-xl font-bold">{f.name}</h3>
        </div>
        {f.status === "maintenance" ? (
          <span className="chip bg-aged-50 text-aged">{d.status_maintenance}</span>
        ) : (
          <span className="chip bg-fresh-50 text-fresh"><span className="h-1.5 w-1.5 rounded-full bg-fresh" />{f.open_time.slice(0, 5)}–{f.close_time.slice(0, 5)}</span>
        )}
      </div>
      <p className="mt-3 text-sm font-semibold">{pick(f, "address", lang)}</p>
      {pick(f, "landmark", lang) && <p className="mt-1 text-sm text-muted">{pick(f, "landmark", lang)}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`/${lang}/point/${f.code}`} className="btn btn-primary flex-1">{d.open_point}</Link>
        {map && (
          <a href={map} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">{d.on_map}</a>
        )}
      </div>
    </article>
  );
}
