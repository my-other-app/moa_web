import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

// Inter is the v2 type face, as in the admin app. The system sets hierarchy
// with size and space rather than by bolding past 500.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// The figures and eyebrows are mono: a counter ticking from 168 to 169 must not shift its neighbours.
const plexMono = IBM_Plex_Mono({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "MyOtherApp Clubs", template: "%s · MyOtherApp Clubs" },
  description: "Run your club's events: tickets, the gate, the people, the money.",
  applicationName: "MyOtherApp Clubs",
  appleWebApp: { title: "Clubs", capable: true, statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e0d" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
