import type { Metadata } from "next";

import { ThreadsPage } from "@/features/threads";

export const metadata: Metadata = { title: "Threads" };

export default function ClubThreadsPage() {
  return <ThreadsPage />;
}
