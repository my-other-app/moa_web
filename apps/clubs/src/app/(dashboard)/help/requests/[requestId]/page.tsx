import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HelpGate, RequestPage } from "@/features/help";

export const metadata: Metadata = { title: "Help request" };

export default async function HelpRequestRoute({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const id = Number(requestId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <HelpGate>
      <RequestPage requestId={id} />
    </HelpGate>
  );
}
