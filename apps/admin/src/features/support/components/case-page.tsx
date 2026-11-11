"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, BriefcaseIcon, GitMergeIcon, HandIcon, Loader2Icon, XIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, NativeSelect, Notice, Skeleton, StatusBadge } from "@moa/ui";

import { LEAD_TYPES, LEAD_TYPE_LABEL, PRIORITIES, PRIORITY_LABEL, memberLabel, membersOf, priorityLabel, usePublicTopics, useTeamRights, useTeams } from "@/features/teamwork";

import { useCase, useCaseToLead, useCases, useMergeCase, useTakeCase, useUpdateCase } from "../queries";
import { CASE_STATUSES, REQUESTER_KIND, STATUS_LABEL, channelLabel, flagLabel, requesterLabel, statusLabel, statusTone, type CaseDetail } from "../schemas";
import { Composer } from "./composer";
import { LinkedPanel } from "./linked-panel";
import { Thread } from "./thread";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-ink-3 font-mono text-[10.5px] tracking-[0.08em] uppercase">{label}</span>
      {children}
    </div>
  );
}

function Tags({ c, editable }: { c: CaseDetail; editable: boolean }) {
  const update = useUpdateCase(c.id);
  const [text, setText] = React.useState("");
  const add = () => {
    const tag = text.trim().toLowerCase();
    if (!tag || c.tags.includes(tag)) return setText("");
    update.mutate({ tags: [...c.tags, tag] }, { onSuccess: () => setText("") });
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {c.tags.length === 0 && !editable ? <span className="text-ink-3 text-[12.5px]">None</span> : null}
      {c.tags.map((t) => (
        <span key={t} className="border-line bg-sunken inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px]">
          {t}
          {editable ? (
            <button type="button" aria-label={`Remove tag ${t}`} className="text-ink-3 hover:text-ink" onClick={() => update.mutate({ tags: c.tags.filter((x) => x !== t) })}>
              <XIcon className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
      {editable ? (
        <Input
          aria-label="Add a tag"
          placeholder="Add a tag"
          value={text}
          maxLength={40}
          className="h-7 w-[120px] text-[12px]"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
      ) : null}
    </div>
  );
}

/** Merge this case into another: the other keeps both threads. Found by its number or subject. */
function MergeDialog({ c, open, onOpenChange }: { c: CaseDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const merge = useMergeCase(c.id);
  const [q, setQ] = React.useState("");
  const [into, setInto] = React.useState<number | null>(null);
  const search = q.replace(/^#/, "").trim();
  const found = useCases({ tab: "all", q: search || undefined, page: 1, pageSize: 8 }, open && search.length >= 2);
  const options = (found.data?.items ?? []).filter((x) => x.id !== c.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge #{c.number} into another case</DialogTitle>
          <DialogDescription>The same person writing again: this case&apos;s messages move to the other one, and this one closes.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="merge-find">The case to keep</Label>
          <Input id="merge-find" placeholder="#1042 or words from the subject" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ul className="m-0 flex max-h-[240px] list-none flex-col gap-1 overflow-y-auto p-0">
          {options.map((o) => (
            <li key={o.id}>
              <label className="hover:bg-sunken flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]">
                <input type="radio" name="merge-into" checked={into === o.id} onChange={() => setInto(o.id)} />
                <span className="text-ink-3 font-mono text-xs">#{o.number}</span>
                <span className="flex-1 truncate">{o.subject}</span>
                <span className="text-ink-3 text-xs">{requesterLabel(o.requester)}</span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={into === null || merge.isPending}
            onClick={() =>
              into !== null &&
              merge.mutate(into, {
                onSuccess: () => {
                  onOpenChange(false);
                  router.push(`/teamwork/support/${into}`);
                },
              })
            }
          >
            {merge.isPending ? <Loader2Icon className="animate-spin" /> : <GitMergeIcon />}
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToLeadDialog({ c, open, onOpenChange }: { c: CaseDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const toLead = useCaseToLead(c.id);
  const [type, setType] = React.useState<string>(c.requester.kind === "club" ? "club" : "sponsor");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Turn into a lead</DialogTitle>
          <DialogDescription>A club asking about plans, a brand offering to sponsor: Sales gets it as a lead, with this case linked.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to-lead-type">What kind of lead</Label>
          <NativeSelect id="to-lead-type" value={type} onChange={(e) => setType(e.target.value)}>
            {LEAD_TYPES.map((t) => (
              <option key={t} value={t}>
                {LEAD_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={toLead.isPending}
            onClick={() =>
              toLead.mutate(type, {
                onSuccess: (lead) => {
                  onOpenChange(false);
                  router.push(`/teamwork/leads/${lead.id}`);
                },
              })
            }
          >
            {toLead.isPending ? <Loader2Icon className="animate-spin" /> : <BriefcaseIcon />}
            Open lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Rights = ReturnType<typeof useTeamRights>;

/** Whether the signed-in admin works this case: the server's word when it gives one, else the rights table. */
const canWork = (c: CaseDetail, rights: Rights) => c.can_work ?? rights.workCase(c.assignee?.id);
const canTake = (c: CaseDetail, rights: Rights) => c.can_take ?? (!c.assignee && rights.support);

/** The case's facts and the controls the signed-in admin may use on them. */
function Sidebar({ c }: { c: CaseDetail }) {
  const rights = useTeamRights();
  const teams = useTeams();
  const topics = usePublicTopics();
  const update = useUpdateCase(c.id);
  const take = useTakeCase(c.id);
  const work = canWork(c, rights);
  const support = membersOf(teams.data, "support");
  return (
    <section className="border-line-soft bg-surface flex flex-col gap-3.5 rounded-2xl border p-4" aria-label="Case details">
      <Field label="Assignee">
        {rights.assignCases ? (
          <NativeSelect aria-label="Assignee" size="sm" value={c.assignee?.id ? String(c.assignee.id) : ""} disabled={update.isPending} onChange={(e) => update.mutate({ assignee_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Unassigned</option>
            {support.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {memberLabel(m)}
              </option>
            ))}
            {c.assignee && !support.some((m) => m.user_id === c.assignee?.id) ? <option value={c.assignee.id}>{c.assignee.name}</option> : null}
          </NativeSelect>
        ) : (
          <span className="text-[13px]">{c.assignee?.name ?? "Unassigned"}</span>
        )}
        {canTake(c, rights) ? (
          <Button size="sm" variant="outline" className="self-start" disabled={take.isPending} onClick={() => take.mutate()}>
            {take.isPending ? <Loader2Icon className="animate-spin" /> : <HandIcon />}
            Take it
          </Button>
        ) : null}
      </Field>
      <Field label="Status">
        {work ? (
          <NativeSelect aria-label="Status" size="sm" value={c.status} disabled={update.isPending} onChange={(e) => update.mutate({ status: e.target.value })}>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <StatusBadge tone={statusTone(c.status)} label={statusLabel(c.status)} />
        )}
      </Field>
      <Field label="Priority">
        {work ? (
          <NativeSelect aria-label="Priority" size="sm" value={c.priority} disabled={update.isPending} onChange={(e) => update.mutate({ priority: e.target.value })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <span className="text-[13px]">{priorityLabel(c.priority)}</span>
        )}
      </Field>
      <Field label="Topic">
        {work ? (
          <NativeSelect aria-label="Topic" size="sm" value={c.topic ?? ""} disabled={update.isPending} onChange={(e) => update.mutate({ topic: e.target.value })}>
            {c.topic ? null : <option value="">No topic</option>}
            {(topics.data ?? []).map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <span className="text-[13px]">{topics.data?.find((t) => t.key === c.topic)?.label ?? c.topic ?? "—"}</span>
        )}
      </Field>
      <Field label="Tags">
        <Tags c={c} editable={work} />
      </Field>
      <Field label="Timers">
        <span className="text-[12.5px]">
          First reply by {formatDateTime(c.first_reply_due)}
          <br />
          Resolved by {formatDateTime(c.resolution_due)}
          {c.overdue ? <span className="text-refuse font-medium"> · overdue</span> : null}
        </span>
      </Field>
      {c.survey && (c.survey.answered_at || (c.survey.solved !== null && c.survey.solved !== undefined)) ? (
        <Field label="Did we solve it?">
          <span className="text-[13px]">
            {c.survey.solved ? "Yes" : "No"}
            {c.survey.comment ? ` · “${c.survey.comment}”` : ""}
          </span>
        </Field>
      ) : null}
    </section>
  );
}

/**
 * One case: what they asked, the thread, the reply box, and beside it the
 * case's facts and the person's records. An admin outside both teams sees
 * the case without its messages' words; the reply box is for the owners and
 * the Support member it is assigned to.
 */
export function CasePage({ caseId }: { caseId: number }) {
  const { data: c, isPending, isError, error } = useCase(caseId);
  const rights = useTeamRights();
  const [merging, setMerging] = React.useState(false);
  const [leading, setLeading] = React.useState(false);

  if (isPending) return <Skeleton className="h-[480px] w-full" />;
  if (isError || !c) return <EmptyState tone="muted" title="This case could not be opened" description={error instanceof Error ? error.message : undefined} />;

  const work = canWork(c, rights);
  // A Support member notes any case; only the one it is assigned to (or an owner) answers it.
  const note = work || rights.support;
  return (
    <div className="flex flex-col gap-4">
      <Link href="/teamwork/support" className="text-ink-3 hover:text-ink inline-flex items-center gap-1 text-[12.5px]">
        <ArrowLeftIcon className="size-3.5" /> Support
      </Link>
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[26px] leading-tight tracking-[-0.01em]">
            <span className="text-ink-3 mr-2 font-mono text-[18px]">#{c.number}</span>
            {c.subject || "(no subject)"}
          </h1>
          <p className="text-ink-3 m-0 mt-1 text-[13px]">
            {requesterLabel(c.requester)} · {REQUESTER_KIND[c.requester.kind] ?? c.requester.kind} · {channelLabel(c.channel)} · opened {formatDateTime(c.created_at)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge tone={statusTone(c.status)} label={statusLabel(c.status)} />
            {c.flags.map((f) => (
              <StatusBadge key={f} tone="destructive" label={flagLabel(f)} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {work ? (
            <Button size="sm" variant="outline" onClick={() => setMerging(true)}>
              <GitMergeIcon /> Merge
            </Button>
          ) : null}
          {rights.caseToLead && !c.lead_id ? (
            <Button size="sm" variant="outline" onClick={() => setLeading(true)}>
              <BriefcaseIcon /> Turn into a lead
            </Button>
          ) : null}
          {c.lead_id ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/teamwork/leads/${c.lead_id}`}>
                <BriefcaseIcon /> Its lead
              </Link>
            </Button>
          ) : null}
        </div>
      </header>
      {c.merged_into_id ? (
        <Notice tone="neutral" tag="Merged">
          Merged into <Link href={`/teamwork/support/${c.merged_into_id}`} className="underline">another case</Link>.
        </Notice>
      ) : null}
      {c.parent_case_id ? (
        <p className="text-ink-3 m-0 text-[12.5px]">
          Follows <Link href={`/teamwork/support/${c.parent_case_id}`} className="underline">an earlier case</Link> they wrote on after it closed.
        </p>
      ) : null}
      {c.purged_at ? (
        <Notice tone="neutral" tag="Retention">
          This case&apos;s messages were deleted after the retention period; its counts stay for the reports.
        </Notice>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Thread messages={c.messages} />
          {note && !c.purged_at ? <Composer key={String(work)} caseId={c.id} canReply={work} notDelivered={c.flags.includes("not_delivered")} /> : null}
          {!rights.isPending && !work && canTake(c, rights) ? <p className="text-ink-3 m-0 text-[12.5px]">Take the case to answer it.</p> : null}
        </div>
        <div className="flex flex-col gap-4">
          <Sidebar c={c} />
          <LinkedPanel panel={c.panel} links={c.links} />
        </div>
      </div>
      {work ? <MergeDialog c={c} open={merging} onOpenChange={setMerging} /> : null}
      {rights.caseToLead ? <ToLeadDialog c={c} open={leading} onOpenChange={setLeading} /> : null}
    </div>
  );
}
