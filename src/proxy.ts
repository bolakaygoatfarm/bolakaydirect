import { NextResponse, type NextRequest } from "next/server";

/**
 * Языковые редиректы:
 *  /                 → /uz, /ru или /en (по cookie или Accept-Language)
 *  /point/<code>     → /<lang>/point/<code>  (адрес, который печатается в QR-коде)
 */
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
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/point/:path*"],
};
