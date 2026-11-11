"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { createRequest, fetchHelp, fetchRequest, fetchRequests, fetchTopics, replyToRequest, sendSurvey, uploadFiles, type NewRequest } from "./api";

export const HELP_KEY = ["clubs", "help"] as const;

/** The answers, and the probe for the whole of Help: `null` on an API without the desk. */
export function useHelpAnswers() {
  return useQuery({ queryKey: [...HELP_KEY, "answers"], queryFn: fetchHelp, staleTime: 5 * 60_000, retry: false });
}

/** Whether the API has the help desk: true, false, or undefined while asked. A failing probe hides it. */
export function useHelpOnServer(): boolean | undefined {
  const q = useHelpAnswers();
  if (q.data) return true;
  if (q.data === null || q.isError) return false;
  return undefined;
}

export function useHelpTopics() {
  return useQuery({ queryKey: [...HELP_KEY, "topics"], queryFn: fetchTopics, staleTime: 5 * 60_000 });
}

export function useRequests(enabled = true) {
  return useQuery({ queryKey: [...HELP_KEY, "requests"], queryFn: fetchRequests, enabled, refetchInterval: 60_000 });
}

export function useRequest(id: number) {
  return useQuery({ queryKey: [...HELP_KEY, "request", id], queryFn: () => fetchRequest(id), refetchInterval: 60_000 });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: HELP_KEY });
}

/** Files first (their keys), then the request: one press, one toast. */
export function useSendRequest() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ files, ...body }: Omit<NewRequest, "attachments"> & { files: File[] }) => {
      const uploaded = files.length ? await uploadFiles(files) : [];
      return createRequest({ ...body, attachments: uploaded.map((u) => u.key) });
    },
    onSuccess: async (created) => {
      toast.success(`Request #${created.number} sent. We'll answer by email and here.`);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Could not send the request"),
  });
}

export function useReply(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ message, files }: { message: string; files: File[] }) => {
      const uploaded = files.length ? await uploadFiles(files) : [];
      return replyToRequest(id, message, uploaded.map((u) => u.key));
    },
    onSuccess: async (r) => {
      toast.success(r.new_case && r.number ? `Sent as a new request, #${r.number}` : "Sent");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Could not send it"),
  });
}

export function useSurvey(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ solved, comment }: { solved: boolean; comment: string }) => sendSurvey(id, solved, comment),
    onSuccess: async (_, { solved }) => {
      toast.success(solved ? "Thanks for telling us" : "Thanks: the team will look again");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Could not send it"),
  });
}
