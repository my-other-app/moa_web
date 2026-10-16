import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { KioskApp } from "@/features/kiosk";

export const metadata: Metadata = { title: "Self check-in", robots: { index: false, follow: false } };
// The page renders on Meridian's dark scale; the browser bar takes its canvas (`--canvas` in `.dark`), written out because a meta tag cannot read a CSS variable.
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#0b0e0d", colorScheme: "dark" };

/** One long-lived screen with a camera; authenticated by a device token, never a session. */
export default function KioskPage() {
  return (
    <Suspense fallback={null}>
      <KioskApp />
    </Suspense>
  );
}
