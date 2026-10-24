import type { Metadata } from "next";

import { WhatsAppSettingsPage } from "@/features/whatsapp";

export const metadata: Metadata = { title: "WhatsApp settings" };

export default function ClubWhatsAppSettingsPage() {
  return <WhatsAppSettingsPage />;
}
