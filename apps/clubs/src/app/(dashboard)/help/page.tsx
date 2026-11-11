import type { Metadata } from "next";
import { PageHeader } from "@moa/app-kit";

import { HelpGate, HelpPage } from "@/features/help";

export const metadata: Metadata = { title: "Help" };

export default function HelpRoute() {
  return (
    <>
      <PageHeader title="Help" description="Answers to common questions, and a line to the MyOtherApp team when you need one." />
      <HelpGate>
        <HelpPage />
      </HelpGate>
    </>
  );
}
