"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { DuplicateLeadError } from "@/features/leads";
import { TEAMWORK_KEY } from "@/features/teamwork";

import {
  caseToLead,
  existingLeadOf,
  fetchCase,
  fetchCases,
  logCase,
  mergeCase,
  postMessage,
  previewReply,
  takeCase,
  updateCase,
  uploadReplyFile,
  type CasePatch,
  type CaseQuery,
  type LogCaseInput,
  type MessageInput,
} from "./api";

export const CASES_KEY = [...TEAMWORK_KEY, "cases"] as const;

export function useCases(query: CaseQuery, enabled = true) {
  return useQuery({ queryKey: [...CASES_KEY, "list", query], queryFn: () => fetchCases(query), placeholderData: keepPreviousData, enabled });
}

export function useCase(id: number) {
  return useQuery({ queryKey: [...CASES_KEY, "one", id], queryFn: () => fetchCase(id), refetchInterval: 60_000 });
}

/** Every change reaches the lists, the badge and My day as well as the case. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: TEAMWORK_KEY });
}

const failed = (fallback: string) => (error: Error) => toast.error(error.message || fallback);

export function useUpdateCase(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (patch: CasePatch) => updateCase(id, patch),
    onSuccess: async () => {
      toast.success("Case updated");
      await refresh();
    },
    onError: failed("Could not change the case"),
  });
}

export function useTakeCase(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: () => takeCase(id),
    onSuccess: async () => {
      toast.success("It's yours");
      await refresh();
    },
    onError: failed("Could not take the case"),
  });
}

/** A preview is a read: nothing is sent, so nothing to refresh. */
export function usePreviewReply(id: number) {
  return useMutation({ mutationFn: (input: MessageInput) => previewReply(id, input), onError: failed("Could not preview the reply") });
}

/** A file for the reply box: uploaded at once, its key kept until the reply or note goes. */
export function useUploadReplyFile(id: number) {
  return useMutation({ mutationFn: (file: File) => uploadReplyFile(id, file), onError: failed("Could not attach the file") });
}

export function usePostMessage(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: MessageInput) => postMessage(id, input),
    onSuccess: async (_, input) => {
      toast.success(input.kind === "note" ? "Note added" : "Reply sent");
      await refresh();
    },
    onError: failed("Could not send it"),
  });
}

export function useLogCase() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: LogCaseInput) => logCase(input),
    onSuccess: async (created) => {
      toast.success(created.number ? `Case #${created.number} logged` : "Case logged");
      await refresh();
    },
    onError: failed("Could not log the case"),
  });
}

export function useMergeCase(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (intoId: number) => mergeCase(id, intoId),
    onSuccess: async () => {
      toast.success("Merged: the thread moved to the other case");
      await refresh();
    },
    onError: failed("Could not merge the cases"),
  });
}

/**
 * A likely duplicate is not a failure to shout about: the dialog shows the
 * leads it may repeat and asks. A case that turned out to be a lead already
 * is said, and the case is read again so its lead shows.
 */
export function useCaseToLead(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ type, force = false }: { type: string; force?: boolean }) => caseToLead(id, type, force),
    onSuccess: async () => {
      toast.success("Lead opened for Sales");
      await refresh();
    },
    onError: async (error: Error) => {
      if (error instanceof DuplicateLeadError) return;
      toast.error(error.message || "Could not open the lead");
      if (existingLeadOf(error) !== null) await refresh();
    },
  });
}
