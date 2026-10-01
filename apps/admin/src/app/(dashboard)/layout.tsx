import { redirect } from "next/navigation";
import { getSessionWithRole } from "@moa/auth/server";

import { AppShell } from "@/components/app-shell";

/**
 * Role gate for the whole dashboard.
 *
 * proxy.ts only checks that a session cookie exists; this is where the role is
 * actually verified, server-side, before any dashboard chrome is sent. A club
 * user holding a valid cookie gets bounced rather than shown an admin shell
 * whose every API call would then 403.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, allowed } = await getSessionWithRole(["admin"]);

  if (!user) redirect("/login");
  if (!allowed) redirect("/login?error=forbidden");

  return <AppShell user={user}>{children}</AppShell>;
}
