"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import {
  addQuizQuestion,
  createPoll,
  deletePoll,
  deleteQuizQuestion,
  fetchFeedback,
  fetchHostState,
  fetchPolls,
  fetchQuestions,
  fetchQuiz,
  fetchScreen,
  fetchUpdates,
  hostAction,
  moderateQuestion,
  patchQuiz,
  patchQuizQuestion,
  pushUpdate,
  putSurvey,
  sendSurveyNow,
  setApproveFirst,
  setPollStatus,
  shiftSchedule,
  type QuizQuestionBody,
} from "./api";
import { announce } from "./notify";
import type { HostAction, LiveUpdate, ModerateAction, Poll, SurveyQuestion } from "./schemas";

export const liveKey = (eventId: number) => ["live", eventId] as const;

function useRefresh(eventId: number, part: string) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: [...liveKey(eventId), part] });
}

// --- quiz ----------------------------------------------------------------------

export function useQuiz(eventId: number) {
  return useQuery({ queryKey: [...liveKey(eventId), "quiz"], queryFn: () => fetchQuiz(eventId), staleTime: 10_000 });
}

/** The host's view, kept fresh every two seconds while the quiz runs. */
export function useHostState(eventId: number, running: boolean) {
  return useQuery({ queryKey: [...liveKey(eventId), "quiz", "host"], queryFn: () => fetchHostState(eventId), refetchInterval: running ? 2_000 : false, staleTime: 1_000 });
}

export function useQuizMutations(eventId: number) {
  const refresh = useRefresh(eventId, "quiz");
  // Each refusal is said, as the survey's are: a host pressing Next in front of the room must not be met with nothing.
  const rename = useMutation({ mutationFn: (patch: { title?: string; intro?: string | null }) => patchQuiz(eventId, patch), onSuccess: refresh, onError: toastError });
  const add = useMutation({ mutationFn: (body: QuizQuestionBody) => addQuizQuestion(eventId, body), onSuccess: () => (toast.success("Question added"), refresh()), onError: toastError });
  const edit = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<QuizQuestionBody> }) => patchQuizQuestion(eventId, id, patch), onSuccess: refresh, onError: toastError });
  const remove = useMutation({ mutationFn: (id: string) => deleteQuizQuestion(eventId, id), onSuccess: () => (toast.success("Question removed"), refresh()), onError: toastError });
  const host = useMutation({
    mutationFn: ({ action, notify }: { action: HostAction; notify?: boolean }) => hostAction(eventId, action, notify),
    onSuccess: (s, { action, notify }) => {
      if (action === "start") announce(`The quiz is open — players join with ${s.join_code}`, notify ? s.notified : null);
      if (action === "end") toast.success("Quiz finished");
      refresh();
    },
    onError: toastError,
  });
  return { rename, add, edit, remove, host };
}

// --- Q&A ----------------------------------------------------------------------

export function useQuestions(eventId: number) {
  return useQuery({ queryKey: [...liveKey(eventId), "questions"], queryFn: () => fetchQuestions(eventId), refetchInterval: 5_000, staleTime: 2_000 });
}

export function useQAMutations(eventId: number) {
  const refresh = useRefresh(eventId, "questions");
  const approveFirst = useMutation({ mutationFn: (v: boolean) => setApproveFirst(eventId, v), onSuccess: (b) => (toast.success(b.approve_first ? "New questions wait for you" : "New questions go straight to the board"), refresh()) });
  const moderate = useMutation({ mutationFn: ({ id, action }: { id: string; action: ModerateAction }) => moderateQuestion(eventId, id, action), onSuccess: refresh });
  return { approveFirst, moderate };
}

// --- polls ----------------------------------------------------------------------

export function usePolls(eventId: number) {
  return useQuery({
    queryKey: [...liveKey(eventId), "polls"],
    queryFn: () => fetchPolls(eventId),
    staleTime: 2_000,
    // Results move while a poll is up.
    refetchInterval: (q) => (q.state.data?.some((p) => p.status === "live") ? 3_000 : false),
  });
}

export function usePollMutations(eventId: number) {
  const refresh = useRefresh(eventId, "polls");
  const create = useMutation({ mutationFn: (body: { kind: Poll["kind"]; prompt: string; options: string[] }) => createPoll(eventId, body), onSuccess: () => (toast.success("Poll saved as a draft"), refresh()) });
  const status = useMutation({
    mutationFn: ({ id, status, notify }: { id: string; status: "live" | "closed"; notify?: boolean }) => setPollStatus(eventId, id, status, notify),
    onSuccess: (p, { notify }) => (p.status === "live" ? announce("The poll is up on every phone", notify ? p.notified : null) : toast.success("Poll closed"), refresh()),
  });
  const remove = useMutation({ mutationFn: (id: string) => deletePoll(eventId, id), onSuccess: () => (toast.success("Poll removed"), refresh()) });
  return { create, status, remove };
}

// --- feedback ----------------------------------------------------------------------

export function useFeedback(eventId: number) {
  return useQuery({ queryKey: [...liveKey(eventId), "feedback"], queryFn: () => fetchFeedback(eventId), staleTime: 10_000 });
}

export function useFeedbackMutations(eventId: number) {
  const refresh = useRefresh(eventId, "feedback");
  // A refused change or send is said, not swallowed: the organiser would otherwise think the survey went out.
  const save = useMutation({ mutationFn: (patch: { auto_send?: boolean; delay_minutes?: number; questions?: SurveyQuestion[] }) => putSurvey(eventId, patch), onSuccess: refresh, onError: toastError });
  const send = useMutation({ mutationFn: () => sendSurveyNow(eventId), onSuccess: (r) => (toast.success(r.sent ? `Survey sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}` : "Nobody checked in to send to yet"), refresh()), onError: toastError });
  return { save, send };
}

// --- updates ----------------------------------------------------------------------

export function useUpdates(eventId: number) {
  return useQuery({ queryKey: [...liveKey(eventId), "updates"], queryFn: () => fetchUpdates(eventId), staleTime: 5_000 });
}

export function useUpdateMutations(eventId: number) {
  const qc = useQueryClient();
  const refresh = useRefresh(eventId, "updates");
  const push = useMutation({
    mutationFn: (body: { kind: LiveUpdate["kind"]; text: string; audience: LiveUpdate["audience"] }) => pushUpdate(eventId, body),
    onSuccess: (u) => (toast.success(`Pushed to ${u.recipients} ${u.recipients === 1 ? "phone" : "phones"}`), refresh()),
  });
  const shift = useMutation({
    mutationFn: ({ itemId, minutes }: { itemId: string; minutes: number }) => shiftSchedule(eventId, itemId, minutes),
    onSuccess: (r) => {
      toast.success(r.update.text);
      refresh();
      // The agenda lives under the event's detail key; the run of show moved.
      void qc.invalidateQueries({ queryKey: qk.events.detail(eventId) });
    },
  });
  return { push, shift };
}

// --- the screen ----------------------------------------------------------------------

export function useScreen(eventId: number) {
  return useQuery({ queryKey: [...liveKey(eventId), "screen"], queryFn: () => fetchScreen(eventId), refetchInterval: 3_000, staleTime: 1_000 });
}
