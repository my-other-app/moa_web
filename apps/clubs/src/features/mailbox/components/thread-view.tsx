"use client";

import { ThreadView as MailThreadView, type ThreadViewProps } from "@moa/mail-ui";

import { ClubMail } from "./club-mail";

export { MailHtml, MailText } from "@moa/mail-ui";

/** One conversation of the club's mail (the shared screen, @moa/mail-ui). */
export function ThreadView(props: ThreadViewProps) {
  return (
    <ClubMail>
      <MailThreadView {...props} />
    </ClubMail>
  );
}
