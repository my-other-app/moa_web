import type { Metadata } from "next";

import { InvitationsPage } from "@/features/cohosts";

export const metadata: Metadata = { title: "Invitations" };

export default function CohostInvitationsPage() {
  // The screen brings its own header, as every rebuilt screen does.
  return <InvitationsPage />;
}
