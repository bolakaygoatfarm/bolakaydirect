/**
 * Число с «прокруткой» цифр: каждая цифра — вертикальная лента 0–9, сдвигаемая transform-ом.
 * Подходит для любых строк (сумма «24 000 so‘m», количество): анимируются только цифры.
 * Разряды сопоставляются справа, поэтому при росте числа старые цифры не «прыгают».
 */
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function RollingNumber({ text, className = "" }: { text: string; className?: string }) {
  const chars = [...text];
  return (
    <span className={`roll ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="roll-inner">
        {chars.map((c, i) => {
          const key = chars.length - i;
          const n = c >= "0" && c <= "9" ? Number(c) : -1;
          if (n < 0) return <span key={key} className="roll-char">{c}</span>;
          return (
            <span key={key} className="roll-digit">
              <span className="roll-strip" style={{ transform: `translateY(${-n * 1.2}em)` }}>
                {DIGITS.map((x) => <span key={x}>{x}</span>)}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
