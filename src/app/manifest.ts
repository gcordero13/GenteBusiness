import type { MetadataRoute } from "next";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // `/icon` (src/app/icon.tsx) always composites the logo — custom or the
  // default "GSB" mark — onto a solid teal background, so the icon stays
  // visible regardless of what's uploaded (the raw uploaded logo is
  // white-on-transparent and disappears on a light home screen otherwise).
  return {
    name: "Gente Sánchez Business",
    short_name: "GSB",
    description: "Plataforma interna de Gente Sánchez Business",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#04b1af",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
