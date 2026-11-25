"use client";

import * as React from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, nullIfRouteMissing, qk } from "@moa/api";
import { toast } from "@moa/ui";
import { useDebouncedValue } from "@moa/ui/hooks";

import { toastError } from "@/features/plan/errors";

import {
  addRoundQuestion,
  checkTheme,
  createPoll,
  createRound,
  deleteMedia,
  deletePoll,
  deleteRound,
  deleteRoundQuestion,
  deleteTheme,
  fetchFeedback,
  fetchMedia,
  fetchOverall,
  fetchPollResponses,
  fetchPolls,
  fetchQuestions,
  fetchQuiz,
  fetchRound,
  fetchRoundHost,
  fetchRounds,
  fetchScreen,
  fetchScreenControl,
  fetchTheme,
  fetchThemePresets,
  fetchUpdates,
  fetchWinners,
  markOverall,
  markWinners,
  moderatePollResponse,
  moderateQuestion,
  orderRoundQuestions,
  orderRounds,
  patchPoll,
  patchRound,
  patchRoundQuestion,
  pushUpdate,
  putScreenControl,
  setScreenFooterImage,
  putSurvey,
  putTheme,
  roundHostAction,
  sendSurveyNow,
  setApproveFirst,
  setPollStatus,
  shiftSchedule,
  uploadMedia,
  type HostOptions,
  type PollBody,
  type QuizQuestionBody,
  type SettingsPatch,
} from "./api";
import { announce } from "./notify";
import type { HostAction, LiveUpdate, ModerateAction, Notified, ScreenControl, SurveyQuestion } from "./schemas";
import type { ThemeDraft } from "./theme";

export const liveKey = (eventId: number) => ["live", eventId] as const;

function useRefresh(eventId: number, part: string) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: [...liveKey(eventId), part] });
}

// --- quiz ----------------------------------------------------------------------

/** The event's current round, as GET /quiz answers it (made on first read when the event has none). */
export function useQuiz(eventId: number) {
  return useQuery({ queryKey: [...liveKey(eventId), "quiz"], queryFn: () => fetchQuiz(eventId), staleTime: 10_000 });
}

/** The event's rounds, in order; null from a server from before rounds (the console then has the one quiz). */
export function useRounds(eventId: number) {
  return useQuery({
    queryKey: [...liveKey(eventId), "quiz", "rounds"],
    queryFn: () => nullIfRouteMissing(() => fetchRounds(eventId)),
    staleTime: 5_000,
    // While a round runs its player count moves; otherwise another console
    // may start or end one, and this one should follow within seconds.
    refetchInterval: (q) => (q.state.data === null ? false : q.state.data?.some((r) => r.status === "live") ? 5_000 : 10_000),
  });
}

/** A round by id; null is the event's current round by today's paths (a server from before rounds). */
export function useRound(eventId: number, quizId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...liveKey(eventId), "quiz", "round", quizId ?? "current"],
    queryFn: () => fetchRound(eventId, quizId),
    enabled,
    staleTime: 5_000,
  });
}

/** What the host sees of a round, kept fresh every two seconds while it runs. */
export function useRoundHost(eventId: number, quizId: string | null, running: boolean, enabled = true) {
  return useQuery({
    queryKey: [...liveKey(eventId), "quiz", "host", quizId ?? "current"],
    queryFn: () => fetchRoundHost(eventId, quizId),
    enabled,
    refetchInterval: running ? 2_000 : false,
    staleTime: 1_000,
  });
}

/** Start on a quiz that is running (another console started it): restarting clears every score, so the host is asked first. */
export const isQuizRunning = (e: unknown) => e instanceof ApiError && e.status === 409 && e.errorCode === "QUIZ_RUNNING";
/** Next from a question the quiz has left (a double press, another console): nothing moved; the console just catches up. */
export const isMovedOn = (e: unknown) => e instanceof ApiError && e.status === 409 && e.errorCode === "QUIZ_MOVED_ON";
/** Starting a round while another is live: one at a time (the server names the live one). */
export const isOtherLive = (e: unknown) => e instanceof ApiError && e.status === 409 && e.errorCode === "QUIZ_OTHER_LIVE";
/** A host control pressed a moment late (already revealed, already paused...): the console just catches up. */
const CATCH_UP = new Set(["QUIZ_ALREADY_REVEALED", "QUIZ_NOT_PAUSED", "QUIZ_NOT_OPEN", "QUIZ_PAUSED"]);
const isCatchUp = (e: unknown) => e instanceof ApiError && e.status === 409 && CATCH_UP.has(e.errorCode ?? "");

const ACTION_DONE: Partial<Record<HostAction, string>> = {
  end: "Quiz finished",
  pause: "Paused — the clock has stopped",
  resume: "The clock is running again",
  skip: "Skipped — its points are taken back",
  reopen: "The question is open again",
};

export function useRoundMutations(eventId: number, quizId: string | null) {
  const refresh = useRefresh(eventId, "quiz");
  const id = quizId;
  // Each refusal is said, as the survey's are: a host pressing Next in front of the room must not be met with nothing.
  const rename = useMutation({ mutationFn: (body: { title?: string; intro?: string | null }) => patchRound(eventId, id, body), onSuccess: refresh, onError: toastError });
  const settings = useMutation({
    mutationFn: (change: SettingsPatch) => patchRound(eventId, id, { settings: change }),
    onSuccess: () => (toast.success("Round settings saved"), refresh()),
    onError: toastError,
  });
  const add = useMutation({ mutationFn: (body: QuizQuestionBody) => addRoundQuestion(eventId, id, body), onSuccess: () => (toast.success("Question added"), refresh()), onError: toastError });
  const edit = useMutation({
    mutationFn: ({ id: qid, patch }: { id: string; patch: Partial<QuizQuestionBody> }) => patchRoundQuestion(eventId, id, qid, patch),
    onSuccess: refresh,
    onError: toastError,
  });
  const remove = useMutation({ mutationFn: (qid: string) => deleteRoundQuestion(eventId, id, qid), onSuccess: () => (toast.success("Question removed"), refresh()), onError: toastError });
  const order = useMutation({ mutationFn: (ids: string[]) => orderRoundQuestions(eventId, id, ids), onSuccess: refresh, onError: (e) => (toastError(e), refresh()) });
  const drop = useMutation({ mutationFn: () => deleteRound(eventId, id!), onSuccess: () => (toast.success("Round removed"), refresh()), onError: toastError });
  const host = useMutation({
    mutationFn: ({ action, ...opts }: { action: HostAction } & HostOptions) => roundHostAction(eventId, id, action, opts),
    onSuccess: (s, { action, notify }) => {
      if (action === "start") announce(`The quiz is open — players join with ${s.join_code}`, notify ? s.notified : null, eventId);
      const done = ACTION_DONE[action];
      if (done) toast.success(done);
      refresh();
    },
    // Every refusal is said, but some are not refusals of what the host
    // meant: the quiz moved on already (a double press, another console),
    // is running already (the start asks first), or a control was pressed
    // a moment late -- the console just catches up.
    onError: (e) => {
      if (isMovedOn(e) || isQuizRunning(e) || isCatchUp(e)) return refresh();
      toastError(e);
    },
  });
  return { rename, settings, add, edit, remove, order, drop, host };
}

export function useRoundsMutations(eventId: number) {
  const refresh = useRefresh(eventId, "quiz");
  const create = useMutation({
    mutationFn: (body: { title?: string; settings?: SettingsPatch }) => createRound(eventId, body),
    onSuccess: (q) => (toast.success(`${q.title} added`), refresh()),
    onError: toastError,
  });
  const order = useMutation({ mutationFn: (ids: string[]) => orderRounds(eventId, ids), onSuccess: refresh, onError: (e) => (toastError(e), refresh()) });
  return { create, order };
}

export function useWinners(eventId: number, quizId: string | null, top: number, enabled = true) {
  return useQuery({
    queryKey: [...liveKey(eventId), "quiz", "winners", quizId, top],
    queryFn: () => fetchWinners(eventId, quizId!, top),
    enabled: Boolean(quizId) && enabled,
    staleTime: 5_000,
  });
}

/** The board across the rounds; null from a server from before rounds. */
export function useOverall(eventId: number, top: number, enabled = true) {
  return useQuery({
    queryKey: [...liveKey(eventId), "quiz", "overall", top],
    queryFn: () => nullIfRouteMissing(() => fetchOverall(eventId, top)),
    enabled,
    staleTime: 5_000,
  });
}

/** Marks the top players as the event's winners on their registrations (a round's, or across the rounds). */
export function useMarkWinners(eventId: number, quizId: string | null) {
  const qc = useQueryClient();
  const refresh = useRefresh(eventId, "quiz");
  return useMutation({
    mutationFn: (top: number) => (quizId ? markWinners(eventId, quizId, top) : markOverall(eventId, top)),
    onSuccess: (r) => {
      const n = r.marked.length;
      toast.success(n ? `${n} ${n === 1 ? "winner" : "winners"} marked on their registrations` : "Nobody to mark: the top players joined without a registration");
      refresh();
      // The registrations list shows who won.
      void qc.invalidateQueries({ queryKey: ["registrations"] });
    },
    onError: toastError,
  });
}

// --- Q&A ----------------------------------------------------------------------

export function useQuestions(eventId: number) {
  return useQuery({ queryKey: [...liveKey(eventId), "questions"], queryFn: () => fetchQuestions(eventId), refetchInterval: 5_000, staleTime: 2_000 });
}

/** Whether the server's answer about telling the room is worth a toast: it went, or the limit held it (the host should know). */
const worthSaying = (n: Notified | null | undefined) => Boolean(n && (n.sent > 0 || n.skipped_reason === "rate_limited"));

export function useQAMutations(eventId: number) {
  const refresh = useRefresh(eventId, "questions");
  const approveFirst = useMutation({
    mutationFn: ({ approveFirst: v, notify }: { approveFirst: boolean; notify?: boolean }) => setApproveFirst(eventId, v, notify),
    onSuccess: (b, { notify }) => {
      if (b.approve_first) toast.success("New questions wait for you");
      else announce("New questions go straight to the board", notify ? b.notified : null, eventId);
      refresh();
    },
  });
  const moderate = useMutation({
    mutationFn: ({ id, action, notify }: { id: string; action: ModerateAction; notify?: boolean }) => moderateQuestion(eventId, id, action, notify),
    onSuccess: (q, { notify }) => {
      // The first question up opens Q&A: the room is told once; later ones say nothing.
      if (notify && worthSaying(q.notified)) announce("Q&A is open", q.notified, eventId);
      refresh();
    },
  });
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
  const create = useMutation({ mutationFn: (body: PollBody) => createPoll(eventId, body), onSuccess: () => (toast.success("Poll saved as a draft"), refresh()) });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<PollBody> }) => patchPoll(eventId, id, body),
    onSuccess: () => (toast.success("Poll updated"), refresh()),
    onError: toastError,
  });
  const status = useMutation({
    mutationFn: ({ id, status, notify }: { id: string; status: "live" | "closed"; notify?: boolean }) => setPollStatus(eventId, id, status, notify),
    onSuccess: (p, { notify }) => (p.status === "live" ? announce("The poll is up on every phone", notify ? p.notified : null, eventId) : toast.success("Poll closed"), refresh()),
  });
  const remove = useMutation({ mutationFn: (id: string) => deletePoll(eventId, id), onSuccess: () => (toast.success("Poll removed"), refresh()) });
  return { create, patch, status, remove };
}

/** An open-text poll's answers in one state, refreshed while the poll is up. */
export function usePollResponses(eventId: number, pollId: string, status: "pending" | "approved" | "rejected", live: boolean) {
  return useQuery({
    queryKey: [...liveKey(eventId), "polls", pollId, "responses", status],
    queryFn: () => fetchPollResponses(eventId, pollId, status),
    refetchInterval: live ? 4_000 : false,
    staleTime: 2_000,
  });
}

export function useModeratePollResponse(eventId: number, pollId: string) {
  const refresh = useRefresh(eventId, "polls");
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) => moderatePollResponse(eventId, pollId, id, action),
    onSuccess: refresh,
    onError: toastError,
  });
}

// --- feedback ----------------------------------------------------------------------

export function useFeedback(eventId: number) {
  return useQuery({ queryKey: [...liveKey(eventId), "feedback"], queryFn: () => fetchFeedback(eventId), staleTime: 10_000 });
}

export function useFeedbackMutations(eventId: number) {
  const refresh = useRefresh(eventId, "feedback");
  // A refused change or send is said, not swallowed: the organiser would otherwise think the survey went out.
  const save = useMutation({ mutationFn: (change: { auto_send?: boolean; delay_minutes?: number; questions?: SurveyQuestion[] }) => putSurvey(eventId, change), onSuccess: refresh, onError: toastError });
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

// --- the look ----------------------------------------------------------------------

/** The event's live theme; null from a server from before themes (the Look tab then says so). */
export function useTheme(eventId: number) {
  return useQuery({ queryKey: [...liveKey(eventId), "look", "theme"], queryFn: () => nullIfRouteMissing(() => fetchTheme(eventId)), staleTime: 30_000 });
}

export function useThemePresets(eventId: number) {
  return useQuery({ queryKey: [...liveKey(eventId), "look", "presets"], queryFn: () => nullIfRouteMissing(() => fetchThemePresets(eventId)), staleTime: 60_000 });
}

export function useMedia(eventId: number) {
  return useQuery({ queryKey: [...liveKey(eventId), "look", "media"], queryFn: () => nullIfRouteMissing(() => fetchMedia(eventId)), staleTime: 30_000 });
}

/**
 * The server's verdict on a draft, asked ~300 ms after the last change: the
 * editor answers at once from its own arithmetic, and this is what decides
 * whether Save is allowed. The last verdict stays while the next is asked.
 */
export function useThemeCheck(eventId: number, draft: ThemeDraft | null) {
  const settled = useDebouncedValue(draft, 300);
  const key = React.useMemo(() => (settled ? JSON.stringify(settled) : null), [settled]);
  return useQuery({
    queryKey: [...liveKey(eventId), "look", "check", key],
    queryFn: () => checkTheme(eventId, settled!),
    enabled: Boolean(settled),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
}

export function useThemeMutations(eventId: number) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [...liveKey(eventId), "look"] });
    void qc.invalidateQueries({ queryKey: [...liveKey(eventId), "screen"] });
  };
  const save = useMutation({
    mutationFn: (draft: ThemeDraft) => putTheme(eventId, draft),
    onSuccess: (t) => {
      qc.setQueryData([...liveKey(eventId), "look", "theme"], t);
      toast.success(t.warnings.length ? "Look saved — with a note on its colours" : "Look saved: the screen and every phone change now");
      refresh();
    },
    onError: toastError,
  });
  const reset = useMutation({
    mutationFn: () => deleteTheme(eventId),
    onSuccess: (t) => {
      qc.setQueryData([...liveKey(eventId), "look", "theme"], t);
      toast.success("Back to the room's own look");
      refresh();
    },
    onError: toastError,
  });
  const upload = useMutation({
    mutationFn: ({ file, kind }: { file: File; kind: "logo" | "background" | "option" }) => uploadMedia(eventId, file, kind),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...liveKey(eventId), "look", "media"] }),
    onError: toastError,
  });
  const removeMedia = useMutation({
    mutationFn: (id: string) => deleteMedia(eventId, id),
    onSuccess: () => (toast.success("Picture deleted"), refresh()),
    onError: toastError,
  });
  return { save, reset, upload, removeMedia };
}

// --- the screen ----------------------------------------------------------------------

/** The big screen: every second and a half while a round runs (its clock is on it), every three otherwise. */
export function useScreen(eventId: number) {
  return useQuery({
    queryKey: [...liveKey(eventId), "screen"],
    queryFn: () => fetchScreen(eventId),
    refetchInterval: (q) => (q.state.data?.quiz?.status === "live" ? 1_500 : 3_000),
    staleTime: 1_000,
  });
}

/** What the big screen shows; null from a server from before the screen's controls. */
export function useScreenControl(eventId: number) {
  return useQuery({
    queryKey: [...liveKey(eventId), "screen", "control"],
    queryFn: () => nullIfRouteMissing(() => fetchScreenControl(eventId)),
    staleTime: 10_000,
  });
}

export function useScreenFooterImage(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File | null) => setScreenFooterImage(eventId, file),
    onSuccess: (c) => {
      qc.setQueryData([...liveKey(eventId), "screen", "control"], c);
      void qc.invalidateQueries({ queryKey: [...liveKey(eventId), "screen"] });
    },
    onError: toastError,
  });
}

export function useScreenControlMutation(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (change: Partial<ScreenControl>) => putScreenControl(eventId, change),
    onSuccess: (c) => {
      qc.setQueryData([...liveKey(eventId), "screen", "control"], c);
      void qc.invalidateQueries({ queryKey: [...liveKey(eventId), "screen"] });
    },
    onError: toastError,
  });
}
