import { redirect } from "next/navigation";
import { getSessionWithRole } from "@moa/auth/server";

import { AppShell } from "@/components/app-shell";
import { readOpsMeOnServer } from "@/features/ops/server";

/**
 * Role gate for the whole dashboard.
 *
 * proxy.ts only checks that a session cookie exists; this is where the role is
 * actually verified, server-side, before any dashboard chrome is sent. A club
 * user holding a valid cookie gets bounced rather than shown an admin shell
 * whose every API call would then 403.
 *
 * Then two-factor: an admin whose grace is over and who has not turned it on
 * is sent to set it up (/setup-2fa) -- every admin route refuses them until
 * then (403 ADMIN_2FA_REQUIRED). A backend without the probe says nothing,
 * and nothing changes.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, allowed } = await getSessionWithRole(["admin"]);

  if (!user) redirect("/login");
  if (!allowed) redirect("/login?error=forbidden");

  const ops = await readOpsMeOnServer();
  if (ops?.two_factor?.blocked) redirect("/setup-2fa");

  return <AppShell user={user}>{children}</AppShell>;
}
