"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { staleTimes } from "@/lib/query-client";
import { fetchOrgs, setOrgBlocked } from "./api";

export function useOrgs() {
  return useQuery({
    queryKey: qk.orgs.list({}),
    queryFn: fetchOrgs,
    // Reference data: organisations change rarely, so a long stale window
    // avoids refetching a list that is identical on every visit.
    staleTime: staleTimes.reference,
  });
}

export function useSetOrgBlocked() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, blocked }: { id: number; blocked: boolean }) =>
      setOrgBlocked(id, blocked),
    onSuccess: async (_data, variables) => {
      toast.success(variables.blocked ? "Organisation blocked" : "Organisation unblocked");
      // Blocking an org hides its clubs from the app, so club lists are stale too.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.orgs.all }),
        queryClient.invalidateQueries({ queryKey: qk.clubs.all }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
