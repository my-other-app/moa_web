"use client";

import * as React from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@moa/api";

import { captureContact, checkInByHand, fetchGateContext, registerWalkup, scanBatch, scanTicket, searchGuests, undoCheckIn, fetchGateStoreOrders, gateHandOver, fetchGateCatalog } from "./api";
import { scanQueue, supportsQueue, type QueuedScan } from "./lib/queue";
import type { GateContext, ScanBody, ScanResult, WalkupBody } from "./schemas";

export const gateKey = (eventId: number) => ["gate", eventId] as const;

export function useGateContext(key: string | null, eventId: number) {
  return useQuery({
    queryKey: [...gateKey(eventId), "context", key ?? "session"],
    queryFn: () => fetchGateContext(key, eventId),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // A refused request is an answer; a dropped connection or a server that
    // is restarting (a 502 while a deploy comes up) is worth three more tries.
    retry: (count, err) => (!(err instanceof ApiError) || err.isServer) && count < 3,
    retryDelay: (count) => Math.min(1000 * 2 ** count, 8000),
  });
}

export type ScanOutcomeResult = { kind: "server"; response: ScanResult } | { kind: "queued"; scan: ScanBody };

/**
 * The counter bumps optimistically because the volunteer needs instant
 * feedback. The outcome card never does — "welcome in" must not appear
 * before the server has committed. On a network failure the scan is queued
 * and shown as QUEUED, honestly.
 */
export function useScanMutation(key: string | null, eventId: number, enqueue: (s: ScanBody) => Promise<void>) {
  const qc = useQueryClient();
  const ctxKey = [...gateKey(eventId), "context", key ?? "session"];
  return useMutation<ScanOutcomeResult, unknown, ScanBody, { prev?: GateContext }>({
    /*
     * Always run, signal or not. React Query otherwise pauses a mutation
     * while the browser says it is offline, so the scan never reached the
     * queue below: no saved card, and every later scan was ignored behind
     * the paused one until the signal came back. The fetch failing is the
     * offline path here.
     */
    networkMode: "always",
    mutationFn: async (body) => {
      try {
        return { kind: "server", response: await scanTicket(key, eventId, body) };
      } catch (err) {
        if (err instanceof ApiError) throw err; // the server answered: not a connectivity problem
        await enqueue(body);
        return { kind: "queued", scan: body };
      }
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ctxKey });
      const prev = qc.getQueryData<GateContext>(ctxKey);
      qc.setQueryData<GateContext>(ctxKey, (c) => (c ? { ...c, counters: { ...c.counters, checked_in: c.counters.checked_in + 1 } } : c));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctxKey, ctx.prev);
    },
    onSuccess: (res, _v, ctx) => {
      if (res.kind === "server" && (res.response.outcome !== "CHECKED_IN" || res.response.replayed) && ctx?.prev) qc.setQueryData(ctxKey, ctx.prev);
      if (res.kind === "server") void qc.invalidateQueries({ queryKey: gateKey(eventId) });
    },
  });
}

/** Online-first with an honest offline path: queued scans drain through the batch route on reconnect. */
export function useOfflineQueue(key: string | null, eventId: number, onDrained?: (results: { client_ref: string; response: ScanResult }[]) => void) {
  const qc = useQueryClient();
  const [online, setOnline] = React.useState(() => (typeof navigator === "object" && typeof navigator.onLine === "boolean" ? navigator.onLine : true));
  const [queued, setQueued] = React.useState(0);
  const draining = React.useRef(false);

  // The count lands in a callback, never in the effect body itself.
  const refreshCount = React.useCallback((): Promise<void> => {
    if (!supportsQueue()) return Promise.resolve();
    return scanQueue.count(eventId).then((n) => setQueued(n));
  }, [eventId]);

  const drain = React.useCallback(async () => {
    if (draining.current || !supportsQueue() || !navigator.onLine) return;
    // Claimed before the first await: the online event and the timer can
    // both start a replay, and each would otherwise read the same scans and
    // send them twice.
    draining.current = true;
    try {
      const pending = await scanQueue.all(eventId);
      if (!pending.length) return;
      for (let i = 0; i < pending.length; i += 200) {
        const slice: QueuedScan[] = pending.slice(i, i + 200);
        const res = await scanBatch(key, eventId, slice.map(({ code, door, scanned_at, client_ref }) => ({ code, door, scanned_at, client_ref })));
        await scanQueue.remove(res.results.map((r) => r.client_ref));
        onDrained?.(res.results);
      }
      void qc.invalidateQueries({ queryKey: gateKey(eventId) });
    } catch {
      /* still offline, or the server is down; the next tick tries again */
    } finally {
      draining.current = false;
      await refreshCount();
    }
  }, [eventId, key, onDrained, qc, refreshCount]);

  React.useEffect(() => {
    void refreshCount();
    const up = () => {
      setOnline(true);
      void drain();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const tick = setInterval(() => void drain(), 15_000);
    void drain();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(tick);
    };
  }, [drain, refreshCount]);

  const enqueue = React.useCallback(
    async (scan: ScanBody) => {
      await scanQueue.add({ ...scan, eventId, queuedAt: new Date().toISOString() });
      await refreshCount();
    },
    [eventId, refreshCount]
  );

  return { online, queued, enqueue, drain };
}

export function useWalkup(key: string | null, eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WalkupBody) => registerWalkup(key, eventId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: gateKey(eventId) }),
  });
}

export function useGuestSearch(key: string | null, eventId: number, q: string) {
  return useQuery({
    queryKey: [...gateKey(eventId), "search", q],
    queryFn: () => searchGuests(key, eventId, q),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });
}

export function useCheckInByHand(key: string | null, eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ registrationId, door }: { registrationId: string; door: string | null }) => checkInByHand(key, eventId, registrationId, door),
    onSuccess: () => qc.invalidateQueries({ queryKey: gateKey(eventId) }),
  });
}

export function useUndoCheckIn(key: string | null, eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) => undoCheckIn(key, eventId, registrationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: gateKey(eventId) }),
  });
}

export function useCaptureContact(key: string | null, eventId: number) {
  return useMutation({
    mutationFn: ({ registrationId, phone }: { registrationId: string; phone: string }) => captureContact(key, eventId, registrationId, phone),
  });
}

export function useGateStoreOrders(key: string | null, eventId: number, registrationId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["gate", eventId, "store", registrationId ?? ""],
    queryFn: () => fetchGateStoreOrders(key, eventId, registrationId as string),
    enabled: enabled && !!registrationId,
  });
}

export function useGateHandOver(key: string | null, eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => gateHandOver(key, eventId, orderId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["gate", eventId, "store"] }),
  });
}

export function useGateCatalog(key: string | null, eventId: number, enabled: boolean) {
  return useQuery({ queryKey: ["gate", eventId, "catalog"], queryFn: () => fetchGateCatalog(key, eventId), enabled, staleTime: 30_000 });
}
