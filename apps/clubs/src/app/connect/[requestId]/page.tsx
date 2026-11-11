import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { CLUB_NOT_VERIFIED } from "@moa/auth";
import { checkSession } from "@moa/auth/server";

import { AwaitingApproval } from "@/components/awaiting-approval";
import { ConsentPage } from "@/features/integrations";

export const metadata: Metadata = { title: "Connect an app", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

/**
 * Where a partner app's "Connect MyOtherApp" lands, after MyOtherApp's
 * authorization endpoint has checked the app and its request
 * (https://club-dashboard.myotherapp.in/connect/{request}).
 *
 * Its own page, outside the dashboard's shell, like /confirm: the person
 * came from another platform to do one thing. Signed out (or with a session
 * that has ended), it goes to sign-in with `?next=` pointing back here.
 */
export default async function ConnectAppPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId: raw } = await params;
  const requestId = decodeURIComponent(raw);
  const { user, refusal } = await checkSession();
  if (!user && refusal === CLUB_NOT_VERIFIED) return <AwaitingApproval />;
  if (!user) redirect(`/login?next=${encodeURIComponent(`/connect/${requestId}`)}`);
  return <ConsentPage requestId={requestId} />;
}
