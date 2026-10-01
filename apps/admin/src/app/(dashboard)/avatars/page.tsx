import type { Metadata } from "next";
import { PageHeader } from "@moa/app-kit";
import { AvatarGrid } from "@/features/avatars";

export const metadata: Metadata = { title: "Avatars" };

export default function AvatarsPage() {
  return (
    <>
      <PageHeader
        title="Avatars"
        description="The avatar set users pick from during onboarding."
      />
      <AvatarGrid />
    </>
  );
}
