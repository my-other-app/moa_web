"use client";

import * as React from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { formatDateTime, formatNumber, relativeTime } from "@moa/app-kit";
import { Button, DataTable, NativeSelect, Pager, SearchField, StatusBadge, TabRail, type DataTableColumn } from "@moa/ui";

import { ExcelExportButton } from "@/components/excel-export-button";
import { PRIORITIES, PRIORITY_LABEL, membersOf, priorityLabel, usePublicTopics, useTeamRights, useTeams } from "@/features/teamwork";

import { casesExportUrl } from "../api";
import { useCases } from "../queries";
import { CASE_TABS, REQUESTER_KIND, TAB_LABEL, flagLabel, requesterLabel, statusLabel, statusTone, type CaseRow, type CaseTab } from "../schemas";
import { LogCaseDialog } from "./log-case-dialog";

const PAGE = 50;
const AGES = [
  { value: "", label: "Any age" },
  { value: "1", label: "Older than a day" },
  { value: "3", label: "Older than 3 days" },
  { value: "7", label: "Older than a week" },
];

/** When the case is due next: its first reply while nobody has answered, else its resolution. */
function Due({ c }: { c: CaseRow }) {
  if (c.status === "resolved" || c.status === "closed") return <span className="text-ink-3 text-xs">—</span>;
  const due = c.status === "new" ? c.first_reply_due : c.resolution_due;
  if (c.overdue) return <span className="text-refuse text-xs font-medium">Overdue{due ? ` · ${formatDateTime(due)}` : ""}</span>;
  return <span className="text-xs">{due ? formatDateTime(due) : "—"}</span>;
}

/**
 * The support queue: Mine, Unassigned, All open, Waiting on them, Resolved,
 * with filters by topic, priority, assignee and age. A list never carries a
 * message body, so every admin reads it; the case page is where the teams
 * read and answer.
 */
export function CasesPage() {
  const rights = useTeamRights();
  const topics = usePublicTopics();
  const teams = useTeams();
  const [tab, setTab] = React.useState<CaseTab>("open");
  const [topic, setTopic] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [age, setAge] = React.useState("");
  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [logging, setLogging] = React.useState(false);
  const filters = { tab, topic: topic || undefined, priority: priority || undefined, assignee: assignee ? Number(assignee) : undefined, q: search || undefined, ageDays: age ? Number(age) : undefined };
  const { data, isPending, isError, isFetching } = useCases({ ...filters, page, pageSize: PAGE });
  const topicLabel = (key: string | null | undefined) => (key ? (topics.data?.find((t) => t.key === key)?.label ?? key) : "—");
  const support = membersOf(teams.data, "support");
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const counts = data?.counts;
  const tabCount: Partial<Record<CaseTab, number>> = counts ? { mine: counts.mine, unassigned: counts.unassigned, open: counts.open, waiting: counts.waiting, resolved: counts.resolved } : {};

  const columns: DataTableColumn<CaseRow>[] = [
    {
      key: "case",
      header: "Case",
      cell: (c) => (
        <div className="min-w-0">
          <Link href={`/teamwork/support/${c.id}`} className="font-medium underline-offset-2 hover:underline">
            <span className="text-ink-3 mr-1.5 font-mono text-xs">#{c.number}</span>
            {c.subject || "(no subject)"}
          </Link>
          {c.flags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {c.flags.map((f) => (
                <StatusBadge key={f} tone="destructive" label={flagLabel(f)} />
              ))}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "who",
      header: "From",
      cell: (c) => (
        <div className="min-w-0">
          <p className="m-0 truncate">{requesterLabel(c.requester)}</p>
          <p className="text-ink-3 m-0 text-xs">{REQUESTER_KIND[c.requester.kind] ?? c.requester.kind}</p>
        </div>
      ),
    },
    { key: "topic", header: "Topic", className: "hidden lg:table-cell", headerClassName: "hidden lg:table-cell", cell: (c) => topicLabel(c.topic) },
    { key: "priority", header: "Priority", cell: (c) => <StatusBadge tone={c.priority === "urgent" ? "destructive" : c.priority === "high" ? "warning" : "default"} label={priorityLabel(c.priority)} /> },
    { key: "status", header: "Status", cell: (c) => <StatusBadge tone={statusTone(c.status)} label={statusLabel(c.status)} /> },
    { key: "assignee", header: "Assignee", cell: (c) => (c.assignee ? c.assignee.name : <span className="text-ink-3">Unassigned</span>) },
    { key: "due", header: "Due", cell: (c) => <Due c={c} /> },
    { key: "updated", header: "Updated", className: "hidden xl:table-cell", headerClassName: "hidden xl:table-cell", cell: (c) => <span className="text-ink-3 text-xs">{relativeTime(c.updated_at)}</span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <TabRail
          label="Which cases"
          className="flex-1"
          items={CASE_TABS.map((t) => ({ key: t, label: TAB_LABEL[t], count: tabCount[t] !== undefined ? formatNumber(tabCount[t]) : null }))}
          value={tab}
          onChange={(k) => reset(setTab)(k as CaseTab)}
        />
        {rights.logCases ? (
          <Button size="sm" onClick={() => setLogging(true)}>
            <PlusIcon /> Log a case
          </Button>
        ) : null}
        {rights.readBodies ? <ExcelExportButton href={casesExportUrl(filters)} stem={`support-cases-${tab}`} disabled={!data || data.total === 0} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          label="Search cases"
          placeholder="Number, subject, name or email…"
          value={q}
          onChange={setQ}
          onCommit={(v) => reset(setSearch)(v.trim())}
          className="w-[280px]"
        />
        <NativeSelect aria-label="Topic" size="sm" className="w-auto" value={topic} onChange={(e) => reset(setTopic)(e.target.value)}>
          <option value="">Every topic</option>
          {(topics.data ?? []).map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Priority" size="sm" className="w-auto" value={priority} onChange={(e) => reset(setPriority)(e.target.value)}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </NativeSelect>
        {support.length > 0 ? (
          <NativeSelect aria-label="Assignee" size="sm" className="w-auto" value={assignee} onChange={(e) => reset(setAssignee)(e.target.value)}>
            <option value="">Anyone</option>
            {support.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name || m.email}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <NativeSelect aria-label="Age" size="sm" className="w-auto" value={age} onChange={(e) => reset(setAge)(e.target.value)}>
          {AGES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {!rights.isPending && !rights.readBodies ? (
        <p className="text-ink-3 m-0 text-[12.5px]">You&apos;re not in the Support or Sales team: you see the queue and its counts, not what people wrote.</p>
      ) : null}
      <DataTable
        columns={columns}
        data={data?.items}
        rowKey={(c) => c.id}
        isLoading={isPending}
        isError={isError}
        emptyMessage={tab === "mine" ? "Nothing assigned to you." : tab === "unassigned" ? "Every case has an owner." : "No cases here."}
      />
      {data && data.total > 0 ? <Pager page={page} pageCount={Math.max(1, Math.ceil(data.total / PAGE))} total={data.total} pageSize={PAGE} noun={["case", "cases"]} busy={isFetching} onPage={setPage} /> : null}
      {rights.logCases ? <LogCaseDialog open={logging} onOpenChange={setLogging} /> : null}
    </div>
  );
}
