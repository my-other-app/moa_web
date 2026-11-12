"use client";

import Link from "next/link";
import { Composer as MailComposer, refusedWith, type ComposerProps } from "@moa/mail-ui";

import { NO_EMAIL_CREDITS } from "../schemas";
import { ClubMail } from "./club-mail";

export { MODE_TITLE, composeProblems, defaultRecipients, type ComposeProblems, type ComposeTarget } from "@moa/mail-ui";

/**
 * Writing the club's mail (the shared composer, @moa/mail-ui): always from
 * the club's own address (the server's From, never this form's), its
 * signature offered, and out of email credits a way to buy more.
 */
export function Composer(props: Omit<ComposerProps, "fromLine" | "from" | "refusalAction">) {
  return (
    <ClubMail>
      <MailComposer
        {...props}
        signature={props.signature ?? null}
        fromLine="From the club's own address."
        refusalAction={(error) =>
          refusedWith(error, NO_EMAIL_CREDITS) ? (
            <Link href="/billing" className="btn btn-primary btn-sm">
              Buy more email credits
            </Link>
          ) : null
        }
      />
    </ClubMail>
  );
}
