"use client";

import { useQuery } from "@tanstack/react-query";
import { api, useSession } from "@moa/app-kit";
import { roleOf } from "@moa/auth";
import { z } from "zod";

import { nullIfAhead } from "@/lib/ahead-of-api";

const teamsSchema = z.array(z.object({ key: z.string(), members: z.array(z.object({ user_id: z.coerce.number() })).catch([]) })).catch([]);

/**
 * Whether "Make a lead" has somewhere to go: the API has Team work (its
 * badge answers) and the signed-in admin may add leads — an admin owner, or
 * a member of the Sales team. Speakers ship apart from Team work, so this
 * asks the API itself rather than reaching into that feature.
 */
export function useTeamworkProbe(): boolean {
  const { data: user } = useSession();
  const on = useQuery({
    queryKey: ["admin", "speakers", "teamwork-probe"],
    queryFn: () => nullIfAhead(() => api.get<unknown>("/api/v1/admin/teamwork/badge")),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const owner = roleOf(user ?? null) === "owner";
  const teams = useQuery({
    queryKey: ["admin", "speakers", "teams"],
    queryFn: async () => teamsSchema.parse(await api.get<unknown>("/api/v1/admin/teams")),
    enabled: Boolean(on.data) && !owner,
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!on.data) return false;
  if (owner) return true;
  return Boolean(user && teams.data?.some((t) => t.key === "sales" && t.members.some((m) => m.user_id === user.id)));
}
