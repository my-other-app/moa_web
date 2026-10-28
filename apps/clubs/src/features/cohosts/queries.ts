"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, nullIfRouteMissing, qk } from "@moa/api";
import { toast } from "@moa/ui";

import { useEventDetail } from "@/features/events/queries";
import { toastError } from "@/features/plan/errors";

import {
  answerInvitation,
  endCohost,
  fetchCohosts,
  fetchInvitations,
  inviteCohost,
  leaveCohostedEvent,
  searchCohostClubs,
  type InvitationFilter,
} from "./api";
import { SEARCH_MIN, cohostsSupported, hostOnlyReason, searchTerm, type HostOnlyAction, type ViewerRole } from "./schemas";

export const cohostsKey = (eventId: number) => [...qk.events.detail(eventId), "cohosts"] as const;
export const INVITATIONS_KEY = ["cohost-invitations"] as const;

/**
 * The event's co-hosts: the host, who is looking, and every invite.
 * `null`: a server from before co-hosts (a bare 404), and the tab says so.
 */
export function useCohosts(eventId: number, enabled = true) {
  return useQuery({
    queryKey: cohostsKey(eventId),
    queryFn: () => nullIfRouteMissing(() => fetchCohosts(eventId)),
    enabled: enabled && eventId > 0,
    staleTime: 10_000,
    retry: false,
  });
}

/** Clubs to invite, once two characters are typed. */
export function useCohostSearch(eventId: number, raw: string, enabled = true) {
  const q = searchTerm(raw);
  return useQuery({
    queryKey: [...cohostsKey(eventId), "search", q],
    queryFn: () => searchCohostClubs(eventId, q),
    enabled: enabled && q.length >= SEARCH_MIN,
    staleTime: 15_000,
    retry: false,
  });
}

/** Everything a change to an event's co-hosts moves: its list, its detail, the events list. */
function useRefreshEvent(eventId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: cohostsKey(eventId) });
    void qc.invalidateQueries({ queryKey: qk.events.detail(eventId) });
    void qc.invalidateQueries({ queryKey: [...qk.events.all, "list"] });
  };
}

/**
 * A refusal that means the list moved under the organiser (someone else
 * answered, the invite expired, the event closed): say so, and read it again.
 */
function refuse(refresh: () => void) {
  return (error: unknown) => {
    toastError(error);
    if (error instanceof ApiError && (error.status === 409 || error.status === 410 || error.status === 404)) refresh();
  };
}

export function useInviteCohost(eventId: number) {
  const refresh = useRefreshEvent(eventId);
  return useMutation({
    mutationFn: (body: { club_id: number; note?: string; name: string }) => inviteCohost(eventId, { club_id: body.club_id, note: body.note }),
    onSuccess: (row) => {
      toast.success(`Invite sent to ${row.club.name}`, { description: "Their owner and admins are told on their dashboard and by email." });
      refresh();
    },
    onError: refuse(refresh),
  });
}

/** Cancels a pending invite, or removes a co-host: the server decides which by the invite's status. */
export function useEndCohost(eventId: number) {
  const refresh = useRefreshEvent(eventId);
  return useMutation({
    mutationFn: (inviteId: number) => endCohost(eventId, inviteId),
    onSuccess: (row) => {
      toast.success(row.status === "removed" ? `${row.club.name} is no longer a co-host` : `Invite to ${row.club.name} cancelled`);
      refresh();
    },
    onError: refuse(refresh),
  });
}

/** A co-host leaving: its team loses the event at once, so the caller moves off it. */
export function useLeaveEvent(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => leaveCohostedEvent(eventId),
    onSuccess: () => {
      toast.success("You left the event", { description: "Your team no longer sees it. The host can invite you again." });
      void qc.invalidateQueries({ queryKey: qk.events.all });
      void qc.invalidateQueries({ queryKey: INVITATIONS_KEY });
    },
    onError: toastError,
  });
}

/**
 * The club's invitations: pending ones, or every one. `null`: a server from
 * before co-hosts, and the page says so.
 */
export function useInvitations(status: InvitationFilter = "pending", enabled = true) {
  return useQuery({
    queryKey: [...INVITATIONS_KEY, status],
    queryFn: () => nullIfRouteMissing(() => fetchInvitations(status)),
    enabled,
    staleTime: 30_000,
    // The home card and the menu badge follow new invites without a reload.
    refetchInterval: status === "pending" ? 120_000 : false,
    retry: false,
  });
}

/**
 * Whether the API has co-host invitations (for the menu), and how many wait.
 * `undefined` while it is asked; `false` on a server without them.
 */
export function useInvitationsOnServer(enabled = true): { on: boolean | undefined; pending: number } {
  const q = useInvitations("pending", enabled);
  if (q.data === null || q.isError) return { on: false, pending: 0 };
  if (q.data) return { on: true, pending: q.data.pending };
  return { on: undefined, pending: 0 };
}

export function useAnswerInvitation() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: INVITATIONS_KEY });
    void qc.invalidateQueries({ queryKey: qk.events.all });
  };
  return useMutation({
    mutationFn: ({ id, answer }: { id: number; answer: "accept" | "decline" }) => answerInvitation(id, answer),
    onSuccess: (row, { answer }) => {
      if (answer === "accept") toast.success(`You're co-hosting ${row.event.name}`, { description: `It's in your events now, with ${row.host.name}.` });
      else toast.success(`Invitation from ${row.host.name} declined`);
      refresh();
    },
    onError: refuse(refresh),
  });
}

// ─── The event as the signed-in club sees it ────────────────────────────

export interface EventStance {
  /** The server has co-hosts (the detail carries `cohosts` or `viewer_role`). */
  supported: boolean;
  /** "host", "cohost", or null while unknown / on an older server. */
  role: ViewerRole | null;
  /** This club co-hosts the event: the host-only actions are not its to take. */
  cohost: boolean;
  /** The host club's name, for "Only Design Society can …". */
  hostName: string | null;
  /** The sentence a co-host sees in place of a host-only action; null for the host. */
  reason: (action: HostOnlyAction) => string | null;
}

/**
 * Whether the signed-in club hosts or co-hosts the event, from the event's
 * detail (one shared request with the console). Until it is known, and on a
 * server without co-hosts, it is the host: nothing is hidden on a guess, and
 * the server refusing (403 COHOST_HOST_ONLY) is what actually holds.
 */
export function useEventStance(eventId: number): EventStance {
  const detail = useEventDetail(eventId);
  const d = detail.data;
  const supported = cohostsSupported(d);
  const role = supported ? (d?.viewer_role ?? null) : null;
  const cohost = role === "cohost";
  const hostName = d?.club?.name ?? null;
  return {
    supported,
    role,
    cohost,
    hostName,
    reason: (action) => (cohost ? hostOnlyReason(action, hostName) : null),
  };
}
