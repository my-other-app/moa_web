"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { nullIfRouteMissing, qk } from "@moa/api";
import { toast } from "@moa/ui";

import { requestsKey } from "@/features/requests/queries";

import { closeAsk, createAsk, fetchAnswersSummary, fetchAsks, moveAnswers, previewAsk, remindAsk } from "./api";
import { askProblem, peopleWord, remindProblem, type AnswerAsk, type AskBody, type AskPreviewBody } from "./schemas";

/**
 * Under the event's own key: anything that changes its guests (a correction,
 * a removal, a decision, a saved form) invalidates qk.events.all, and the
 * counts of who is missing what move with it.
 */
export const answersKey = (eventId: number) => [...qk.events.detail(eventId), "answers"] as const;
const summaryKey = (eventId: number) => [...answersKey(eventId), "summary"] as const;
const asksKey = (eventId: number) => [...answersKey(eventId), "asks"] as const;

/**
 * Who is missing what (§1.4), or null from a backend without it yet (its
 * bare 404): every missing-answers surface stays away until the API has them.
 */
export function useAnswersSummary(eventId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: summaryKey(eventId ?? -1),
    queryFn: () => nullIfRouteMissing(() => fetchAnswersSummary(eventId!)),
    enabled: !!eventId && eventId > 0 && enabled,
    staleTime: 15_000,
    retry: false,
  });
}

/** The event's asks, newest first; read again every half minute while one is still open, so its figures move. */
export function useAsks(eventId: number, enabled = true) {
  return useQuery({
    queryKey: asksKey(eventId),
    queryFn: () => nullIfRouteMissing(() => fetchAsks(eventId)),
    enabled: eventId > 0 && enabled,
    staleTime: 10_000,
    retry: false,
    refetchInterval: (q) => (q.state.data?.some((a) => a.status === "open") ? 30_000 : false),
  });
}

/** How many an ask would reach: re-read as the questions or the people change, the last answer kept on screen meanwhile. */
export function useAskPreview(eventId: number, body: AskPreviewBody, enabled: boolean) {
  return useQuery({
    queryKey: [...answersKey(eventId), "preview", body],
    queryFn: () => previewAsk(eventId, body),
    enabled: enabled && eventId > 0 && body.questions.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}

function refresh(queryClient: QueryClient, eventId: number) {
  void queryClient.invalidateQueries({ queryKey: answersKey(eventId) });
}

/** Asks: the toast says how many it went to; a refusal is said in words, and thrown for the panel to keep it open. */
export function useCreateAsk(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AskBody) => createAsk(eventId, body),
    onSuccess: (ask) => {
      toast.success(`Asked ${peopleWord(ask.counts.people)}`, { description: "The first send of an ask doesn't count against your messages. Track it under Messages." });
      refresh(queryClient, eventId);
    },
    onError: (error) => toast.error(askProblem(error)),
  });
}

export function useRemindAsk(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ask: AnswerAsk) => remindAsk(eventId, ask.id),
    onSuccess: (ask) => {
      toast.success(`Reminded ${peopleWord(ask.counts.still_askable)}`, { description: "A reminder counts against your messages." });
      refresh(queryClient, eventId);
    },
    onError: (error) => {
      toast.error(remindProblem(error));
      refresh(queryClient, eventId);
    },
  });
}

export function useCloseAsk(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ask: AnswerAsk) => closeAsk(eventId, ask.id),
    onSuccess: () => {
      toast.success("Ask closed", { description: "No more reminders go out, and its links say it has closed." });
      refresh(queryClient, eventId);
    },
    onError: (error) => toast.error(error instanceof Error && error.message ? error.message : "That didn't go through. Try again."),
  });
}

/** Moving answers rewrites the guests' records: the guest list, the requests and the counts all read again. */
export function useMoveAnswers(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => moveAnswers(eventId, from, to),
    onSuccess: (res) => {
      toast.success(`Moved ${res.moved.toLocaleString("en-IN")} ${res.moved === 1 ? "answer" : "answers"}`, {
        description: res.skipped ? `${peopleWord(res.skipped)} had already answered the current question, so theirs were left as they were.` : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: qk.events.all });
      void queryClient.invalidateQueries({ queryKey: requestsKey(eventId) });
    },
    onError: (error) => toast.error(error instanceof Error && error.message ? error.message : "The answers weren't moved. Try again."),
  });
}
