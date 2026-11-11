import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { CLUB_NOT_VERIFIED } from "@moa/auth";
import { checkSession } from "@moa/auth/server";

import { AwaitingApproval } from "@/components/awaiting-approval";
import { ConsentPage, consentPath, oauthParams } from "@/features/integrations";

export const metadata: Metadata = { title: "Connect an app", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

/**
 * Where a partner app's "Connect MyOtherApp" lands: MyOtherApp's
 * /partner/oauth/authorize checks the request, then sends the browser to
 * https://club-dashboard.myotherapp.in/integrations/connect with the
 * request's own parameters (client_id, redirect_uri, scope, state, the PKCE
 * challenge, mode).
 *
 * Its own page, outside the dashboard's shell, like /confirm: the person
 * came from another platform to do one thing. Signed out (or with a session
 * that has ended), it goes to sign-in with `?next=` pointing back here,
 * the request and all.
 */
export default async function ConnectAppPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = oauthParams(await searchParams);
  const { user, refusal } = await checkSession();
  if (!user && refusal === CLUB_NOT_VERIFIED) return <AwaitingApproval />;
  if (!user) redirect(`/login?next=${encodeURIComponent(consentPath(params))}`);
  return <ConsentPage params={params} />;
}
