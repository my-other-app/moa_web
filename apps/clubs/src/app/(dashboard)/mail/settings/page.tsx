import type { Metadata } from "next";

import { MailSettingsPage } from "@/features/mailbox";

export const metadata: Metadata = { title: "Mail settings" };

export default function ClubMailSettingsPage() {
  return <MailSettingsPage />;
}
