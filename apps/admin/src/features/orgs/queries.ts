"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { staleTimes } from "@moa/app-kit";
import {
  createOrg,
  deleteOrg,
  fetchOrg,
  fetchOrgAnalytics,
  fetchOrgs,
  setOrgBlocked,
  updateOrg,
} from "./api";
import type { OrgFormInput } from "./schemas";

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

export function useOrg(orgId: number) {
  return useQuery({
    queryKey: qk.orgs.detail(orgId),
    queryFn: () => fetchOrg(orgId),
  });
}

export function useOrgAnalytics(orgId: number) {
  return useQuery({
    queryKey: [...qk.orgs.detail(orgId), "analytics"],
    queryFn: () => fetchOrgAnalytics(orgId),
    staleTime: staleTimes.analytics,
  });
}

/** Clubs and the dashboard counters both move when an org changes. */
async function invalidateOrgs(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.orgs.all }),
    queryClient.invalidateQueries({ queryKey: qk.clubs.all }),
    queryClient.invalidateQueries({ queryKey: qk.analytics.all }),
  ]);
}

export function useCreateOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, logo }: { input: OrgFormInput; logo?: File | null }) =>
      createOrg(input, logo),
    onSuccess: async () => {
      toast.success("Organisation created");
      await invalidateOrgs(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateOrg(orgId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, logo }: { input: OrgFormInput; logo?: File | null }) =>
      updateOrg(orgId, input, logo),
    onSuccess: async () => {
      toast.success("Organisation updated");
      await invalidateOrgs(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteOrg,
    onSuccess: async () => {
      toast.success("Organisation deleted");
      await invalidateOrgs(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
