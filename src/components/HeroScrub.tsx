"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Wave } from "./Backdrop";

/** С какой секунды начинаем: в первых кадрах видео молока ещё нет */
const START_AT = 2.4;

/**
 * Первый экран со «спуском», как в DOSAN: панель закреплена, прокрутка управляет кадрами видео,
 * текст плавно уходит, чтобы не мешать струе.
 * Видео (4 МБ) не загружается при экономии трафика, очень медленной сети или отключённой
 * анимации — там остаётся обычный первый экран без дорожки прокрутки.
 */
export function HeroScrub({ children, hint }: { children: ReactNode; hint: string }) {
  const track = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const [plain, setPlain] = useState(false);

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const skip =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches || conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "");
    if (skip) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- настройки устройства известны только в браузере
      setPlain(true);
      return;
    }
    const v = video.current;
    const t = track.current;
    if (!v || !t) return;

    // Цепочка перемоток: новая начинается только после завершения предыдущей, иначе браузер их отменяет
    let seeking = false;
    let pending: number | null = null;
    const seek = (time: number) => {
      if (seeking) {
        pending = time;
        return;
      }
      if (Math.abs(time - v.currentTime) < 0.03) return;
      seeking = true;
      v.currentTime = time;
    };
    const onSeeked = () => {
      seeking = false;
      if (pending !== null) {
        const next = pending;
        pending = null;
        seek(next);
      }
    };

    // В файле редкие ключевые кадры: перемотка занимает ~350 мс (3 кадра в секунду).
    // Поэтому вперёд видео не перематывается, а догоняет нужный момент обычным проигрыванием
    // со скоростью по отставанию — так плавно. Назад браузер играть не умеет: там перемотка.
    let raf = 0;
    let target = START_AT;
    let first = true;
    const follow = () => {
      if (!v.duration || seeking) return false;
      const diff = target - v.currentTime;
      if (diff > 0.04) {
        v.playbackRate = Math.min(Math.max(diff * 2.5, 0.4), 4);
        if (v.paused) v.play().catch(() => seek(target));
        return true;
      }
      if (!v.paused) v.pause();
      if (diff < -0.3) seek(target);
      return false;
    };
    const paint = () => {
      raf = 0;
      const scrollable = t.offsetHeight - window.innerHeight;
      const p = scrollable > 0 ? Math.min(Math.max(-t.getBoundingClientRect().top / scrollable, 0), 1) : 0;
      if (v.duration) {
        target = START_AT + p * (v.duration - START_AT - 0.05);
        if (first) {
          first = false;
          seek(target); // сразу показываем кадр, соответствующий текущей позиции
        } else if (follow() || seeking) schedule(); // догоняем, пока не дошли до нужного кадра
      }
      const fade = Math.max(0, 1 - p / 0.3);
      if (content.current) {
        content.current.style.opacity = String(fade);
        content.current.style.transform = fade < 1 ? `translateY(${((1 - fade) * -16).toFixed(1)}px)` : "";
        content.current.style.pointerEvents = fade < 0.2 ? "none" : "";
      }
      if (cue.current) cue.current.style.opacity = String(fade);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };

    v.addEventListener("seeked", onSeeked);
    v.addEventListener("loadedmetadata", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    // Загрузка (4 МБ): на компьютере — после отрисовки страницы,
    // на телефоне — при первой прокрутке, чтобы не тратить трафик тех, кто сразу нажал кнопку.
    const load = () => {
      window.removeEventListener("scroll", load);
      if (v.src) return;
      v.src = "/hero-milk.mp4";
      v.load();
    };
    const touch = window.matchMedia("(hover: none)").matches;
    let idle = 0;
    if (touch) window.addEventListener("scroll", load, { passive: true });
    else idle = window.setTimeout(load, 400);

    return () => {
      window.clearTimeout(idle);
      window.removeEventListener("scroll", load);
      cancelAnimationFrame(raf);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("loadedmetadata", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <section ref={track} className={`hero-track relative -mt-16 ${plain ? "hero-track--plain" : ""}`}>
      <div className="hero-panel sticky top-0 overflow-hidden">
        {!plain && <video ref={video} className="hero-video" muted playsInline preload="auto" aria-hidden />}
        <div ref={content} className="relative mx-auto flex h-full max-w-5xl flex-col justify-start px-4 pt-24 md:justify-center md:pt-16">
          {children}
        </div>
        {!plain && (
          <div ref={cue} aria-hidden className="hero-cue">
            <span>{hint}</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </div>
        )}
        <Wave className="absolute inset-x-0 bottom-0 text-page" />
      </div>
    </section>
  );
}
