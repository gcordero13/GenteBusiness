// The signature fonts, loaded on the server (Mi perfil page) and passed to the
// client signature as class names: next/font/google inside a client component
// broke the Vercel build (2026-11-27).
import { Barlow_Semi_Condensed, Montserrat } from "next/font/google";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const barlow = Barlow_Semi_Condensed({ subsets: ["latin"], weight: ["600", "700"] });

export const FUENTES_FIRMA = { texto: montserrat.className, nombre: barlow.className };
