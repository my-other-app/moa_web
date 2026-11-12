"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, isRouteMissing, nullIfRouteMissing } from "@moa/api";
import { threadsOf, useApplyMailRefresh, useThreads as useMailThreads } from "@moa/mail-ui";

import { fetchMailbox, fetchSummary, saveAddress, saveSettings, saveSignature, wipeMail } from "./api";
import { ERROR_TEXT, MAILBOX_PERMISSION, MAILBOX_PRIVATE, PERMISSION_MESSAGE, PRIVATE_MESSAGE, mailboxSchema, type Folder, type Mailbox } from "./schemas";

export const MAIL_KEY = ["mailbox"] as const;
export const MAILBOX_KEY = [...MAIL_KEY, "status"] as const;
export const SUMMARY_KEY = [...MAIL_KEY, "summary"] as const;
export const THREADS_KEY = [...MAIL_KEY, "threads"] as const;
export const THREAD_KEY = [...MAIL_KEY, "thread"] as const;

/**
 * A server from before club mailboxes (its /clubs/mailbox answers FastAPI's
 * bare 404): nothing to show, and the section stays out of sight until the
 * backend that has it is deployed -- the next read finds it.
 */
export const NOT_ON_THIS_SERVER: Mailbox = { ...mailboxSchema.parse({}), on_server: false, available: false };

async function readMailbox(): Promise<Mailbox> {
  const answer = await nullIfRouteMissing(fetchMailbox);
  return answer ?? NOT_ON_THIS_SERVER;
}

export function useMailbox(enabled = true) {
  return useQuery({ queryKey: MAILBOX_KEY, queryFn: readMailbox, staleTime: 30_000, retry: false, enabled });
}

/**
 * Whether this API has club mailboxes *and has them switched on*, from the
 * status's read (shared with the pages):
 * - `false`: the route isn't there (a route-level 404), the server has them
 *   off (`available: false`), or the read failed -- hide the section;
 * - `true`: it answered that they are on;
 * - `undefined`: not asked yet.
 */
export function useMailboxOnServer(enabled = true): boolean | undefined {
  const q = useMailbox(enabled);
  if (q.data) return q.data.on_server && q.data.available;
  if (q.isError) return false;
  if (!enabled) return false;
  return undefined;
}

/**
 * What waits unread (counts only): the nav's badge and the tab's "(n)".
 * `null` from a server without the route; nothing for someone the mail
 * isn't for (`enabled` false, or a refusal: no badge then).
 */
export function useMailSummary(enabled = true) {
  return useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: () => nullIfRouteMissing(fetchSummary),
    refetchInterval: (query) => (query.state.data === null || query.state.status === "error" ? false : 60_000),
    staleTime: 15_000,
    retry: false,
    enabled,
  });
}

/**
 * A folder's conversations (the mailbox screens' own hook, @moa/mail-ui,
 * asking /clubs/mailbox/threads: see ClubMail). Pages by offset.
 */
export function useThreads(folder: Folder, q: string, unread: boolean, poll: number | false, enabled = true) {
  return useMailThreads({ folder, q, unread }, poll, enabled);
}

/** The pages as one list; what the stream's changes ask for read again (both need ClubMail around them). */
export { threadsOf, useApplyMailRefresh };

/** Everything the mailbox shows again (after deleting all of it): no screen of it is open then. */
function useRefreshMail() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: THREADS_KEY });
    void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
    void queryClient.invalidateQueries({ queryKey: THREAD_KEY });
  };
}

function useSettleMailbox() {
  const queryClient = useQueryClient();
  return (next: Mailbox) => queryClient.setQueryData(MAILBOX_KEY, next);
}

export function useSaveAddress() {
  return useMutation({ mutationFn: (handle: string) => saveAddress(handle), onSuccess: useSettleMailbox() });
}

export function useSaveSettings() {
  return useMutation({ mutationFn: saveSettings, onSuccess: useSettleMailbox() });
}

export function useSaveSignature() {
  return useMutation({ mutationFn: (signature: string) => saveSignature(signature), onSuccess: useSettleMailbox() });
}

export function useWipeMail() {
  const refresh = useRefreshMail();
  return useMutation({ mutationFn: wipeMail, onSuccess: () => refresh() });
}

// ─── Refusals, in words ──────────────────────────────────────────────────

export function isPrivateError(error: unknown): boolean {
  return error instanceof ApiError && error.isForbidden && error.errorCode === MAILBOX_PRIVATE;
}

export function isPermissionError(error: unknown): boolean {
  return error instanceof ApiError && error.isForbidden && error.errorCode === MAILBOX_PERMISSION;
}

export function isLapsedError(error: unknown): boolean {
  return error instanceof ApiError && error.errorCode === "MAILBOX_LAPSED";
}

export { isRouteMissing };

/**
 * Any refusal in words: the server's own sentence when it gave one, else
 * this page's for its code, else a plain "try again". A 413 with no code of
 * ours is a proxy on the way refusing the size first.
 */
export function errorText(error: unknown, fallback = "That did not go through. Try again."): string {
  if (error instanceof ApiError) {
    if (error.errorCode === MAILBOX_PRIVATE) return PRIVATE_MESSAGE;
    if (error.errorCode === MAILBOX_PERMISSION) return PERMISSION_MESSAGE;
    if (error.status === 413 && !error.errorCode) return "Those files are too large to pass on from here. Send smaller ones.";
    return error.message?.trim() || (error.errorCode ? ERROR_TEXT[error.errorCode] : undefined) || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
