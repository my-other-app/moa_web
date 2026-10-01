import type { Metadata, Viewport } from "next";
import { Bebas_Neue, DM_Sans } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Organiser · My Other App", template: "%s · Organiser" },
  description: "Run your club's events on My Other App.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${dmSans.variable} ${bebasNeue.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
