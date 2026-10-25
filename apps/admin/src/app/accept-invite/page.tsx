import type { Metadata } from "next";

import { AcceptInvite } from "@/features/admins";

export const metadata: Metadata = { title: "Set your password" };

type Query = { token?: string | string[] };

/** An invited admin's set-password link (no session: proxy.ts leaves it open). */
export default async function AcceptInvitePage({ searchParams }: { searchParams?: Promise<Query> } = {}) {
  const query = (await searchParams) ?? {};
  const token = Array.isArray(query.token) ? query.token[0] : query.token;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <AcceptInvite token={token?.trim() || null} />
    </main>
  );
}
