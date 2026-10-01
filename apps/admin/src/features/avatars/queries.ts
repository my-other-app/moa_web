"use client";

import { useQuery } from "@tanstack/react-query";

import { staleTimes } from "@/lib/query-client";
import { fetchAvatars } from "./api";

export function useAvatars() {
  return useQuery({
    queryKey: ["avatars", "list"],
    queryFn: fetchAvatars,
    staleTime: staleTimes.reference,
  });
}
