import type { Metadata } from "next";
import { PageHeader } from "@moa/app-kit";

import { ClubProfileFormView } from "@/features/club";

export const metadata: Metadata = { title: "Edit club profile" };

export default function EditProfilePage() {
  return (
    <>
      <PageHeader title="Edit Club Profile" />
      <ClubProfileFormView />
    </>
  );
}
