"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Wave } from "./Backdrop";

/** Сколько ждём после прокрутки вверх, прежде чем видео снова пойдёт вперёд */
const RESUME_MS = 450;
/** Ускорение на время касания и прокрутки вниз: движение пальца и видео ощущается связанным */
const TOUCH_RATE = 1.6;
/** Если ролик уже закончился, касание продолжает всплеск с этой секунды: молоко снова льётся */
const REPLAY_FROM = 8;
/** Плавность перемотки назад: какую долю оставшегося пути видео проходит за кадр */
const EASE = 0.22;

/**
 * Первый экран с видео всплеска. Текст остаётся на месте.
 *  - человек не листает: видео идёт само до конца и останавливается на последнем кадре;
 *  - коснулся экрана или листает вниз: видео сразу льётся (чуть быстрее),
 *    а первый экран ненадолго задерживается (.hero-hold);
 *  - листает вверх: видео плавно перематывается назад, полный путь = весь ролик;
 *    как только человек остановился, видео снова идёт вперёд.
 * Видео (3 МБ) не загружается при экономии трафика, очень медленной сети или отключённой анимации.
 * Файл hero-milk.mp4 пережат с частыми ключевыми кадрами — именно поэтому перемотка назад плавная.
 */
export function HeroScrub({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
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
    const p = panel.current;
    const t = track.current;
    if (!v || !p || !t) return;

    let visible = true; // первый экран на виду
    let rewindTo: number | null = null; // цель перемотки назад; null — обычное проигрывание
    let lastY = window.scrollY;
    let resumeTimer = 0;
    let rateTimer = 0;
    let raf = 0;

    // Цепочка перемоток: новая начинается только после завершения предыдущей, иначе браузер их отменяет
    let seeking = false;
    let pending: number | null = null;
    const seek = (time: number) => {
      if (seeking) {
        pending = time;
        return;
      }
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

    const atEnd = () => v.currentTime >= v.duration - 0.05;
    const play = () => {
      if (document.hidden || !visible || rewindTo !== null || v.readyState < 2 || atEnd()) return;
      if (v.paused) v.play().catch(() => {});
    };

    // Касание или прокрутка вниз: видео льётся сразу, без ожидания
    const flow = () => {
      if (!visible || !v.duration) return;
      window.clearTimeout(resumeTimer);
      cancelAnimationFrame(raf);
      raf = 0;
      rewindTo = null;
      if (atEnd()) seek(REPLAY_FROM);
      v.playbackRate = TOUCH_RATE;
      window.clearTimeout(rateTimer);
      rateTimer = window.setTimeout(() => {
        v.playbackRate = 1;
      }, 400);
      play();
    };

    // Перемотка назад с плавным догоном: видео не прыгает за прокруткой, а мягко к ней подходит
    let shown = 0;
    const ease = () => {
      raf = 0;
      if (rewindTo === null) return;
      const diff = rewindTo - shown;
      if (Math.abs(diff) < 0.015) {
        shown = rewindTo;
        seek(shown);
        return;
      }
      shown += diff * EASE;
      seek(shown);
      raf = requestAnimationFrame(ease);
    };

    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (!dy || !visible || !v.duration) return;
      if (dy > 0) {
        flow();
        return;
      }
      window.clearTimeout(rateTimer);
      v.playbackRate = 1;
      if (!v.paused) v.pause();
      if (rewindTo === null) shown = v.currentTime;
      rewindTo = Math.max(0, (rewindTo ?? v.currentTime) + (dy / t.offsetHeight) * v.duration);
      if (!raf) raf = requestAnimationFrame(ease);
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        rewindTo = null;
        play();
      }, RESUME_MS);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0) flow();
    };

    const onVisibility = () => {
      if (document.hidden) v.pause();
      else play();
    };

    // Пока первый экран вне видимости, видео не тратит ресурсы телефона
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      lastY = window.scrollY;
      if (visible) play();
      else {
        window.clearTimeout(resumeTimer);
        cancelAnimationFrame(raf);
        raf = 0;
        rewindTo = null;
        v.pause();
      }
    });
    io.observe(p);

    v.addEventListener("seeked", onSeeked);
    v.addEventListener("canplay", play);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", flow, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    v.src = "/hero-milk.mp4";
    v.load();

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(resumeTimer);
      window.clearTimeout(rateTimer);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("canplay", play);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", flow);
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <section ref={track} className="relative -mt-16">
      <div ref={panel} className="hero-panel sticky top-0 overflow-hidden">
        {!plain && <video ref={video} className="hero-video" muted playsInline preload="auto" aria-hidden />}
        <div className="hero-content relative mx-auto flex h-full max-w-5xl flex-col justify-start px-4 pt-24 md:justify-center md:pt-16">
          {children}
        </div>
        <Wave className="absolute inset-x-0 bottom-0 text-page" />
        {/* Подпись автора видео: на экране не видна, есть в коде страницы и для экранных дикторов */}
        <p className="sr-only">
          Milk splash video by{" "}
          <a href="https://www.vecteezy.com" rel="noopener nofollow" tabIndex={-1}>
            Vecteezy
          </a>
        </p>
      </div>
      {/* Пустой блок даёт закреплённому экрану пройти небольшой путь: это и есть задержка */}
      {!plain && <div aria-hidden className="hero-hold" />}
    </section>
  );
}
