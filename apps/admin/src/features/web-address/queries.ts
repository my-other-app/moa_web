"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, qk } from "@moa/api";

import { isAheadOfApi } from "@/lib/ahead-of-api";

import { changeSlug } from "./api";
import { SLUG_ERROR_TEXT, type SlugKind } from "./schemas";

/** Change the slug; the record's page shows the new one and its old ones at once, and every list reads again. */
export function useChangeSlug(kind: SlugKind, id: number) {
  const queryClient = useQueryClient();
  const detail = kind === "club" ? qk.clubs.detail(id) : qk.events.detail(id);
  return useMutation({
    mutationFn: (slug: string) => changeSlug(kind, id, slug),
    onSuccess: (r) => {
      queryClient.setQueryData(detail, (d: unknown) => (d && typeof d === "object" ? { ...d, slug: r.slug, slug_aliases: r.aliases } : d));
      void queryClient.invalidateQueries({ queryKey: kind === "club" ? qk.clubs.all : qk.events.all });
    },
  });
}

/** A refusal in words: a server without the route, the server's sentence, else this table's. */
export function slugErrorText(error: unknown): string {
  if (isAheadOfApi(error)) return "Changing a web address isn't available on this server yet.";
  if (error instanceof ApiError) return error.message?.trim() || (error.errorCode ? SLUG_ERROR_TEXT[error.errorCode] : undefined) || "That did not go through. Try again.";
  return error instanceof Error && error.message ? error.message : "That did not go through. Try again.";
}
