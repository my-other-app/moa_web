"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { staleTimes } from "@moa/app-kit";

import {
  fetchAuditActions,
  fetchAuditLog,
  fetchSentNotifications,
  type AuditQuery,
} from "./api";

export function useAuditLog(query: AuditQuery) {
  return useQuery({
    queryKey: ["audit-log", query],
    queryFn: () => fetchAuditLog(query),
    placeholderData: keepPreviousData,
  });
}

export function useAuditActions() {
  return useQuery({
    queryKey: ["audit-log", "actions"],
    queryFn: fetchAuditActions,
    staleTime: staleTimes.reference,
  });
}

export function useSentNotifications(query: { offset: number; limit: number }) {
  return useQuery({
    queryKey: ["sent-notifications", query],
    queryFn: () => fetchSentNotifications(query),
    placeholderData: keepPreviousData,
  });
}
