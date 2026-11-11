"use client";

import * as React from "react";
import Link from "next/link";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { SectionTitle, formatDateTime, formatNumber } from "@moa/app-kit";
import { Button, Chip, EmptyState, Skeleton, StatusBadge, cn } from "@moa/ui";

import { useCompleteFollowUp, useMyDay, useTeamRights, useTeams } from "../queries";
import { followUpAbout, followUpLabel, membersOf, priorityLabel, type CaseLite, type FollowUp } from "../schemas";
import { AwaySwitch } from "./away-switch";
import { NextFollowUpDialog } from "./follow-up-dialog";

const CASE_STATUS: Record<string, string> = { new: "New", open: "Open", waiting: "Waiting on them", resolved: "Resolved", closed: "Closed" };

/** What a follow-up is about: its lead or its case, as a link. */
function About({ f }: { f: FollowUp }) {
  const about = followUpAbout(f);
  if (about.lead) return <Link href={`/teamwork/leads/${about.lead.id}`} className="text-ink-2 hover:text-ink underline-offset-2 hover:underline">{about.lead.name}</Link>;
  if (about.case)
    return (
      <Link href={`/teamwork/support/${about.case.id}`} className="text-ink-2 hover:text-ink underline-offset-2 hover:underline">
        {about.case.number ? `#${about.case.number}` : `Case ${about.case.id}`}
        {about.case.subject ? ` · ${about.case.subject}` : ""}
      </Link>
    );
  return null;
}

function FollowUpRow({ f, overdue, onDone }: { f: FollowUp; overdue: boolean; onDone: (f: FollowUp) => void }) {
  const done = useCompleteFollowUp();
  return (
    <li className={cn("border-line-soft bg-surface flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-3", overdue && "border-refuse-line")}>
      <Chip tone={overdue ? "refuse" : "accent"}>{followUpLabel(f.kind)}</Chip>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[13.5px] font-medium">{f.title || followUpLabel(f.kind)}</p>
        <p className="text-ink-3 m-0 truncate text-[12px]">
          <span className={cn(overdue && "text-refuse font-medium")}>{formatDateTime(f.due_at)}</span>
          {" · "}
          <About f={f} />
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={done.isPending}
        onClick={() => done.mutate(f.id, { onSuccess: (r) => (r.needsNext ? onDone(f) : undefined) })}
        aria-label={`Mark "${f.title || followUpLabel(f.kind)}" done`}
      >
        {done.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
        Done
      </Button>
    </li>
  );
}

function CaseRow({ c }: { c: CaseLite }) {
  return (
    <li className="border-line-soft bg-surface flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-3">
      <span className="text-ink-3 font-mono text-[12px]">{c.number ? `#${c.number}` : ""}</span>
      <Link href={`/teamwork/support/${c.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:underline">
        {c.subject || "(no subject)"}
      </Link>
      {c.overdue ? <StatusBadge tone="destructive" label="Overdue" /> : null}
      <StatusBadge tone={c.priority === "urgent" || c.priority === "high" ? "warning" : "default"} label={priorityLabel(c.priority)} />
      <StatusBadge tone="info" label={CASE_STATUS[c.status] ?? c.status} />
    </li>
  );
}

/**
 * My day: what is overdue, what is due today, and the cases waiting on me.
 * Finishing a lead's last open follow-up asks for the next one.
 */
export function MyDayPage() {
  const { data, isPending, isError } = useMyDay();
  const rights = useTeamRights();
  const teams = useTeams();
  const [next, setNext] = React.useState<FollowUp | null>(null);
  const sales = membersOf(teams.data, "sales");

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (isError || !data) return <EmptyState tone="muted" title="My day could not be read" description="Try again in a moment." />;

  const empty = data.follow_ups_overdue.length + data.follow_ups_due.length + data.cases_mine_open.length === 0;
  return (
    <div className="flex flex-col gap-6">
      {rights.support || rights.sales ? <AwaySwitch /> : null}
      {empty ? <EmptyState tone="muted" title="Nothing due" description="No follow-ups due today, none overdue, and no open cases assigned to you." /> : null}
      {data.follow_ups_overdue.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>Overdue · {formatNumber(data.follow_ups_overdue.length)}</SectionTitle>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {data.follow_ups_overdue.map((f) => (
              <FollowUpRow key={f.id} f={f} overdue onDone={setNext} />
            ))}
          </ul>
        </section>
      ) : null}
      {data.follow_ups_due.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle>Due today · {formatNumber(data.follow_ups_due.length)}</SectionTitle>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {data.follow_ups_due.map((f) => (
              <FollowUpRow key={f.id} f={f} overdue={false} onDone={setNext} />
            ))}
          </ul>
        </section>
      ) : null}
      {data.cases_mine_open.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionTitle action={<Link href="/teamwork/support" className="text-brand text-[12.5px]">All my cases</Link>}>My open cases · {formatNumber(data.cases_mine_open.length)}</SectionTitle>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {data.cases_mine_open.map((c) => (
              <CaseRow key={c.id} c={c} />
            ))}
          </ul>
        </section>
      ) : null}
      <NextFollowUpDialog
        open={next !== null}
        onOpenChange={(open) => (open ? null : setNext(null))}
        leadId={next ? (followUpAbout(next).lead?.id ?? undefined) : undefined}
        owners={rights.owner ? sales : undefined}
      />
    </div>
  );
}
