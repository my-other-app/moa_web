"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { createThread, deleteComment, deleteThread, fetchComments, fetchThreads, replyAsClub, setPinned } from "./api";
import type { ComposeInput } from "./schemas";

const KEY = ["threads"] as const;

export function useThreads(params: { offset: number; limit: number }) {
  return useQuery({ queryKey: [...KEY, params.offset, params.limit], queryFn: () => fetchThreads(params), staleTime: 15_000 });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: KEY });
}

export function useCreateThread() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ input, photo }: { input: ComposeInput; photo: File | null }) => createThread(input, photo),
    onSuccess: (t) => {
      toast.success(t.notify_followers ? "Posted, and your followers were told" : "Posted");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useSetPinned() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => setPinned(id, pinned),
    onSuccess: (t) => {
      toast.success(t.pinned ? "Pinned to the top of your page" : "Unpinned");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteThread() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => deleteThread(id),
    onSuccess: () => {
      toast.success("Post removed");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useComments(id: string, enabled: boolean) {
  return useQuery({ queryKey: [...KEY, id, "comments"], queryFn: () => fetchComments(id), enabled });
}

export function useDeleteComment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(id, commentId),
    onSuccess: () => {
      toast.success("Comment removed");
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useReplyAsClub(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => replyAsClub(id, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
    onError: (error: Error) => toast.error(error.message),
  });
}
