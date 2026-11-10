import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Your business, handled",
  description: "Answer every call, follow up every customer, and see what's bringing in work.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
