import type { Metadata, Viewport } from "next";

import { PhoneCheckIn } from "@/features/self-check-in";

export const metadata: Metadata = { title: "Check in", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0B140F" };
export const dynamic = "force-dynamic";

/** The page a kiosk's QR opens on a guest's phone. Public; the scanned token is the only credential. */
export default async function SelfCheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PhoneCheckIn token={decodeURIComponent(token)} />;
}
