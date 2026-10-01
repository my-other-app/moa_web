import { redirect } from "next/navigation";
import { getSessionWithRole } from "@moa/auth/server";

import { AppShell } from "@/components/app-shell";

/**
 * Club-role gate.
 *
 * Admins are deliberately not allowed in: this dashboard's every API call is
 * scoped to "the club of the signed-in user", and an admin has no club, so the
 * pages would render as a series of 403s rather than anything useful. Admin
 * tooling lives in its own app.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, allowed } = await getSessionWithRole(["club"]);

  if (!user) redirect("/login");
  if (!allowed) redirect("/login?error=forbidden");

  return <AppShell user={user}>{children}</AppShell>;
}
