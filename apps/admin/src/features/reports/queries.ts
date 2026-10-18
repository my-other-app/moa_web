"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, qk } from "@moa/api";
import { toast } from "@moa/ui";

import { fetchOpenReportCount, fetchReports, resolveReport, type ReportQuery, type ResolveInput } from "./api";
import { REPORT_ERRORS, resolvedMessage } from "./schemas";

/** Every report list and the open count, so one decision refreshes the lot. */
export const REPORTS_KEY = ["admin-reports"] as const;

/** How often the rail asks for the open count: the same minute the bell keeps. */
export const OPEN_COUNT_POLL_MS = 60_000;

export function useReports(query: ReportQuery) {
  return useQuery({
    queryKey: [...REPORTS_KEY, "list", query],
    queryFn: () => fetchReports(query),
    placeholderData: keepPreviousData,
  });
}

/**
 * The open count beside Reports in the rail: asked every minute, and again
 * when the admin comes back to the tab (the app turns that off elsewhere).
 */
export function useOpenReportCount() {
  return useQuery({
    queryKey: [...REPORTS_KEY, "open-count"],
    queryFn: fetchOpenReportCount,
    refetchInterval: OPEN_COUNT_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: OPEN_COUNT_POLL_MS / 2,
  });
}

/** A report gone (404) or already decided (409): the list on screen is out of date. */
export function isStale(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 404);
}

/** Decided elsewhere already (409 ALREADY_RESOLVED): nothing to say, only the list to read again. */
export function isAlreadyResolved(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.errorCode === REPORT_ERRORS.alreadyResolved);
}

export function useResolveReport() {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: REPORTS_KEY }),
      // Written to the activity log; a suspension changes the user's row.
      queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      queryClient.invalidateQueries({ queryKey: qk.users.all }),
    ]);
  return useMutation({
    mutationFn: (input: ResolveInput) => resolveReport(input),
    onSuccess: async (result, input) => {
      toast.success(resolvedMessage(input.action, result));
      await refresh();
    },
    // The dialog shows the server's words; a stale row is read again.
    onError: async (error: Error) => {
      if (isStale(error)) await refresh();
    },
  });
}
