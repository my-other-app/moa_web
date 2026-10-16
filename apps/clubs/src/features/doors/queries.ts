"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { createDoor, deleteDoor, fetchCheckInLog, fetchTeam, issueGateLink, revokeGateLink, undoCheckIn, updateDoor, updateGateSettings, updateTeamVolunteer, type CheckInLogQuery } from "./api";
import type { DoorKind, GateSettings } from "./schemas";

const teamKey = (eventId: number) => [...qk.events.detail(eventId), "team"] as const;
const logKey = (eventId: number) => [...qk.events.detail(eventId), "check-ins"] as const;

export function useTeam(eventId: number) {
  return useQuery({ queryKey: teamKey(eventId), queryFn: () => fetchTeam(eventId), staleTime: 10_000 });
}

/** Refetches the team and the volunteer list together: a change to one is a change to both. */
export function useRefreshTeam(eventId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: teamKey(eventId) });
    void qc.invalidateQueries({ queryKey: qk.events.volunteers(eventId) });
  };
}

export function useCreateDoor(eventId: number) {
  const refresh = useRefreshTeam(eventId);
  return useMutation({
    mutationFn: (body: { name: string; kind: DoorKind }) => createDoor(eventId, body),
    onSuccess: (d) => {
      toast.success(`${d.name} added`, { description: "It is on the console picker now." });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateDoor(eventId: number) {
  const refresh = useRefreshTeam(eventId);
  return useMutation({
    mutationFn: ({ doorId, ...body }: { doorId: string; name?: string; kind?: DoorKind; active?: boolean; sort_order?: number; link_can_walkup?: boolean }) => updateDoor(eventId, doorId, body),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteDoor(eventId: number) {
  const refresh = useRefreshTeam(eventId);
  return useMutation({
    mutationFn: (doorId: string) => deleteDoor(eventId, doorId),
    onSuccess: () => {
      toast.success("Door deleted");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useIssueGateLink(eventId: number) {
  const refresh = useRefreshTeam(eventId);
  return useMutation({
    mutationFn: ({ doorId, ...body }: { doorId: string; can_walkup: boolean; days?: number }) => issueGateLink(eventId, doorId, body),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRevokeGateLink(eventId: number) {
  const refresh = useRefreshTeam(eventId);
  return useMutation({
    mutationFn: (doorId: string) => revokeGateLink(eventId, doorId),
    onSuccess: () => {
      toast.success("Gate link switched off");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateTeamVolunteer(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ volunteerId, ...body }: { volunteerId: number; can_check_in?: boolean; can_walkup?: boolean; can_merch?: boolean; door_id?: string | null; clear_door?: boolean }) => updateTeamVolunteer(eventId, volunteerId, body),
    onSuccess: (team) => qc.setQueryData(teamKey(eventId), team),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateGateSettings(eventId: number) {
  const refresh = useRefreshTeam(eventId);
  return useMutation({
    mutationFn: (body: Partial<GateSettings>) => updateGateSettings(eventId, body),
    onSuccess: () => {
      toast.success("Door settings saved");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCheckInLog(q: CheckInLogQuery) {
  return useQuery({
    queryKey: [...logKey(q.eventId), q],
    queryFn: () => fetchCheckInLog(q),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
}

export function useUndoCheckIn(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) => undoCheckIn(eventId, registrationId),
    onSuccess: () => {
      toast.success("Check-in undone");
      void qc.invalidateQueries({ queryKey: logKey(eventId) });
      void qc.invalidateQueries({ queryKey: qk.events.registrations(eventId) });
      void qc.invalidateQueries({ queryKey: teamKey(eventId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
