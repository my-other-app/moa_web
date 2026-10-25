"use client";

import { InboxIcon } from "lucide-react";
import { SectionTitle, formatDateTime, formatNumber } from "@moa/app-kit";
import { Card, CardContent, Skeleton, StatusBadge } from "@moa/ui";

import { useClubMailbox } from "../queries";
import { STATE_TEXT } from "../schemas";

/**
 * The club's mailbox (<handle>@mail.myotherapp.in): its address, whether it
 * is open, and counts. What its mail says is the club's alone: nothing of a
 * mail is here, nor in the endpoint behind it. Not shown at all against a
 * backend from before club mailboxes (its route answers a bare 404).
 */
export function ClubMailboxCard({ clubId }: { clubId: number }) {
  const { data: m, isPending, isError } = useClubMailbox(clubId);
  if (m === null) return null;
  const state = m ? STATE_TEXT[m.state] : null;
  return (
    <section className="space-y-3" aria-label="Mailbox">
      <SectionTitle>Mailbox</SectionTitle>
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl" aria-hidden="true">
            <InboxIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            {isPending ? (
              <Skeleton className="h-5 w-48" />
            ) : isError || !m ? (
              <p className="text-muted-foreground text-sm">Could not load the club&apos;s mailbox.</p>
            ) : !m.set_up ? (
              <p className="text-muted-foreground text-sm">
                No mailbox set up.
                {m.plan_allows ? " Its plan includes one." : " Its plan doesn't include one (Pro and Enterprise)."}
                {m.available ? "" : " Club mailboxes are switched off on this server."}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-semibold break-all">{m.address}</span>
                  {state ? <StatusBadge label={state.label} tone={state.tone} /> : null}
                  {!m.available ? <StatusBadge label="Switched off on this server" tone="warning" /> : null}
                </div>
                <dl className="text-muted-foreground grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                  <dt>Conversations</dt>
                  <dd className="text-foreground">
                    {formatNumber(m.threads)}
                    {m.spam ? <span className="text-muted-foreground"> · {formatNumber(m.spam)} in Spam</span> : null}
                  </dd>
                  <dt>Received</dt>
                  <dd className="text-foreground">
                    {formatNumber(m.received)} <span className="text-muted-foreground">· {formatNumber(m.received_this_month)} this month</span>
                  </dd>
                  <dt>Sent</dt>
                  <dd className="text-foreground">
                    {formatNumber(m.sent)} <span className="text-muted-foreground">· {formatNumber(m.sent_this_month)} this month</span>
                    {m.failed ? <span className="text-destructive"> · {formatNumber(m.failed)} not sent</span> : null}
                  </dd>
                  {m.dropped_while_closed ? (
                    <>
                      <dt>Dropped while closed</dt>
                      <dd className="text-foreground">{formatNumber(m.dropped_while_closed)}</dd>
                    </>
                  ) : null}
                  {m.forwarding ? (
                    <>
                      <dt>Old addresses</dt>
                      <dd className="text-foreground">{formatNumber(m.forwarding)} still forwarding</dd>
                    </>
                  ) : null}
                  <dt>Last received</dt>
                  <dd className="text-foreground">{m.last_received_at ? formatDateTime(m.last_received_at) : "Nothing yet"}</dd>
                  <dt>Last sent</dt>
                  <dd className="text-foreground">{m.last_sent_at ? formatDateTime(m.last_sent_at) : "Nothing yet"}</dd>
                  <dt>Kept for</dt>
                  <dd className="text-foreground">{m.retention_months ? `${m.retention_months} months` : "—"}</dd>
                  <dt>Set up on</dt>
                  <dd className="text-foreground">{m.created_at ? formatDateTime(m.created_at) : "—"}</dd>
                </dl>
                {m.state !== "open" && m.lapsed_at ? (
                  <p className="text-muted-foreground text-xs">Its plan stopped including the mailbox on {formatDateTime(m.lapsed_at)}.</p>
                ) : null}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
