import type { Metadata } from "next";

import { WhatsAppBroadcastsPage } from "@/features/whatsapp";

export const metadata: Metadata = { title: "WhatsApp broadcasts" };

export default function ClubWhatsAppBroadcastsPage() {
  return <WhatsAppBroadcastsPage />;
}
