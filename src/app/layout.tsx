import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "./RegisterServiceWorker";
import { ChristmasDecor } from "@/components/ChristmasDecor";
import { getChristmasModeEnabled } from "@/lib/platformSettings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Icons are handled by the icon.tsx/apple-icon.tsx file conventions
// (auto-linked by Next) instead of a manual `icons` field here — those
// routes composite the logo onto a solid background so it stays visible
// regardless of what's uploaded, which a manual override here would bypass.
export const metadata: Metadata = {
  title: "Gente Sánchez Business",
  description: "Plataforma interna de Gente Sánchez Business",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GSB",
  },
};

export const viewport: Viewport = {
  themeColor: "#04b1af",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const christmasModeEnabled = await getChristmasModeEnabled();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <RegisterServiceWorker />
        <ChristmasDecor enabled={christmasModeEnabled} />
        {children}
      </body>
    </html>
  );
}
