"use client";

import { useSyncExternalStore } from "react";

import { THEME_KEY as KEY } from "@/lib/theme";

type Theme = "light" | "dark";

const listeners = new Set<() => void>();
const read = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
function subscribe(cb: () => void) {
  listeners.add(cb);
  // Пока пользователь сам не выбрал тему — следуем за системой
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    listeners.forEach((l) => l());
  };
  mq.addEventListener("change", onSystem);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onSystem);
  };
}

export function ThemeToggle({ labels }: { labels: { light: string; dark: string } }) {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  const toggle = () => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* приватный режим — тема живёт до перезагрузки */
    }
    // Цвет панели браузера на телефоне — под выбранную тему
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", next === "dark" ? "#06111f" : "#04a9e4"));
    listeners.forEach((l) => l());
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={next === "dark" ? labels.dark : labels.light}
      title={next === "dark" ? labels.dark : labels.light}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-ink/80 transition hover:bg-brand-50"
    >
      {/* Солнце и луна плавно сменяют друг друга */}
      <svg viewBox="0 0 24 24" className={`absolute h-5 w-5 transition-all duration-500 ${theme === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg viewBox="0 0 24 24" className={`absolute h-5 w-5 text-butter transition-all duration-500 ${theme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`} fill="currentColor" aria-hidden>
        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
      </svg>
    </button>
  );
}
