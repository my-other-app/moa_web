import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { KioskApp } from "@/features/kiosk";

export const metadata: Metadata = { title: "Self check-in", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#0B140F" };

/** One long-lived screen with a camera; authenticated by a device token, never a session. */
export default function KioskPage() {
  return (
    <Suspense fallback={null}>
      <KioskApp />
    </Suspense>
  );
}
