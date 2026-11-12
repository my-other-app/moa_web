"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@moa/app-kit";
import { roleOf } from "@moa/auth";
import { mailErrorText, MAIL_ERROR_TEXT, type MailConfig } from "@moa/mail-ui";

import { fetchMailOverview, platformMail } from "./api";
import { PLATFORM_ERROR_TEXT } from "./schemas";

export const ADMIN_MAIL_KEY = ["admin", "mail"] as const;
export const OVERVIEW_KEY = [...ADMIN_MAIL_KEY, "overview"] as const;
export const THREADS_KEY = [...ADMIN_MAIL_KEY, "threads"] as const;
export const THREAD_KEY = [...ADMIN_MAIL_KEY, "thread"] as const;

/** How often the side menu's count is asked again. */
export const OVERVIEW_POLL_MS = 60_000;

/**
 * Whether the signed-in admin reads the platform's mail: owner and support
 * do; viewer doesn't (the API answers 403). `undefined` while the session
 * is read.
 */
export function useMayReadMail(): boolean | undefined {
  const session = useSession();
  if (session.data) {
    const role = roleOf(session.data);
    return role === "owner" || role === "support";
  }
  return session.isPending ? undefined : false;
}

/** The addresses and what waits unread: the side menu's badge and the page's tabs. `null` on an API without them. */
export function useMailOverview(enabled = true) {
  return useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: fetchMailOverview,
    refetchInterval: (query) => (query.state.data === null || query.state.status === "error" ? false : OVERVIEW_POLL_MS),
    refetchOnWindowFocus: true,
    staleTime: OVERVIEW_POLL_MS / 2,
    retry: false,
    enabled,
  });
}

/** Whether this API has the platform's inbox, for this admin: true, false, or undefined while asked. */
export function usePlatformMailOnServer(): boolean | undefined {
  const may = useMayReadMail();
  const q = useMailOverview(may === true);
  if (may === false) return false;
  if (q.data) return true;
  if (q.data === null || q.isError) return false;
  return undefined;
}

/** A refusal in words: the server's sentence, else this table's, else the shared one's. */
export function platformErrorText(error: unknown, fallback?: string): string {
  return mailErrorText(error, fallback, { ...MAIL_ERROR_TEXT, ...PLATFORM_ERROR_TEXT });
}

/** The platform's mailboxes for the shared mail screens: sent as "MyOtherApp"; reading one refreshes the counts. */
export const PLATFORM_MAIL: MailConfig = {
  client: platformMail,
  keys: { threads: THREADS_KEY, thread: THREAD_KEY, summary: OVERVIEW_KEY },
  ours: "MyOtherApp",
  describeError: platformErrorText,
};
