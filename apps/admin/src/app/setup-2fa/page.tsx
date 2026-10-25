import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionWithRole } from "@moa/auth/server";

import { SetupTwoFactor } from "@/features/ops";

export const metadata: Metadata = { title: "Set up two-factor" };

/**
 * Where an admin who must turn on two-factor is sent (the dashboard layout,
 * and any admin call refused with ADMIN_2FA_REQUIRED). Outside the dashboard,
 * so it has no rail of pages they cannot open yet; signed in, as an admin.
 */
export default async function SetupTwoFactorPage() {
  const { user, allowed } = await getSessionWithRole(["admin"]);
  if (!user) redirect("/login?next=%2Fsetup-2fa");
  if (!allowed) redirect("/login?error=forbidden");

  return (
    <main className="bg-canvas grid min-h-dvh place-items-center px-4 py-10">
      <SetupTwoFactor name={user.full_name || user.username} />
    </main>
  );
}
