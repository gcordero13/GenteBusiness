import type { MetadataRoute } from "next";
import { getPlatformLogoUrl } from "@/lib/platformSettings";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const logoUrl = await getPlatformLogoUrl();

  const icons = logoUrl
    ? [
        { src: logoUrl, sizes: "any", purpose: "any" as const },
        { src: logoUrl, sizes: "any", purpose: "maskable" as const },
      ]
    : [
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" as const },
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" as const },
      ];

  return {
    name: "Gente Sánchez Business",
    short_name: "GSB",
    description: "Plataforma interna de Gente Sánchez Business",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#04b1af",
    icons,
  };
}
