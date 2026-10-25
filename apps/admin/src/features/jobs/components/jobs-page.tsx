"use client";

import * as React from "react";
import { RotateCcwIcon, XIcon } from "lucide-react";
import { formatDateTime, formatNumber, relativeTime } from "@moa/app-kit";
import { Button, DataTable, Notice, Pager, Segmented, Skeleton, StatusBadge, type DataTableColumn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";
import { ConfirmAction } from "@/features/ops";
import { useOpsFeature } from "@/features/ops/queries";

import { useCancelJob, useJobQueue, useJobs, useRetryJob } from "../queries";
import { JOB_STATES, STATE_WORDS, type Job, type JobState } from "../schemas";

const PAGE = 50;

function Queue() {
  const { data, isPending, isError } = useJobQueue();
  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (isError || !data) return <Notice tone="refuse">Could not read the queue.</Notice>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-3 m-0 text-sm">
        {data.workers.length
          ? `${data.workers.length} runner${data.workers.length === 1 ? "" : "s"} heard from in the last minute`
          : "No runner heard from in the last minute: nothing is taking jobs."}
        {data.mode ? ` · ${data.mode === "worker" ? "a separate worker runs them" : "the API runs them"}` : ""}
      </p>
      <DataTable
        columns={[
          { key: "name", header: "Job", cell: (r) => <code className="text-xs">{r.name}</code> },
          { key: "due", header: "Waiting", className: "text-right", headerClassName: "text-right", cell: (r) => formatNumber(r.due) },
          { key: "running", header: "Running", className: "text-right", headerClassName: "text-right", cell: (r) => formatNumber(r.running) },
          {
            key: "abandoned",
            header: "Stuck",
            className: "text-right",
            headerClassName: "text-right",
            cell: (r) => (r.abandoned ? <span className="text-destructive">{formatNumber(r.abandoned)}</span> : "0"),
          },
          { key: "dead", header: "Failed", className: "text-right", headerClassName: "text-right", cell: (r) => (r.dead ? <span className="text-destructive">{formatNumber(r.dead)}</span> : "0") },
          {
            key: "oldest",
            header: "Oldest waiting",
            className: "hidden text-right md:table-cell",
            headerClassName: "hidden text-right md:table-cell",
            cell: (r) => (r.oldest_due_seconds != null ? `${Math.round(r.oldest_due_seconds)} s` : "—"),
          },
        ]}
        data={data.queues}
        rowKey={(r) => r.name}
        emptyMessage="The queue is empty."
      />
    </div>
  );
}

function JobActions({ job }: { job: Job }) {
  const canAct = useCan("moderate");
  const retry = useRetryJob();
  const cancel = useCancelJob();
  const [confirm, setConfirm] = React.useState(false);
  if (!canAct) return null;
  const running = job.state === "running";
  return (
    <div className="flex justify-end gap-1">
      {job.state === "dead" ? (
        <Button size="xs" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(job.id)}>
          <RotateCcwIcon /> Retry
        </Button>
      ) : null}
      <Button size="xs" variant="ghost" className="text-destructive" disabled={running || cancel.isPending} onClick={() => setConfirm(true)}>
        <XIcon /> Cancel
      </Button>
      <ConfirmAction
        open={confirm}
        onOpenChange={setConfirm}
        title={`Cancel job #${job.id}?`}
        description={`${job.name} is settled without running: nothing it would have done happens. Recorded in the activity log.`}
        confirmLabel="Cancel job"
        destructive
        pending={cancel.isPending}
        onConfirm={() => cancel.mutate(job.id, { onSuccess: () => setConfirm(false) })}
      />
    </div>
  );
}

function JobList() {
  const [state, setState] = React.useState<JobState>("dead");
  const [page, setPage] = React.useState(1);
  const { data, isPending, isError, isFetching } = useJobs(state, (page - 1) * PAGE, PAGE);
  if (data === null) return null;
  const columns: DataTableColumn<Job>[] = [
    {
      key: "job",
      header: "Job",
      cell: (j) => (
        <div className="min-w-0">
          <code className="text-xs">{j.name}</code>
          <p className="text-muted-foreground m-0 text-xs">#{j.id}</p>
        </div>
      ),
    },
    { key: "state", header: "State", cell: (j) => <StatusBadge tone={j.state === "dead" ? "destructive" : j.state === "stuck" ? "warning" : "info"} label={j.state} /> },
    {
      key: "error",
      header: "Error",
      cell: (j) => <p className="text-ink-2 m-0 line-clamp-3 max-w-[480px] font-mono text-[11.5px] break-words" title={j.error ?? undefined}>{j.error ?? "—"}</p>,
    },
    { key: "attempts", header: "Tries", className: "text-right", headerClassName: "text-right", cell: (j) => `${j.attempts}/${j.max_attempts}` },
    {
      key: "last",
      header: "Last run",
      className: "hidden md:table-cell",
      headerClassName: "hidden md:table-cell",
      cell: (j) => <span className="text-xs" title={formatDateTime(j.last_run_at)}>{relativeTime(j.last_run_at)}</span>,
    },
    { key: "actions", header: <span className="sr-only">Actions</span>, cell: (j) => <JobActions job={j} /> },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Which jobs"
        value={state}
        options={JOB_STATES.map((s) => ({ value: s, label: data ? `${STATE_WORDS[s]} (${data.counts[s]})` : STATE_WORDS[s] }))}
        onChange={(v) => {
          setState(v);
          setPage(1);
        }}
        className="self-start"
      />
      <DataTable
        columns={columns}
        data={data?.items}
        rowKey={(j) => j.id}
        isLoading={isPending}
        isError={isError}
        emptyMessage={state === "dead" ? "No job has failed for good." : state === "stuck" ? "Nothing is stuck." : "Nothing is waiting to be retried."}
      />
      {data && data.total > 0 ? (
        <Pager page={page} pageCount={Math.max(1, Math.ceil(data.total / PAGE))} total={data.total} pageSize={PAGE} noun={["job", "jobs"]} busy={isFetching} onPage={setPage} />
      ) : null}
      {data ? (
        <p className="text-ink-3 m-0 text-xs">
          Failed: gave up after every try. Retrying: failed at least once and waits for its next try. Stuck: its runner
          stopped, or it has waited over {data.stuck_after_minutes} minutes with nothing taking it.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The background job queue: per name, and the failed and stuck jobs one by
 * one with retry and cancel. The queue reads a route production already has;
 * the job list arrives with the operator tools and stays hidden before.
 */
export function JobsPage() {
  const listed = useOpsFeature("jobs");
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-base">Queue</h2>
        <Queue />
      </section>
      {listed ? (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-base">Failed and stuck jobs</h2>
          <JobList />
        </section>
      ) : null}
    </div>
  );
}
