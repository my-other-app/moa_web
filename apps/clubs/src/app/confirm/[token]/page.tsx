import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { CLUB_NOT_VERIFIED } from "@moa/auth";
import { checkSession } from "@moa/auth/server";

import { AwaitingApproval } from "@/components/awaiting-approval";
import { ConfirmPage } from "@/features/mcp";

export const metadata: Metadata = { title: "Approve a request", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

/**
 * Where an AI assistant's "Confirm in dashboard" link lands
 * (https://club-dashboard.myotherapp.in/confirm/{token}).
 *
 * Its own page, not inside the dashboard's shell: people open it from a
 * chat app on a phone, to do one thing. Signed out (or with a session that
 * has ended), it goes to sign-in with `?next=` pointing back here; the
 * sign-in page returns to it, and only ever to a path on this site.
 */
export default async function ConfirmActionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw);
  const { user, refusal } = await checkSession();
  if (!user && refusal === CLUB_NOT_VERIFIED) return <AwaitingApproval />;
  if (!user) redirect(`/login?next=${encodeURIComponent(`/confirm/${token}`)}`);
  // An admin account has no club: the page says so from the API's NOT_A_CLUB rather than here.
  return <ConfirmPage token={token} />;
}
