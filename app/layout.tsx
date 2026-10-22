import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { clientConfig } from "@/config/client";
import "./globals.css";

export const metadata: Metadata = {
  title: `${clientConfig.name} · Báo cáo quảng cáo`,
  description: clientConfig.tagline,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const brandVars = {
    "--brand": clientConfig.brand.primary,
    "--brand-fg": clientConfig.brand.primaryForeground,
  } as CSSProperties;
  return (
    <html lang="vi" style={brandVars}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
