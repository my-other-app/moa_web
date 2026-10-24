import type { Metadata } from "next";

import { WhatsAppInboxPage } from "@/features/whatsapp";

export const metadata: Metadata = { title: "WhatsApp" };

export default function ClubWhatsAppPage() {
  return <WhatsAppInboxPage />;
}
