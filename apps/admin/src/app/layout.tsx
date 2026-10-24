import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

// Loaded through next/font so there is no layout shift and no render-blocking
// request to Google. Inter is the v2 type face, at weights 400 and 500 only -- the system sets
// hierarchy with size and space, never by bolding past 500.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "MyOtherApp Admin", template: "%s · MyOtherApp Admin" },
  description: "Platform administration for MyOtherApp.",
  applicationName: "MyOtherApp Admin",
  appleWebApp: { title: "Admin", capable: true, statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e0d" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
