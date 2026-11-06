/** Мягкий голубой фон секции: только градиент, без рисунка */
export function MilkBackdrop() {
  return <div aria-hidden className="milk-bg" />;
}

/**
 * Волна-переход между секциями (Cult UI SVG Bands). `className` задаёт фон (цвет секции выше)
 * и text-* — цвет секции ниже. `flip` — волна смотрит вниз.
 */
export function Wave({ className = "", flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 1440 64" preserveAspectRatio="none" className={`band ${flip ? "-scale-y-100" : ""} ${className}`}>
      <path fill="currentColor" d="M0 40c160-26 320-36 480-22s320 38 480 30 320-34 480-30v46H0Z" />
    </svg>
  );
}

/** Подпись-«таблетка» над заголовком секции: «• Наша продукция» */
export function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span className={`eyebrow ${dark ? "eyebrow--dark" : ""}`}>
      <span className="eyebrow__dot" />
      {children}
    </span>
  );
}
