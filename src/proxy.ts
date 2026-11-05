import { NextResponse, type NextRequest } from "next/server";

/**
 * Языковые редиректы:
 *  /                 → /uz или /ru (по cookie или Accept-Language)
 *  /point/<code>     → /<lang>/point/<code>  (адрес, который печатается в QR-коде)
 */
function detectLang(req: NextRequest): "uz" | "ru" {
  const saved = req.cookies.get("lang")?.value;
  if (saved === "uz" || saved === "ru") return saved;
  const al = (req.headers.get("accept-language") || "").toLowerCase();
  const ruIdx = al.indexOf("ru");
  const uzIdx = al.indexOf("uz");
  if (ruIdx !== -1 && (uzIdx === -1 || ruIdx < uzIdx)) return "ru";
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
