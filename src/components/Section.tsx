/** Общие мелочи секций главной и страницы «О ферме». */
export const Arrow = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const H2 = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <h2 className={`font-display mt-3 text-[1.75rem] font-bold leading-tight text-brand-900 sm:text-4xl ${className}`}>{children}</h2>
);
