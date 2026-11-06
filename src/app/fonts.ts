import { Onest } from "next/font/google";

// Один шрифт на весь сайт: современный, дружелюбный, с кириллицей и узбекской латиницей, переменная насыщенность.
// preload: false — браузер берёт только нужные файлы; display: swap — текст виден сразу.
export const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
  preload: false,
});
