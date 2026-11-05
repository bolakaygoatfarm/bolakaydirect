"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Lang } from "@/lib/types";

export function LangSwitch({ lang }: { lang: Lang }) {
  const pathname = usePathname() || `/${lang}`;
  const qs = useSearchParams().toString();
  const rest = pathname.replace(/^\/(uz|ru)(?=\/|$)/, "") + (qs ? `?${qs}` : "");
  return (
    <div className="ml-1 flex rounded-full bg-brand-50 p-1 text-xs font-extrabold">
      {(["uz", "ru"] as const).map((l) => (
        <Link
          key={l}
          href={`/${l}${rest}`}
          onClick={() => {
            document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
          }}
          aria-current={l === lang ? "true" : undefined}
          className={`rounded-full px-2.5 py-1.5 uppercase transition ${l === lang ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`}
        >
          {l === "uz" ? "O‘z" : "Ру"}
        </Link>
      ))}
    </div>
  );
}
