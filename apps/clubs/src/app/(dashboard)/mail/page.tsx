import type { Metadata } from "next";

import { MailboxPage } from "@/features/mailbox";

export const metadata: Metadata = { title: "Mail" };

export default function ClubMailPage() {
  return <MailboxPage />;
}
