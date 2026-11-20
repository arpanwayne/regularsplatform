import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { PORTAL_NAME, currentPortal } from "@/lib/portal";

// Loopdesk AI design system: IBM Plex Sans everywhere, Noto Devanagari for Hindi.
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-plex-mono", display: "swap" });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600"], variable: "--font-devanagari", display: "swap" });

export function generateMetadata(): Metadata {
  const portal = currentPortal();
  const icons = { icon: [{ url: "/brand/favicon.png", type: "image/png" }], apple: [{ url: "/brand/apple-touch-icon.png" }] };
  return portal === "LOOPDESK"
    ? { title: PORTAL_NAME.LOOPDESK, description: "Answer every call, follow up every customer, and see what's bringing in work.", icons }
    : { title: "Regulars", description: "WhatsApp loyalty and repeat customers for local businesses.", icons };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // data-portal: lets a portal override the brand colours in app/globals.css (none do today).
  return (
    <html lang="en" data-portal={currentPortal()} className={`${plex.variable} ${plexMono.variable} ${devanagari.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
