import type { Metadata } from "next";
import { PageHeader } from "@moa/app-kit";

import { ClubSpeakersPage } from "@/features/speakers";

export const metadata: Metadata = { title: "Speakers" };

export default function SpeakersRoute() {
  return (
    <>
      <PageHeader title="Speakers" description="Everyone who has spoken at your events, with your own contact details and notes for them." />
      <ClubSpeakersPage />
    </>
  );
}
