import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gente Sánchez Business",
    short_name: "GSB",
    description: "Plataforma interna de Gente Sánchez Business",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#04b1af",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
