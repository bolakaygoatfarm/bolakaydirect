"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LANGS, type Lang } from "@/lib/types";

const LABEL: Record<Lang, string> = { uz: "O‘z", ru: "Ру", en: "En" };
const TITLE: Record<Lang, string> = { uz: "O‘zbekcha", ru: "Русский", en: "English" };

export function LangSwitch({ lang }: { lang: Lang }) {
  const pathname = usePathname() || `/${lang}`;
  const qs = useSearchParams().toString();
  const rest = pathname.replace(/^\/(uz|ru|en)(?=\/|$)/, "") + (qs ? `?${qs}` : "");
  return (
    <div className="ml-1 flex rounded-full bg-brand-50 p-1 text-xs font-extrabold">
      {LANGS.map((l) => (
        <Link
          key={l}
          href={`/${l}${rest}`}
          hrefLang={l}
          title={TITLE[l]}
          onClick={() => {
            document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
          }}
          aria-current={l === lang ? "true" : undefined}
          className={`rounded-full px-2 py-1.5 uppercase transition sm:px-2.5 ${l === lang ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`}
        >
          {LABEL[l]}
        </Link>
      ))}
    </div>
  );
}
