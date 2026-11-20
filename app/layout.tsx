import type { Metadata } from "next";
import "./globals.css";
import { PORTAL_NAME, currentPortal } from "@/lib/portal";

export function generateMetadata(): Metadata {
  const portal = currentPortal();
  return portal === "LOOPDESK"
    ? { title: PORTAL_NAME.LOOPDESK, description: "Answer every call, follow up every customer, and see what's bringing in work." }
    : { title: "Regulars", description: "WhatsApp loyalty and repeat customers for local businesses." };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
