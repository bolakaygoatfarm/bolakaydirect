/**
 * «Молочный» фон в стиле референса: небесно-голубой градиент, шёлковые белые волны молока
 * и капли-брызги по краям. Только SVG + CSS, без картинок и библиотек.
 */
export function MilkBackdrop({ variant = "hero" }: { variant?: "hero" | "soft" }) {
  return (
    <div aria-hidden className={`milk-bg ${variant === "soft" ? "milk-bg--soft" : ""}`}>
      {/* Шёлковые волны снизу */}
      <svg className="milk-waves" viewBox="0 0 1440 320" preserveAspectRatio="none">
        <defs>
          {/* Волны сверху плотные, к низу растворяются в белом фоне — без жёсткого края */}
          <linearGradient id="mw-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="mw-hi" stopOpacity="0.95" />
            <stop offset="0.7" className="mw-hi" stopOpacity="0.9" />
            <stop offset="1" className="mw-hi" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="mw-b" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="mw-hi" />
            <stop offset="1" className="mw-hi" />
          </linearGradient>
          <linearGradient id="mw-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="mw-shade" stopOpacity="0.8" />
            <stop offset="1" className="mw-hi" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g>
          <path d="M0 150C220 70 420 210 700 160S1180 40 1440 110V320H0Z" fill="url(#mw-shade)" />
          <path d="M0 175C240 95 450 235 720 185S1190 75 1440 135V320H0Z" fill="url(#mw-a)" />
        </g>
        <g>
          <path d="M0 238C260 180 520 290 820 240S1250 170 1440 205V320H0Z" fill="url(#mw-shade)" opacity="0.7" />
          <path d="M0 258C270 205 530 305 830 262S1260 196 1440 228V320H0Z" fill="url(#mw-b)" />
        </g>
      </svg>

      {/* Изгиб молока сбоку и капли */}
      <svg className="milk-splash" viewBox="0 0 240 420" fill="none">
        <defs>
          <radialGradient id="ms-drop" cx="35%" cy="30%" r="70%">
            <stop offset="0" className="mw-hi" />
            <stop offset="0.7" className="ms-hi" />
            <stop offset="1" className="ms-shade" />
          </radialGradient>
          <linearGradient id="ms-curl" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="mw-hi" />
            <stop offset="1" className="ms-shade" />
          </linearGradient>
        </defs>
        <path d="M240 20C150 40 92 110 112 190s110 120 128 210V20Z" fill="url(#ms-curl)" opacity="0.95" />
        <path d="M240 60c-70 20-108 74-96 134" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.9" />
        <circle cx="70" cy="70" r="16" fill="url(#ms-drop)" />
        <circle cx="40" cy="132" r="8" fill="url(#ms-drop)" />
        <circle cx="92" cy="260" r="11" fill="url(#ms-drop)" />
      </svg>
    </div>
  );
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
