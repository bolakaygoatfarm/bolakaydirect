import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BOLAKAY DIRECT",
    short_name: "BOLAKAY",
    description: "Echki suti, yogurt va sariyog‘ — fermadan to‘g‘ridan-to‘g‘ri / Козье молоко с фермы",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#04a9e4",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
