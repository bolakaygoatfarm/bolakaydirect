import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/supabase";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/staff", "/uz/order/", "/ru/order/", "/uz/checkout", "/ru/checkout"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
