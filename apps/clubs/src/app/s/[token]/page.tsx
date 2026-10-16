import type { Metadata, Viewport } from "next";

import { PhoneCheckIn } from "@/features/self-check-in";

export const metadata: Metadata = { title: "Check in", robots: { index: false, follow: false } };
// The page renders on Meridian's dark scale; the browser bar takes its canvas (`--canvas` in `.dark`), written out because a meta tag cannot read a CSS variable.
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0e0d", colorScheme: "dark" };
export const dynamic = "force-dynamic";

/** The page a kiosk's QR opens on a guest's phone. Public; the scanned token is the only credential. */
export default async function SelfCheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PhoneCheckIn token={decodeURIComponent(token)} />;
}
