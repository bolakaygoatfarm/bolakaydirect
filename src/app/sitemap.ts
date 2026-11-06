import type { MetadataRoute } from "next";
import { getFridges } from "@/lib/data";
import { SITE_URL } from "@/lib/supabase";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fridges = await getFridges();
  const paths = ["", "/points", "/about", ...fridges.map((f) => `/point/${f.code}`)];
  return paths.flatMap((p) =>
    (["uz", "ru", "en"] as const).map((lang) => ({
      url: `${SITE_URL}/${lang}${p}`,
      alternates: { languages: { uz: `${SITE_URL}/uz${p}`, ru: `${SITE_URL}/ru${p}`, en: `${SITE_URL}/en${p}` } },
    })),
  );
}
