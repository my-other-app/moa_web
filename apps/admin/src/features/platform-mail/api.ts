import { api } from "@moa/app-kit";
import { mailClient, type ListQuery, type ThreadQuery } from "@moa/mail-ui";

import { nullIfAhead } from "@/lib/ahead-of-api";

import { mailOverviewSchema } from "./schemas";

export const ADMIN_MAIL = "/api/v1/admin/mail";

/** The addresses and their unread counts, or `null` on an API from before the platform's inbox (a bare 404). */
export async function fetchMailOverview() {
  return nullIfAhead(async () => mailOverviewSchema.parse(await api.get<unknown>(ADMIN_MAIL)));
}

export const MAIL_PAGE = 25;

/**
 * GET /admin/mail/threads pages by `page`/`page_size` (the contract); the
 * window's `offset`/`limit` go along too, the club mailbox's way, so either
 * reading of it gets the same page. No `mailbox`: all of them.
 */
export function platformListQuery(p: ThreadQuery): ListQuery {
  const limit = p.limit ?? MAIL_PAGE;
  const offset = p.offset ?? 0;
  return {
    mailbox: p.mailbox || undefined,
    folder: p.folder,
    q: p.q?.trim() || undefined,
    page: Math.floor(offset / limit) + 1,
    page_size: limit,
    offset,
    limit,
  };
}

/** The threads, their mail, sending (with `from_mailbox`) and retrying, under /admin/mail. */
export const platformMail = mailClient(ADMIN_MAIL, { listQuery: platformListQuery });
