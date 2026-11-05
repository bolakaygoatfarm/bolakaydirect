/**
 * Логотип BOLAKAY: козёл в полумесяце. Файлы — /public/logo.png (256px) и иконки icon-*.png.
 * Исходник: /public/logo-original.webp. Пересоздать размеры можно через sharp.
 */
export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- маленький статичный знак, оптимизация не нужна
    <img src="/logo.png" alt="BOLAKAY" width={256} height={256} className={`rounded-full ${className}`} />
  );
}

export function Logo({ sub, onDark = false }: { sub?: string; onDark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className={`h-9 w-9 shrink-0 ${onDark ? "ring-2 ring-white/20" : ""}`} />
      <span className="leading-none">
        <span className={`font-display block text-[1.05rem] font-bold tracking-wide ${onDark ? "text-white" : "text-brand-700"}`}>BOLAKAY</span>
        {sub && <span className={`mt-0.5 block text-[0.65rem] font-bold uppercase tracking-[0.18em] ${onDark ? "text-white/60" : "text-muted"}`}>{sub}</span>}
      </span>
    </span>
  );
}
