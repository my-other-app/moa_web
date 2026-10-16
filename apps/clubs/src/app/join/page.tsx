import type { Metadata } from "next";
import { Suspense } from "react";

import { JoinPage } from "@/features/access";

export const metadata: Metadata = { title: "Join your club", robots: { index: false, follow: false } };

/** Where an invite link lands. Public: the token in the link is the only key. */
export default function JoinRoute() {
  return (
    <Suspense>
      <JoinPage />
    </Suspense>
  );
}
