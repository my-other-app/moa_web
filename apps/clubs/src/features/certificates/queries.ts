"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { useRefreshDeliveries } from "@/features/deliveries";

import { toastError } from "@/features/plan/errors";

import {
  fetchCertificateSummary,
  fetchCertificates,
  fetchIssuePreview,
  issueCertificates,
  setCertificateRevoked,
  type CertificateQuery,
  type IssueBody,
} from "./api";

const root = (eventId: number) => [...qk.events.detail(eventId), "certificates"] as const;

export function useCertificateSummary(eventId: number) {
  return useQuery({
    queryKey: [...root(eventId), "summary"],
    queryFn: () => fetchCertificateSummary(eventId),
    staleTime: 10_000,
  });
}

export function useIssuePreview(eventId: number, body: IssueBody) {
  return useQuery({
    queryKey: [...root(eventId), "issue-preview", body],
    queryFn: () => fetchIssuePreview(eventId, body),
    enabled: body.audience !== "roles" || body.roles.length > 0,
    staleTime: 10_000,
  });
}

export function useCertificates(q: CertificateQuery) {
  return useQuery({
    queryKey: [...root(q.eventId), "list", q],
    queryFn: () => fetchCertificates(q),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useIssueCertificates(eventId: number) {
  const refresh = useRefreshDeliveries(eventId);
  return useMutation({
    mutationFn: (body: IssueBody) => issueCertificates(eventId, body),
    onSuccess: (r) => {
      toast.success(
        r.issued ? `${r.issued} ${r.issued === 1 ? "certificate" : "certificates"} issued` : r.refreshed ? `${r.refreshed} brought onto the current design` : "Nothing new to issue",
        { description: r.issued ? "Send them when you are ready; each carries its own number." : `${r.already_issued} already had one.` }
      );
      refresh();
    },
    onError: toastError,
  });
}

export function useRevokeCertificate(eventId: number) {
  const refresh = useRefreshDeliveries(eventId);
  return useMutation({
    mutationFn: ({ registrationId, revoke }: { registrationId: string; revoke: boolean }) =>
      setCertificateRevoked(eventId, registrationId, revoke),
    onSuccess: (state) => {
      toast.success(state.revoked_at ? `${state.number} revoked` : `${state.number} reinstated`, {
        description: state.revoked_at ? "Its QR now says so, and the download is refused." : "It verifies and downloads again.",
      });
      refresh();
    },
    onError: toastError,
  });
}
