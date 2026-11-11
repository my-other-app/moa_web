import type { Metadata } from "next";
import { Suspense } from "react";

import { SocialAccountsPage } from "@/features/social";

export const metadata: Metadata = { title: "Social accounts" };

export default function ClubSocialPage() {
  // Suspense: the page reads ?social=… when a platform's sign-in sends the club back.
  return (
    <Suspense fallback={null}>
      <SocialAccountsPage />
    </Suspense>
  );
}
