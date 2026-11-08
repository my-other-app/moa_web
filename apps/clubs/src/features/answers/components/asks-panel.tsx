"use client";

import * as React from "react";
import { BellRingIcon, ClipboardListIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import { formatDateTime, formatNumber, relativeTime } from "@moa/app-kit";
import { Button, CardLabel, EmptyState, FigurePanel, ProgressBar, StatusBadge } from "@moa/ui";

import { useAccess } from "@/features/access";

import { useAnswersSummary, useAsks, useCloseAsk, useRemindAsk } from "../queries";
import { CHANNEL_LABEL, REMINDERS_MAX, askProgress, peopleWord, type AnswerAsk } from "../schemas";
import { AskPanel, type AskTarget } from "./ask-panel";

/**
 * The event's asks for answers (missing-answers contract §3 item 5), on the
 * Messages tab beside every other message: each with what it asked, who sent
 * it, and how far it got — sent, opened, answered (and the share), still
 * missing — with Remind now and Close. A new ask starts here too, while
 * anybody is missing anything. Door staff read it; asking is for whoever
 * can write to the guests. Hidden on a backend without asks.
 */
export function AsksPanel({ eventId }: { eventId: number }) {
  const { can } = useAccess();
  const mayAsk = Boolean(can.edit_events);
  const asks = useAsks(eventId);
  const summary = useAnswersSummary(eventId);
  const [target, setTarget] = React.useState<AskTarget | null>(null);
  const [now] = React.useState(() => new Date());

  // A backend without the feature: nothing at all. Nor while it is still being read: most events never ask.
  if (asks.data === null || summary.data === null || asks.isPending || summary.isPending) return null;
  const list = asks.data ?? [];
  const missing = summary.data?.people_missing ?? 0;
  // Nothing asked and nobody missing anything: the section would be an empty promise.
  if (!list.length && missing === 0) return null;

  return (
    <FigurePanel className="p-0">
      <div className="border-line-soft flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <CardLabel className="min-w-0 flex-1" right={missing > 0 ? <span className="text-caution text-[11.5px] font-medium">{peopleWord(missing)} missing answers</span> : undefined}>
          Asked for answers
        </CardLabel>
        {mayAsk && missing > 0 ? (
          <Button size="sm" variant="secondary" onClick={() => setTarget({})}>
            <ClipboardListIcon /> Ask for missing answers
          </Button>
        ) : null}
      </div>
      {asks.isError ? (
        <EmptyState size="sm" tone="muted" title="Could not load the asks" description="Reload the page to try again." />
      ) : list.length === 0 ? (
        <p className="text-ink-3 m-0 px-4 py-4 text-[12.5px]">
          Nobody has been asked yet. {mayAsk ? "Ask the people who are missing answers: one message with a personal link to add them." : "Someone who can write to the guests can ask them."}
        </p>
      ) : (
        <ul>
          {list.map((a) => (
            <AskRow key={a.id} eventId={eventId} ask={a} now={now} mayAct={mayAsk} />
          ))}
        </ul>
      )}
      {mayAsk ? <AskPanel eventId={eventId} target={target} onOpenChange={(o) => !o && setTarget(null)} /> : null}
    </FigurePanel>
  );
}

function AskRow({ eventId, ask: a, now, mayAct }: { eventId: number; ask: AnswerAsk; now: Date; mayAct: boolean }) {
  const remind = useRemindAsk(eventId);
  const close = useCloseAsk(eventId);
  const { answeredPct, remindersLeft } = askProgress(a);
  const c = a.counts;
  const open = a.status === "open";
  const asked = a.questions.map((q) => q.label?.trim() || q.key).join(", ");
  const name = asked || "Answers";
  const busy = remind.isPending || close.isPending;

  return (
    <li className="border-line-soft grid gap-2.5 border-t px-4 py-3 first:border-t-0" aria-label={`Ask for ${name}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-ink m-0 text-[13.5px] font-medium">{name}</p>
          <p className="text-ink-3 m-0 text-[12px]">
            {a.created_by ? `${a.created_by} · ` : ""}
            <span title={formatDateTime(a.created_at)}>{relativeTime(a.created_at, now)}</span>
            {a.channels.length ? ` · ${a.channels.map((ch) => CHANNEL_LABEL[ch].toLowerCase()).join(", ")}` : ""}
            {a.deadline ? ` · until ${formatDateTime(a.deadline)}` : ""}
          </p>
        </div>
        <StatusBadge tone={open ? "info" : "default"} label={open ? "Open" : "Closed"} />
      </div>

      <div>
        <ProgressBar value={c.answered} max={Math.max(1, c.people)} tone="admit" height={6} label={`${name}: ${c.answered} of ${c.people} answered`} />
        <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          <Figure k="Sent" v={formatNumber(c.sent)} note={c.failed ? `${formatNumber(c.failed)} failed` : undefined} />
          <Figure k="Opened" v={formatNumber(c.opened)} />
          <Figure k="Answered" v={`${formatNumber(c.answered)} (${answeredPct}%)`} />
          <Figure k="Still missing" v={formatNumber(c.still_askable)} />
        </dl>
      </div>

      {open ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-3 min-w-0 flex-1 text-[11.5px]">
            {remindersLeft === 0
              ? "Both reminders have gone."
              : a.next_reminder_at
                ? `Reminder ${a.reminders_sent + 1} of ${REMINDERS_MAX} due ${formatDateTime(a.next_reminder_at)}.`
                : `${a.reminders_sent} of ${REMINDERS_MAX} reminders sent.`}{" "}
            A reminder counts as a message.
          </span>
          {mayAct ? (
            <>
              <Button size="sm" variant="secondary" disabled={busy || remindersLeft === 0 || c.still_askable === 0} onClick={() => remind.mutate(a)} aria-label={`Remind the ${peopleWord(c.still_askable)} still missing ${name}`}>
                {remind.isPending ? <Loader2Icon className="animate-spin" /> : <BellRingIcon />} Remind now
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => close.mutate(a)} aria-label={`Close the ask for ${name}`}>
                {close.isPending ? <Loader2Icon className="animate-spin" /> : <XCircleIcon />} Close
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Figure({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-ink m-0 font-mono tabular-nums">
        {v}
        {note ? <span className="text-caution ml-1 font-sans text-[11px]">· {note}</span> : null}
      </dd>
    </div>
  );
}
