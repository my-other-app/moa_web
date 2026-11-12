"use client";

import * as React from "react";
import { InboxIcon, Loader2Icon, PencilIcon, UsersIcon } from "lucide-react";
import { SectionTitle, formatDate, formatDateTime, formatNumber } from "@moa/app-kit";
import { Badge, Button, Card, CardContent, Input, Skeleton, StatusBadge, toast } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { mailboxErrorText, useBackfillAddresses, useChangeClubAddress, useClubMailbox } from "../queries";
import { STATE_TEXT, handleProblem, type Backfill, type ClubMailbox } from "../schemas";

const DOMAIN = "myotherapp.in";

/** An admin changing the club's address: no monthly limit; the old one forwards here 90 days. */
function ChangeAddress({ m, onDone }: { m: ClubMailbox; onDone: () => void }) {
  const [value, setValue] = React.useState(m.handle ?? "");
  const change = useChangeClubAddress(m.club_id);
  const handle = value.trim().toLowerCase();
  const problem = handleProblem(handle);
  const same = handle === (m.handle ?? "");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle || problem || same || change.isPending) return;
    change.mutate(handle, {
      onSuccess: (next) => {
        toast.success(`The club's address is now ${next.address ?? `${handle}@${DOMAIN}`}`);
        onDone();
      },
    });
  };
  return (
    <form className="flex flex-col gap-2" onSubmit={submit} aria-label={m.set_up ? "Change the club's address" : "Give the club an address"}>
      <label htmlFor={`mailbox-handle-${m.club_id}`} className="eyebrow">
        {m.set_up ? "New address" : "The club's address"}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`mailbox-handle-${m.club_id}`}
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          maxLength={30}
          autoComplete="off"
          aria-invalid={Boolean(problem) || undefined}
          aria-describedby={`mailbox-handle-${m.club_id}-help`}
          className="max-w-[240px]"
        />
        <span className="text-muted-foreground text-sm">@{DOMAIN}</span>
        <Button type="submit" size="sm" disabled={!handle || Boolean(problem) || same || change.isPending}>
          {change.isPending ? <Loader2Icon className="animate-spin" /> : null} {m.set_up ? "Change" : "Give it"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <p id={`mailbox-handle-${m.club_id}-help`} className={problem ? "text-destructive m-0 text-xs" : "text-muted-foreground m-0 text-xs"} role={problem ? "alert" : undefined}>
        {problem ??
          (m.set_up
            ? "An admin can change it any time (it counts as the club's change for the month). The old address keeps forwarding here for 90 days."
            : "The club gets this address whatever its plan; mail is kept only on plans with the mailbox.")}
      </p>
      {change.isError ? (
        <p className="text-destructive m-0 text-xs" role="alert">
          {mailboxErrorText(change.error)}
        </p>
      ) : null}
    </form>
  );
}

/**
 * For an owner, once: every club without an address gets one from its
 * name (oldest club first, so the older club keeps a name both want).
 * Asked as a dry run first, which says how many and a few of them; only
 * then given.
 */
function GiveEveryClubAnAddress() {
  const backfill = useBackfillAddresses();
  const [preview, setPreview] = React.useState<Backfill | null>(null);
  const run = (dryRun: boolean) =>
    backfill.mutate(dryRun, {
      onSuccess: (r) => {
        if (dryRun) setPreview(r);
        else {
          setPreview(null);
          toast.success(`${formatNumber(r.created)} ${r.created === 1 ? "club got its address" : "clubs got their addresses"}`);
          if (r.failed) toast.error(`${formatNumber(r.failed)} couldn't be given one. Try again later.`);
        }
      },
    });
  return (
    <div className="border-line-soft space-y-2 border-t pt-3" role="region" aria-label="Every club's address">
      <p className="text-muted-foreground m-0 text-xs">
        For every club, not only this one: each club without an address gets one from its name. Mail arrives only on plans with the mailbox.
      </p>
      {preview ? (
        <div className="space-y-2">
          <p className="m-0 text-sm">
            {preview.created ? (
              <>
                <strong>{formatNumber(preview.created)}</strong> {preview.created === 1 ? "club gets an address" : "clubs get an address"}
              </>
            ) : (
              "Every club has its address already"
            )}
            {preview.skipped ? `; ${formatNumber(preview.skipped)} already ${preview.skipped === 1 ? "has one" : "have one"}` : ""}.
            {preview.failed ? ` ${formatNumber(preview.failed)} couldn't be given one; try again later.` : ""}
          </p>
          {preview.sample.length ? (
            <ul className="text-muted-foreground m-0 flex list-none flex-wrap gap-1.5 p-0 text-xs" aria-label="For example">
              {preview.sample.map((s) => (
                <li key={s.club_id}>
                  <code>
                    {s.handle}@{DOMAIN}
                  </code>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {preview.created ? (
              <Button size="sm" disabled={backfill.isPending} onClick={() => run(false)}>
                {backfill.isPending ? <Loader2Icon className="animate-spin" /> : null} Give them their addresses
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              {preview.created ? "Not now" : "Close"}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" disabled={backfill.isPending} onClick={() => run(true)}>
          {backfill.isPending ? <Loader2Icon className="animate-spin" /> : <UsersIcon />} Give every club its address
        </Button>
      )}
      {backfill.isError ? (
        <p className="text-destructive m-0 text-xs" role="alert">
          {mailboxErrorText(backfill.error)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The club's mailbox (<handle>@myotherapp.in): its address (given from its
 * name, or picked), whether it is open, its old addresses forwarding, and
 * counts. Owners and support change the address when the club asks; an
 * owner can give every club its address. What its mail says is the club's
 * alone: nothing of a mail is here, nor in the endpoint behind it. Not
 * shown at all against a backend from before club mailboxes (its route
 * answers a bare 404).
 */
export function ClubMailboxCard({ clubId }: { clubId: number }) {
  const { data: m, isPending, isError } = useClubMailbox(clubId);
  const canChange = useCan("moderate");
  // Giving every club its address: the owners' (the API's MANAGE_CONTENT, as its other backfills).
  const canBackfill = useCan("manage_content");
  const [editing, setEditing] = React.useState(false);
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
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-muted-foreground m-0 text-sm">
                    No mailbox set up.
                    {m.plan_allows ? " Its plan includes one." : " Its plan doesn't include one (Pro and Enterprise)."}
                    {m.available ? "" : " Club mailboxes are switched off on this server."}
                  </p>
                  {canChange && !editing ? (
                    <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
                      <PencilIcon /> Give it an address
                    </Button>
                  ) : null}
                </div>
                {editing ? <ChangeAddress m={m} onDone={() => setEditing(false)} /> : null}
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-semibold break-all">{m.address}</span>
                  {state ? <StatusBadge label={state.label} tone={state.tone} /> : null}
                  {m.automatic ? (
                    <Badge variant="outline" title="Given from the club's name. The club may still change it once.">
                      Automatic
                    </Badge>
                  ) : null}
                  {!m.available ? <StatusBadge label="Switched off on this server" tone="warning" /> : null}
                  {canChange && !editing ? (
                    <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
                      <PencilIcon /> Change address
                    </Button>
                  ) : null}
                </div>
                {editing ? <ChangeAddress m={m} onDone={() => setEditing(false)} /> : null}
                {m.previous.length ? (
                  <ul className="text-muted-foreground m-0 flex list-none flex-col gap-0.5 p-0 text-sm" aria-label="Old addresses">
                    {m.previous.map((p) => (
                      <li key={p.address}>
                        <span className="text-foreground break-all">{p.address}</span> forwards here{p.forward_until ? ` until ${formatDate(p.forward_until)}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {m.state === "reserved" ? (
                  <p className="text-muted-foreground m-0 text-xs">The address is the club&apos;s, but its plan has no mailbox: nothing sent to it is kept until it upgrades.</p>
                ) : null}
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
                  {m.forwarding && !m.previous.length ? (
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
                {(m.state === "lapsed" || m.state === "expired") && m.lapsed_at ? (
                  <p className="text-muted-foreground text-xs">Its plan stopped including the mailbox on {formatDateTime(m.lapsed_at)}.</p>
                ) : null}
              </>
            )}
            {canBackfill && m ? <GiveEveryClubAnAddress /> : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
