import type { Metadata, Viewport } from "next";
import { Bebas_Neue, DM_Sans, Inter } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

// Matches the type pairing in the shared preset: DM Sans for body, Bebas Neue
// for display. Loaded through next/font so there is no layout shift and no
// render-blocking request to Google.
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

// Inter is the v2 type face, at weights 400 and 500 only -- the system sets
// hierarchy with size and space, never by bolding past 500.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Admin · My Other App",
    template: "%s · Admin",
  },
  description: "Platform administration for My Other App.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${dmSans.variable} ${bebasNeue.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
