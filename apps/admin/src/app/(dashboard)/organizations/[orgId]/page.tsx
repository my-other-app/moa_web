import type { Metadata } from "next";

import { OrgDetail } from "@/features/orgs";

export const metadata: Metadata = { title: "Organisation" };

export default async function OrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  return <OrgDetail orgId={Number(orgId)} />;
}
