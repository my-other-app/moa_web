import type { Metadata } from "next";
import { PageHeader } from "@moa/app-kit";

import { ClubProfileView } from "@/features/club";

export const metadata: Metadata = { title: "Club profile" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Club Profile" />
      <ClubProfileView />
    </>
  );
}
