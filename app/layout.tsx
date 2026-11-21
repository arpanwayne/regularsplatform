import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

// Loopdesk AI design system: IBM Plex Sans everywhere, Noto Devanagari for Hindi.
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-plex-mono", display: "swap" });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600"], variable: "--font-devanagari", display: "swap" });

export const metadata: Metadata = {
  title: "Regulars",
  description: "WhatsApp loyalty and repeat customers for local businesses.",
  icons: { icon: [{ url: "/brand/favicon.png", type: "image/png" }], apple: [{ url: "/brand/apple-touch-icon.png" }] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plex.variable} ${plexMono.variable} ${devanagari.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
