import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { PrintStationApp } from "@/features/print-station";

export const metadata: Metadata = { title: "Print station", robots: { index: false, follow: false } };
// Meridian's dark scale, as the kiosk; the browser bar takes its canvas (`--canvas` in `.dark`).
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0e0d", colorScheme: "dark" };

/** One long-lived screen on a laptop with a printer; authenticated by a device token, never a session. */
export default function PrintStationPage() {
  return (
    <Suspense fallback={null}>
      <PrintStationApp />
    </Suspense>
  );
}
