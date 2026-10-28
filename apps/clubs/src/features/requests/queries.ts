"use client";

import * as React from "react";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { nullIfRouteMissing, qk } from "@moa/api";
import { toast } from "@moa/ui";

import { TICKETING_KEY } from "@/features/ticketing/queries";

import { approveAllPending, approveRequests, declineAllPending, declineRequests, fetchRequests, fetchRequestsExport, reopenRequests } from "./api";
import { confirmAllWaiting, confirmIds, declineAllWaiting, declineIds, summarise, type BulkOutcome, type BulkProgress } from "./bulk";
import { PAGE_SIZE, indiaTime, skipReasonText, type RegistrationRequest, type RequestPage, type RequestStatus, type RequestTab } from "./schemas";

/**
 * Every read here is `null` from a backend without registration requests
 * (the route answers FastAPI's bare 404): the dashboard goes out ahead of
 * its backend, and the Requests tab and the event form's switch stay away
 * until the API has them.
 */
export const requestsKey = (eventId: number) => ["registration-requests", eventId] as const;
const countsKey = (eventId: number) => [...requestsKey(eventId), "counts"] as const;
const listsKey = (eventId: number) => [...requestsKey(eventId), "list"] as const;
const listKey = (eventId: number, status: RequestTab, q: string) => [...listsKey(eventId), status, q] as const;

type Pages = InfiniteData<RequestPage | null, string | null>;

/**
 * The event's counts and places left (one row of its waiting requests), or
 * null when the API has no requests yet. What decides whether the event
 * shows a Requests tab, and its badge.
 */
export function useRequestCounts(eventId: number, enabled = true) {
  return useQuery({
    queryKey: countsKey(eventId),
    queryFn: () => nullIfRouteMissing(() => fetchRequests(eventId, { status: "pending", limit: 1 })),
    enabled: eventId > 0 && enabled,
    staleTime: 15_000,
    retry: false,
  });
}

/** Whether this event's API has requests: true or false once known, undefined while asking. */
export function useRequestsOnServer(eventId: number | undefined): boolean | undefined {
  const q = useRequestCounts(eventId ?? 0, Boolean(eventId));
  if (!eventId || q.isError) return false;
  if (q.data === undefined) return undefined;
  return q.data !== null;
}

/** One status's requests (or all of them), a page at a time by the server's cursor ("Load more"). */
export function useRequestList(eventId: number, status: RequestTab, q: string) {
  return useInfiniteQuery({
    queryKey: listKey(eventId, status, q),
    queryFn: ({ pageParam }) => nullIfRouteMissing(() => fetchRequests(eventId, { status, q, after: pageParam, limit: PAGE_SIZE })),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last?.next ?? undefined,
    // Another tab or search keeps the counts and the toolbar on screen while it loads.
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    retry: false,
  });
}

/** After a decision: the badge, the overview and attendees, ticket sales, the events list. */
function refreshAround(queryClient: QueryClient, eventId: number) {
  void queryClient.invalidateQueries({ queryKey: countsKey(eventId) });
  void queryClient.invalidateQueries({ queryKey: qk.events.all });
  void queryClient.invalidateQueries({ queryKey: TICKETING_KEY });
}

/**
 * One row decided from the list: it leaves the list it was on and the counts
 * move, in place, so the club keeps its place in a long list (on All it
 * stays, with its new status). The other lists are marked stale and read
 * again when opened.
 */
function moveRows(queryClient: QueryClient, eventId: number, ids: ReadonlySet<string>, from: RequestStatus, to: RequestStatus, placesLeft?: number | null) {
  const n = ids.size;
  for (const [key, data] of queryClient.getQueriesData<Pages>({ queryKey: listsKey(eventId) })) {
    if (!data) continue;
    // listKey: [..., "list", status, q]
    const status = key[3] as RequestTab;
    queryClient.setQueryData<Pages>(key, {
      ...data,
      pages: data.pages.map((p) =>
        p
          ? {
              ...p,
              items: status === from ? p.items.filter((r) => !ids.has(r.id)) : status === "all" ? p.items.map((r) => (ids.has(r.id) ? { ...r, status: to } : r)) : p.items,
              counts: { ...p.counts, [from]: Math.max(0, p.counts[from] - n), [to]: p.counts[to] + n },
              places_left: placesLeft === undefined ? p.places_left : placesLeft,
            }
          : p,
      ),
    });
  }
  void queryClient.invalidateQueries({ queryKey: listsKey(eventId), refetchType: "none" });
  refreshAround(queryClient, eventId);
}

/** Confirm one request from its row. */
export function useConfirmRequest(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (r: RegistrationRequest) => approveRequests(eventId, [r.id]),
    onSuccess: (res, r) => {
      const ok = res.approved.find((a) => a.id === r.id);
      if (ok) {
        toast.success(ok.pay_by ? `${r.full_name} is confirmed. They were sent a link to pay by ${indiaTime(ok.pay_by)}.` : `${r.full_name} is confirmed. Their ticket is on its way.`);
        moveRows(queryClient, eventId, new Set([r.id]), "pending", "approved", res.places_left);
        return;
      }
      const why = res.skipped.find((s) => s.id === r.id)?.reason ?? "not_pending";
      toast.error(`${r.full_name} wasn't confirmed, because ${skipReasonText(why)}.`);
      if (why === "not_pending") {
        void queryClient.invalidateQueries({ queryKey: listsKey(eventId) });
        refreshAround(queryClient, eventId);
      }
    },
    onError: (e) => toast.error(e instanceof Error && e.message ? e.message : "That didn't go through. Try again."),
  });
}

/** Back to waiting: a declined or lapsed request. */
export function useReopenRequest(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (r: RegistrationRequest) => reopenRequests(eventId, [r.id]),
    onSuccess: (res, r) => {
      const refused = res.skipped.find((s) => s.id === r.id);
      if (refused) {
        toast.error(`${r.full_name} couldn't be put back among the requests waiting for you, because ${skipReasonText(refused.reason)}.`);
        // Whatever it is now (decided again, or asked afresh), the lists say so.
        void queryClient.invalidateQueries({ queryKey: listsKey(eventId) });
        refreshAround(queryClient, eventId);
        return;
      }
      toast.success(`${r.full_name} is waiting for you to confirm again.`);
      moveRows(queryClient, eventId, new Set([r.id]), r.status, "pending");
    },
    onError: (e) => toast.error(e instanceof Error && e.message ? e.message : "That didn't go through. Try again."),
  });
}

/** What a bulk run is asked to do. */
export type BulkPlan =
  | { kind: "confirm"; ids: string[] }
  | { kind: "confirm-all"; total: number }
  | { kind: "decline"; ids: string[]; notify: boolean; note?: string }
  | { kind: "decline-all"; total: number; notify: boolean; note?: string };

/**
 * Runs a bulk decision with its progress, then starts every list again from
 * its first page (positions in a long list moved) and refreshes the rest.
 * The outcome is returned; the summary is toasted and the caller shows it.
 */
export function useBulkDecision(eventId: number) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = React.useState<BulkProgress | null>(null);
  const [running, setRunning] = React.useState(false);

  const run = React.useCallback(
    async (plan: BulkPlan): Promise<BulkOutcome> => {
      setRunning(true);
      setProgress(null);
      try {
        let out: BulkOutcome;
        if (plan.kind === "confirm") {
          out = await confirmIds(plan.ids, (ids) => approveRequests(eventId, ids), setProgress);
        } else if (plan.kind === "confirm-all") {
          out = await confirmAllWaiting(plan.total, (limit) => approveAllPending(eventId, limit), setProgress);
        } else if (plan.kind === "decline") {
          out = await declineIds(plan.ids, (part) => declineRequests(eventId, { ids: part, notify: plan.notify, note: plan.note }), { notify: plan.notify, note: plan.note }, setProgress);
        } else {
          out = await declineAllWaiting(plan.total, (limit) => declineAllPending(eventId, { limit, notify: plan.notify, note: plan.note }), { notify: plan.notify, note: plan.note }, setProgress);
        }
        const s = summarise(out);
        if (s.tone === "admit") toast.success(s.title);
        else if (s.tone === "caution") toast.warning(s.title);
        else toast.error(s.title);
        return out;
      } finally {
        setRunning(false);
        setProgress(null);
        void queryClient.resetQueries({ queryKey: listsKey(eventId) });
        refreshAround(queryClient, eventId);
      }
    },
    [eventId, queryClient],
  );

  return { run, running, progress };
}

/** Saves a file the browser was handed, under its name. */
function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Export: every request as a CSV, through the gateway. A server without the
 * route (its bare 404) answers null: said once, and the button goes
 * (`missing`), rather than a file of JSON landing in Downloads.
 */
export function useExportRequests(eventId: number) {
  const [missing, setMissing] = React.useState(false);
  const mutation = useMutation({
    mutationFn: () => nullIfRouteMissing(() => fetchRequestsExport(eventId)),
    onSuccess: (file) => {
      if (!file) {
        setMissing(true);
        toast.warning("Exporting requests arrives with the next update of MyOtherApp.");
        return;
      }
      saveFile(file.blob, file.filename);
      toast.success("Requests exported");
    },
    onError: (e) => toast.error(e instanceof Error && e.message ? e.message : "The export didn't go through. Try again."),
  });
  return { ...mutation, missing };
}
