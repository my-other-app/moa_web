import type { Metadata } from "next";

import { ClubProfilePage } from "@/features/club";

export const metadata: Metadata = { title: "Club profile" };

export default function EditProfilePage() {
  return <ClubProfilePage />;
}
