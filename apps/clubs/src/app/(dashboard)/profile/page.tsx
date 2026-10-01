import type { Metadata } from "next";
import { PageHeader } from "@moa/app-kit";

import { ClubProfileFormView } from "@/features/club";

export const metadata: Metadata = { title: "Club profile" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Club profile"
        description="How your club appears to students in the app."
      />
      <ClubProfileFormView />
    </>
  );
}
