import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Regulars — WhatsApp Loyalty & Retention",
  description:
    "WhatsApp-native loyalty and retention platform for salons, gyms, clinics and retail. Zero-effort customer segmentation and AI re-engagement calling.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
