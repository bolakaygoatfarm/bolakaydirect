"use client";

import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptic";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Код получения: цифры проявляются по очереди + кнопка «Скопировать». */
export function PickupCode({ code, lang }: { code: string; lang: Lang }) {
  const d = t(lang);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      ok = legacyCopy(code); // встроенные браузеры (Telegram, Instagram) часто запрещают Clipboard API
    }
    if (ok) {
      haptic(10);
      setCopied(true);
    }
  }

  return (
    <>
      <p className="font-display mt-2 flex justify-center gap-[0.2em] text-6xl font-bold tabular-nums">
        <span className="sr-only">{code}</span>
        {[...code].map((c, i) => (
          <span key={i} aria-hidden className="code-digit" style={{ animationDelay: `${150 + i * 130}ms` }}>
            {c}
          </span>
        ))}
      </p>
      <button
        type="button"
        onClick={copy}
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-bold transition hover:bg-white/25 active:scale-95"
      >
        {copied ? (
          <svg key="ok" viewBox="0 0 24 24" className="animate-pop h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path className="draw-check" d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <svg key="copy" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6a2 2 0 0 1 2-2h9" />
          </svg>
        )}
        <span aria-live="polite">{copied ? d.copied : d.copy}</span>
      </button>
    </>
  );
}
