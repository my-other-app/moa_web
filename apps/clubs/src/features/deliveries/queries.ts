"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import {
  fetchDeliveryLog,
  fetchDeliverySummary,
  reinstateTicket,
  revokeTicket,
  sendDocuments,
  sendOneDocument,
  type DeliveryLogQuery,
  type DocumentKind,
  type SendScope,
} from "./api";
import type { SendResponse } from "./schemas";

const summaryKey = (eventId: number, kind: DocumentKind) => [...qk.events.detail(eventId), "deliveries", "summary", kind] as const;
const logKey = (q: DeliveryLogQuery) => [...qk.events.detail(q.eventId), "deliveries", "log", q] as const;

export function useDeliverySummary(eventId: number, kind: DocumentKind = "ticket") {
  return useQuery({
    queryKey: summaryKey(eventId, kind),
    queryFn: () => fetchDeliverySummary(eventId, kind),
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
    // A send in flight changes its row and the tally as it lands.
    refetchInterval: (query) => (query.state.data?.tally.pending ? 3_000 : false),
  });
}

export type TallyKind = "ticket" | "certificate" | "message";

/** One kind's tally, without its rows: the figures a page leads with. */
export function useDeliveryTally(eventId: number, kind: TallyKind) {
  const q = { eventId, kind, page: 1, pageSize: 1 };
  return useQuery({
    queryKey: logKey(q),
    queryFn: () => fetchDeliveryLog(q),
    select: (d) => d.tally,
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.data?.tally.pending ? 3_000 : false),
  });
}

/** Tickets, certificates and messages, each on its own, for a page that reads them side by side. */
export function useDeliveryTallies(eventId: number) {
  const ticket = useDeliveryTally(eventId, "ticket");
  const certificate = useDeliveryTally(eventId, "certificate");
  const message = useDeliveryTally(eventId, "message");
  return {
    ticket: ticket.data,
    certificate: certificate.data,
    message: message.data,
    isPending: ticket.isPending || certificate.isPending || message.isPending,
    isError: ticket.isError || certificate.isError || message.isError,
  };
}

const describeSend = (r: SendResponse) => {
  const parts = [];
  if (r.already_sent) parts.push(`${r.already_sent} already sent were not sent again.`);
  if (r.revoked) parts.push(`${r.revoked} revoked ${r.revoked === 1 ? "ticket was" : "tickets were"} left out.`);
  parts.push("Guests with no email address are skipped, not failed.");
  return parts.join(" ");
};

/** Every mutation here changes what the lists and the summaries say, so all of them are refreshed. */
export function useRefreshDeliveries(eventId: number) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.events.registrations(eventId) });
    void queryClient.invalidateQueries({ queryKey: [...qk.events.detail(eventId), "deliveries"] });
    void queryClient.invalidateQueries({ queryKey: [...qk.events.detail(eventId), "certificates"] });
  };
}
const useRefresh = useRefreshDeliveries;

export function useSendDocuments(eventId: number, kind: DocumentKind) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: (only: SendScope) => sendDocuments(eventId, kind, only),
    onSuccess: (r) => {
      toast.success(r.queued ? `Sending to ${r.queued} ${r.queued === 1 ? "guest" : "guests"}` : "Nothing to send", {
        description: describeSend(r),
      });
      refresh();
    },
    onError: toastError,
  });
}

export const useSendTickets = (eventId: number) => useSendDocuments(eventId, "ticket");

export function useSendOneDocument(eventId: number, kind: DocumentKind) {
  const refresh = useRefresh(eventId);
  return useMutation({
    mutationFn: (registrationId: string) => sendOneDocument(eventId, kind, registrationId),
    onSuccess: (r) => {
      toast.success(r.queued ? `${kind === "ticket" ? "Ticket" : "Certificate"} queued again` : "Nothing to send", {
        description: r.queued ? "Delivery shows on the list as it lands." : describeSend(r),
      });
      refresh();
    },
    onError: toastError,
  });
}

export const useSendOneTicket = (eventId: number) => useSendOneDocument(eventId, "ticket");

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
    onError: toastError,
  });
}
