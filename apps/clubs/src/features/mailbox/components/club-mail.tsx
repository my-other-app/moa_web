"use client";

import * as React from "react";
import { MailProvider, type MailConfig } from "@moa/mail-ui";

import { clubMail } from "../api";
import { SUMMARY_KEY, THREADS_KEY, THREAD_KEY, errorText } from "../queries";

/**
 * The club's own mailbox for the shared mail screens (@moa/mail-ui): its
 * routes under /clubs/mailbox, the keys its reads live under, the bell's
 * notices refreshed with it, and its refusals in the club's words.
 */
export const CLUB_MAIL: MailConfig = {
  client: clubMail,
  keys: { threads: THREADS_KEY, thread: THREAD_KEY, summary: SUMMARY_KEY },
  alsoRefresh: [["club-alerts"]],
  ours: "the club",
  describeError: errorText,
};

export function ClubMail({ children }: { children: React.ReactNode }) {
  return <MailProvider config={CLUB_MAIL}>{children}</MailProvider>;
}
