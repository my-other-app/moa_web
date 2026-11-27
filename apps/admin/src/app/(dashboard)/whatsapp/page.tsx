import type { Metadata } from "next";
import { PageHeader } from "@moa/app-kit";

import { WhatsAppInboxPage } from "@/features/platform-whatsapp";

export const metadata: Metadata = { title: "WhatsApp" };

export default function WhatsAppRoute() {
  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Messages guests send to MyOtherApp's number (+91 90373 77025), beside the tickets, reminders and certificates it sent them."
      />
      <WhatsAppInboxPage />
    </>
  );
}
