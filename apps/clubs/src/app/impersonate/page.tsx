import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { ImpersonationHandoff } from "./handoff";

export const metadata: Metadata = { title: "Signing in…" };

/**
 * Exchanges an admin's short-lived hand-off token for a session on this app.
 *
 * It has to live here rather than on the admin dashboard: a session cookie
 * can only be set by the origin it belongs to, and the two dashboards are
 * different hosts.
 */
export default function ImpersonatePage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <Suspense fallback={<Skeleton className="h-24 w-72" />}>
        <ImpersonationHandoff />
      </Suspense>
    </main>
  );
}
