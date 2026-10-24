import type { Metadata } from "next";

import { WhatsAppTemplatesPage } from "@/features/whatsapp";

export const metadata: Metadata = { title: "WhatsApp templates" };

export default function ClubWhatsAppTemplatesPage() {
  return <WhatsAppTemplatesPage />;
}
