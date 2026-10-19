"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@moa/api";

import { useAccess } from "@/features/access";
import { openUpgrade, useFeatureGate, usePlan, type PlanLock } from "@/features/plan";

import { deleteAiKey, draftEvent, fetchAiKey, fetchAiStatus, fetchFeedbackSummary, refreshFeedbackSummary, saveAiKey, writeWithAi } from "./api";
import { AI_FEATURE, touchesStatus, type AiKeyInput, type AiStatus, type FeedbackSummary, type WriteInput } from "./schemas";

export const AI_QUERY = ["ai"] as const;
const STATUS_KEY = [...AI_QUERY, "status"] as const;
const KEY_KEY = [...AI_QUERY, "key"] as const;
const summaryKey = (eventId: number) => [...AI_QUERY, "feedback-summary", eventId] as const;

/**
 * Whether AI is on, whether the plan has it, and the month's count. Shared
 * by every entry point on a page, so they cost one request between them.
 * A server without AI (404) or any failure reads as off: AI stays out of
 * sight until the server says it is there.
 */
export function useAiStatus() {
  return useQuery({ queryKey: STATUS_KEY, queryFn: fetchAiStatus, staleTime: 30_000, retry: false });
}

export interface AiGate {
  /** The server has AI switched on: show the entry points. False while loading, on failure, and when off. */
  visible: boolean;
  /** Shown, but the plan does not include it (and the club has no key of its own). */
  locked: boolean;
  lock: PlanLock | null;
  status: AiStatus | undefined;
  /** Opens the upgrade dialog. */
  prompt: () => void;
}

/**
 * The one rule every AI entry point follows. `enabled` false hides them all;
 * `plan_allows` false shows them with the plan's lock (the upgrade dialog
 * names the plan, from the catalogue when it has `ai_assist`). With the
 * club's own key the server sends `plan_allows: true`, so they simply work.
 */
export function useAiGate(): AiGate {
  const q = useAiStatus();
  const gate = useFeatureGate(AI_FEATURE);
  const plan = usePlan();
  const s = q.data;
  const visible = Boolean(s?.enabled);
  const locked = visible && !s!.plan_allows;
  const lock = locked ? (gate.lock ?? plan.lockFor(AI_FEATURE)) : null;
  return {
    visible,
    locked,
    lock,
    status: s,
    prompt: () => {
      if (lock) openUpgrade(lock);
    },
  };
}

/** After an AI action, success or refusal: the count moved, or the switch, the key or the plan changed. */
function useStatusRefresh() {
  const queryClient = useQueryClient();
  return React.useCallback(
    (error?: unknown) => {
      if (error === undefined || touchesStatus(error) || (error instanceof ApiError && error.isForbidden)) void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
    [queryClient],
  );
}

export function useEventDraft() {
  const refresh = useStatusRefresh();
  return useMutation({
    mutationFn: ({ text, file, signal }: { text?: string; file?: File | null; signal?: AbortSignal }) => draftEvent({ text, file }, signal),
    onSuccess: () => refresh(),
    onError: (error) => refresh(error),
  });
}

export function useAiWrite() {
  const refresh = useStatusRefresh();
  return useMutation({
    mutationFn: ({ input, signal }: { input: WriteInput; signal?: AbortSignal }) => writeWithAi(input, signal),
    onSuccess: () => refresh(),
    onError: (error) => refresh(error),
  });
}

export function useFeedbackSummary(eventId: number, enabled = true) {
  return useQuery({ queryKey: summaryKey(eventId), queryFn: () => fetchFeedbackSummary(eventId), enabled: enabled && eventId > 0, staleTime: 60_000, retry: false });
}

export function useRefreshFeedbackSummary(eventId: number) {
  const queryClient = useQueryClient();
  const refresh = useStatusRefresh();
  return useMutation({
    mutationFn: () => refreshFeedbackSummary(eventId),
    onSuccess: (next: FeedbackSummary) => {
      queryClient.setQueryData(summaryKey(eventId), next);
      refresh();
    },
    onError: (error) => refresh(error),
  });
}

/** Only the club's own account and its admins may see or change the key; the server says 403 to anyone else. */
export function useCanManageAiKey(): boolean {
  const access = useAccess();
  return access.role === "owner" || access.role === "admin";
}

export function useAiKey(enabled = true) {
  return useQuery({ queryKey: KEY_KEY, queryFn: fetchAiKey, enabled, retry: false });
}

export function useSaveAiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AiKeyInput) => saveAiKey(body),
    onSuccess: (next) => {
      queryClient.setQueryData(KEY_KEY, next);
      // The status now says byok, and the plan allows AI.
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });
}

export function useRemoveAiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAiKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY_KEY });
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });
}
