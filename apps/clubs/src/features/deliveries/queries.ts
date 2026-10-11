"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import {
  fetchDeliveryLog,
  fetchDeliverySummary,
  reinstateTicket,
  revokeTicket,
  sendOneTicket,
  sendTickets,
  type DeliveryLogQuery,
  type SendScope,
} from "./api";
import type { SendResponse } from "./schemas";

const summaryKey = (eventId: number) => [...qk.events.detail(eventId), "deliveries", "summary"] as const;
const logKey = (q: DeliveryLogQuery) => [...qk.events.detail(q.eventId), "deliveries", "log", q] as const;

export function useDeliverySummary(eventId: number) {
  return useQuery({
    queryKey: summaryKey(eventId),
    queryFn: () => fetchDeliverySummary(eventId),
    // Sends finish in the background after the click; the numbers follow.
    refetchInterval: (query) => (query.state.data?.channels.some((c) => c.pending > 0) ? 3_000 : false),
    staleTime: 10_000,
  });
}

export function useDeliveryLog(q: DeliveryLogQuery) {
  return useQuery({
    queryKey: logKey(q),
    queryFn: () => fetchDeliveryLog(q),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

const describeSend = (r: SendResponse) => {
  const parts = [];
  if (r.already_sent) parts.push(`${r.already_sent} already sent were not sent again.`);
  if (r.revoked) parts.push(`${r.revoked} revoked ${r.revoked === 1 ? "ticket was" : "tickets were"} left out.`);
  parts.push("Guests with no email address are skipped, not failed.");
  return parts.join(" ");
};

/** Every mutation here changes what the attendee list and the summary say, so both are refreshed. */
function useRefresh(eventId: number) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.events.registrations(eventId) });
    void queryClient.invalidateQueries({ queryKey: [...qk.events.detail(eventId), "deliveries"] });
  };
}

export function useSendTickets(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: (only: SendScope) => sendTickets(eventId, only),
    onSuccess: (r) => {
      toast.success(r.queued ? `Sending to ${r.queued} ${r.queued === 1 ? "guest" : "guests"}` : "Nothing to send", {
        description: describeSend(r),
      });
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useSendOneTicket(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: (registrationId: string) => sendOneTicket(eventId, registrationId),
    onSuccess: (r) => {
      toast.success(r.queued ? "Ticket queued again" : "Nothing to send", {
        description: r.queued ? "Delivery shows on the list as it lands." : describeSend(r),
      });
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRevokeTicket(eventId: number) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: ({ registrationId, revoke, reason }: { registrationId: string; revoke: boolean; reason?: string }) =>
      revoke ? revokeTicket(eventId, registrationId, reason) : reinstateTicket(eventId, registrationId),
    onSuccess: (state) => {
      toast.success(state.revoked_at ? "Ticket revoked" : "Ticket reinstated", {
        description: state.revoked_at
          ? "Check-in refuses it from now on, and nothing is sent for it until it is reinstated."
          : "Check-in accepts it again.",
      });
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
