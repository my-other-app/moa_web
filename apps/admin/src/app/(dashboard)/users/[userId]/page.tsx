import type { Metadata } from "next";

import { UserDetail } from "@/features/users";

export const metadata: Metadata = { title: "User" };

export default async function UserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <UserDetail userId={Number(userId)} />;
}
