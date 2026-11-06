import type { Category } from "@/lib/types";

/**
 * Иллюстрация товара, пока нет фотографий. Если у товара есть image_url — показывается фото.
 */
const BG: Record<Category, string> = {
  milk: "from-[#dcf4fd] to-[#aee3f7]",
  yogurt: "from-[#ecf8f3] to-[#cbeadc]",
  butter: "from-[#fff3d1] to-[#fbd98a]",
  drinks: "from-[#f7ece1] to-[#e6cdb0]",
};

export function ProductArt({
  category,
  image,
  alt,
  className = "",
}: {
  category: Category;
  image?: string | null;
  alt: string;
  className?: string;
}) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={alt} loading="lazy" decoding="async" className={`object-cover ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br ${BG[category]} ${className}`} role="img" aria-label={alt}>
      <svg viewBox="0 0 80 80" className="h-3/5 w-3/5 drop-shadow-sm">
        {category === "milk" && (
          <g>
            <path d="M30 10h20v8l6 10v40a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4V28l6-10Z" fill="#fff" stroke="#0a7bbf" strokeWidth="2.5" strokeLinejoin="round" />
            <rect x="29" y="6" width="22" height="7" rx="2" fill="#0a7bbf" />
            <rect x="24" y="38" width="32" height="18" fill="#cdeefb" />
            <text x="40" y="51" textAnchor="middle" fontSize="8" fontWeight="800" fill="#075f97" fontFamily="sans-serif">MILK</text>
          </g>
        )}
        {category === "yogurt" && (
          <g>
            <path d="M18 26h44l-5 42a4 4 0 0 1-4 3.5H27a4 4 0 0 1-4-3.5Z" fill="#fff" stroke="#0a7bbf" strokeWidth="2.5" strokeLinejoin="round" />
            <rect x="15" y="18" width="50" height="9" rx="3" fill="#0a7bbf" />
            <path d="M24 40h32" stroke="#9fdcf5" strokeWidth="6" />
          </g>
        )}
        {category === "butter" && (
          <g>
            <path d="M14 36l26-12 26 12-26 12Z" fill="#ffe9a8" stroke="#b86e0c" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M14 36v14l26 12V48Z" fill="#ffd970" stroke="#b86e0c" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M66 36v14L40 62V48Z" fill="#f6c94a" stroke="#b86e0c" strokeWidth="2.5" strokeLinejoin="round" />
          </g>
        )}
        {category === "drinks" && (
          <g>
            <path d="M32 8h16v10c5 3 8 8 8 14v34a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4V32c0-6 3-11 8-14Z" fill="#fff" stroke="#7a4a24" strokeWidth="2.5" strokeLinejoin="round" />
            <rect x="31" y="4" width="18" height="7" rx="2" fill="#7a4a24" />
            <path d="M24 44h32v22a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4Z" fill="#c89a6d" />
          </g>
        )}
      </svg>
    </div>
  );
}
