"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { addDisputeNote, fetchDisputes, type DisputeQuery } from "./api";

const KEY = ["admin", "disputes"] as const;

export function useDisputes(query: DisputeQuery) {
  return useQuery({ queryKey: [...KEY, query], queryFn: () => fetchDisputes(query), placeholderData: keepPreviousData });
}

export function useAddDisputeNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => addDisputeNote(id, text),
    onSuccess: async () => {
      toast.success("Note added");
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error: Error) => toast.error(error.message || "Could not add the note"),
  });
}
