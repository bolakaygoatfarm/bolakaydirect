import { NextResponse, type NextRequest } from "next/server";

/**
 * Языковые редиректы:
 *  /                 → /uz, /ru или /en (по cookie или Accept-Language)
 *  /point/<code>     → /<lang>/point/<code>  (адрес, который печатается в QR-коде)
 *
 * Скрытый адрес панели персонала:
 *  /<STAFF_PATH>     → показывает панель (/staff)
 *  /staff            → «Страница не найдена», если STAFF_PATH задан
 * STAFF_PATH задаётся в переменных окружения Render и в коде не хранится.
 */
const RESERVED = new Set(["uz", "ru", "en", "point", "staff", "_next", "api"]);

/** Секретный адрес панели или null, если он не задан или задан неудачно */
function staffPath(): string | null {
  const p = (process.env.STAFF_PATH ?? "").trim().replace(/^\/+|\/+$/g, "");
  // Короткий адрес легко подобрать, а другие символы ломают ссылку
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(p) || RESERVED.has(p.toLowerCase())) return null;
  return p;
}
type L = "uz" | "ru" | "en";
function detectLang(req: NextRequest): L {
  const saved = req.cookies.get("lang")?.value;
  if (saved === "uz" || saved === "ru" || saved === "en") return saved;
  // Первый язык из Accept-Language, который мы поддерживаем; по умолчанию — узбекский
  const al = (req.headers.get("accept-language") || "").toLowerCase().split(",");
  for (const part of al) {
    const code = part.trim().slice(0, 2);
    if (code === "uz" || code === "ru" || code === "en") return code;
  }
  return "uz";
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const lang = detectLang(req);
  if (pathname === "/") {
    return NextResponse.redirect(new URL(`/${lang}`, req.url));
  }
  if (pathname.startsWith("/point/")) {
    return NextResponse.redirect(new URL(`/${lang}${pathname}`, req.url));
  }
  const secret = staffPath();
  if (secret) {
    if (pathname === `/${secret}`) return NextResponse.rewrite(new URL("/staff", req.url));
    // Обычная страница 404 сайта: снаружи не видно, что панель здесь была
    if (pathname === "/staff" || pathname.startsWith("/staff/")) {
      return NextResponse.rewrite(new URL(`/${lang}/staff-not-found`, req.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  // Значения matcher должны быть постоянными, поэтому ловим любой адрес из одного сегмента
  matcher: ["/", "/point/:path*", "/staff/:path*", "/:slug"],
};
