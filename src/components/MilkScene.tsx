/**
 * Иллюстрация для блока «Почему выбирают»: бутылка BOLAKAY, стакан молока, пиала йогурта, листья.
 * Векторная, лёгкая. Когда появятся настоящие фото продукции — можно заменить на <img>.
 */
export function MilkScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 480" className={className} role="img" aria-label="BOLAKAY">
      <defs>
        <linearGradient id="sc-cloth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dff2fb" />
        </linearGradient>
        <linearGradient id="sc-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="sc-milk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f3f8fb" />
          <stop offset="0.45" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e4eef4" />
        </linearGradient>
        <linearGradient id="sc-cap" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0a7bbf" />
          <stop offset="0.5" stopColor="#3cc0ee" />
          <stop offset="1" stopColor="#075f97" />
        </linearGradient>
        <linearGradient id="sc-bowl" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e8f1f6" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d8e6ee" />
        </linearGradient>
        <linearGradient id="sc-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5cc46a" />
          <stop offset="1" stopColor="#2f8a53" />
        </linearGradient>
        <radialGradient id="sc-fade-g" cx="50%" cy="80%" r="55%">
          <stop offset="0.55" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id="sc-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="520" height="480">
          <rect width="520" height="480" fill="url(#sc-fade-g)" />
        </mask>
        <radialGradient id="sc-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#0a2747" stopOpacity="0.18" />
          <stop offset="1" stopColor="#0a2747" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ткань / молочная волна — с мягким затуханием к краям */}
      <g mask="url(#sc-fade)" className="scene-cloth">
        <path d="M0 370c90-40 170-20 260 10s180 40 260-10v110H0Z" fill="url(#sc-cloth)" />
        <path d="M0 400c110-30 200-6 290 18s160 22 230-8" stroke="#ffffff" strokeWidth="5" fill="none" opacity="0.9" />
      </g>

      {/* листья */}
      <g opacity="0.95">
        <path d="M430 300c40-40 70-30 82-58-40-6-74 10-82 58Z" fill="url(#sc-leaf)" />
        <path d="M430 300c30-26 50-34 72-50" stroke="#e8f7ea" strokeWidth="1.5" fill="none" />
        <path d="M70 330c-30-44-62-42-70-72 38 2 68 24 70 72Z" fill="url(#sc-leaf)" />
        <path d="M454 248c20-46 48-50 52-80-36 10-58 36-52 80Z" fill="url(#sc-leaf)" opacity="0.85" />
      </g>

      {/* тени */}
      <ellipse cx="290" cy="392" rx="120" ry="16" fill="url(#sc-shadow)" />
      <ellipse cx="170" cy="404" rx="80" ry="12" fill="url(#sc-shadow)" />
      <ellipse cx="380" cy="410" rx="90" ry="12" fill="url(#sc-shadow)" />

      {/* бутылка */}
      <g>
        <path d="M262 92h56v34c26 18 40 44 40 76v172a18 18 0 0 1-18 18H240a18 18 0 0 1-18-18V202c0-32 14-58 40-76Z" fill="url(#sc-milk)" stroke="#d3e3ec" strokeWidth="2" />
        <path d="M234 210h112v156a12 12 0 0 1-12 12H246a12 12 0 0 1-12-12Z" fill="#ffffff" opacity="0.6" />
        <rect x="256" y="58" width="68" height="40" rx="10" fill="url(#sc-cap)" />
        <rect x="256" y="66" width="68" height="4" fill="#ffffff" opacity="0.35" />
        <rect x="256" y="78" width="68" height="4" fill="#ffffff" opacity="0.25" />
        <path d="M244 160c6-16 16-26 30-32" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" opacity="0.9" />
        <path d="M240 226v120" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" opacity="0.75" />
        {/* этикетка */}
        <rect x="246" y="250" width="88" height="54" rx="10" fill="#ffffff" stroke="#cdeefb" strokeWidth="2" />
        <circle cx="270" cy="277" r="13" fill="#04a9e4" />
        <path d="M273 266a12 12 0 1 0 7 19 10 10 0 1 1-7-19Z" fill="#ffffff" />
        <rect x="289" y="268" width="36" height="6" rx="3" fill="#0a2747" />
        <rect x="289" y="280" width="26" height="5" rx="2.5" fill="#9fdcf5" />
      </g>

      {/* стакан молока */}
      <g>
        <path d="M110 196h120l-12 192a14 14 0 0 1-14 13h-68a14 14 0 0 1-14-13Z" fill="#ffffff" opacity="0.35" stroke="#cfe3ee" strokeWidth="2" />
        <path d="M116 236h108l-9 150a12 12 0 0 1-12 11h-66a12 12 0 0 1-12-11Z" fill="url(#sc-milk)" />
        <ellipse cx="170" cy="236" rx="54" ry="8" fill="#ffffff" />
        <path d="M110 196h120l-12 192a14 14 0 0 1-14 13h-68a14 14 0 0 1-14-13Z" fill="url(#sc-glass)" />
        <path d="M126 210l10 170" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.8" />
      </g>

      {/* пиала йогурта */}
      <g>
        <path d="M300 338h168c0 46-36 74-84 74s-84-28-84-74Z" fill="url(#sc-bowl)" stroke="#d3e3ec" strokeWidth="2" />
        <ellipse cx="384" cy="338" rx="84" ry="16" fill="#f7fbfd" stroke="#d3e3ec" strokeWidth="2" />
        <path d="M312 336c18-14 44-20 72-18s54 6 72 18c-24 8-48 10-72 10s-50-2-72-10Z" fill="#ffffff" />
        <path d="M352 330c10-8 22-10 34-6M392 326c8-5 18-6 28-2" stroke="#e6f2f8" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M320 356c10 22 30 38 60 42" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.85" fill="none" />
      </g>
    </svg>
  );
}
