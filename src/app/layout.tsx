import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "./RegisterServiceWorker";
import { getPlatformLogoUrl } from "@/lib/platformSettings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const logoUrl = await getPlatformLogoUrl();
  const icon = logoUrl ?? "/icon.svg";

  return {
    title: "Gente Sánchez Business",
    description: "Plataforma interna de Gente Sánchez Business",
    icons: {
      icon,
      apple: icon,
    },
  };
}

export const viewport = {
  themeColor: "#04b1af",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
