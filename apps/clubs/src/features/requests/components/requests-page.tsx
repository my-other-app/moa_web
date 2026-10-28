"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon, DownloadIcon, InboxIcon, Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react";
import { formatDateTime, formatNumber, hasRequestFigures } from "@moa/app-kit";
import {
  Button,
  Checkbox,
  Chip,
  DefinitionRows,
  EmptyState,
  FigurePanel,
  Notice,
  SearchField,
  Skeleton,
  StatusBadge,
  Toolbar,
  ToolbarEnd,
  cn,
  toast,
  type StatusTone,
} from "@moa/ui";

import { useAccess } from "@/features/access";
// The query, not the feature's surface: the console's components reach this page's feature.
import { useEventSummary } from "@/features/console/queries";
import { useEventDetail } from "@/features/events";

import { summarise, type OutcomeSummary } from "../bulk";
import { useBulkDecision, useConfirmRequest, useExportRequests, useReopenRequest, useRequestList, type BulkPlan } from "../queries";
import {
  STATUS_LABEL,
  STATUS_TABS,
  TAB_LABEL,
  answerRows,
  indiaTime,
  people,
  queueOrder,
  rupees,
  totalOf,
  type QuestionField,
  type RegistrationRequest,
  type RequestStatus,
  type RequestTab,
} from "../schemas";
import { ConfirmDialog, DeclineDialog } from "./decision-dialogs";

/**
 * The event's Requests: everyone who asked for a place while "Confirm each
 * registration" is on, to confirm or decline.
 *
 * A tab per status with its count, and All; a search across name, email and phone;
 * the queue oldest first, fifty at a time with "Load more" (the server's
 * cursor), so a list of thousands never loads at once. Each row has the
 * person, their ticket type, when they asked (India time) and their form
 * answers on request. On Waiting, rows can be ticked (all on the page, or
 * every waiting request at once) and confirmed or declined together; the
 * outcome is said in plain words above the list. Door staff see the list
 * and decide nothing. Above it, the total that ever asked and, on a paid
 * event, how many confirmed have paid and how many are paying; Export takes
 * every request as a CSV.
 */

const CELL = "px-4 py-2.5 text-left align-top";
const HEAD = "text-ink-3 px-4 py-2 text-left font-mono text-[10px] font-normal tracking-[0.06em] uppercase";

const STATUS_TONE: Record<RequestStatus, StatusTone> = {
  pending: "info",
  approved: "success",
  declined: "destructive",
  withdrawn: "default",
  lapsed: "warning",
  closed: "default",
};

type Selection = { all: false; picked: Map<string, RegistrationRequest> } | { all: true; total: number };
const NONE: Selection = { all: false, picked: new Map() };

type DialogState = { kind: "confirm" } | { kind: "decline"; row?: RegistrationRequest } | null;

/** The event's own questions, for the answers' labels. */
function useQuestions(eventId: number): QuestionField[] {
  const event = useEventDetail(eventId);
  return React.useMemo(() => {
    const raw = (event.data as { additional_details?: unknown } | undefined)?.additional_details;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((f) => (f && typeof f === "object" && typeof (f as { key?: unknown }).key === "string" ? [{ key: (f as { key: string }).key, label: (f as { label?: string | null }).label ?? null }] : []));
  }, [event.data]);
}

/** What happened to a decided request, in a line. */
function decidedLine(r: RegistrationRequest): string | null {
  switch (r.status) {
    case "approved": {
      const when = r.decided_at ? ` ${indiaTime(r.decided_at)}` : "";
      // A paid ticket's price, as confirmed (its code taken off): owed while the place is held, then paid.
      if (r.pay_by && !r.registration_id) return `Confirmed${when} · ${r.amount !== null ? `${rupees(r.amount)} ` : ""}to pay by ${indiaTime(r.pay_by)}`;
      return `Confirmed${when}${r.registration_id ? " · registered" : ""}${r.amount !== null ? ` · ${rupees(r.amount)}` : ""}`;
    }
    case "declined":
      return `Declined${r.decided_at ? ` ${indiaTime(r.decided_at)}` : ""}`;
    case "withdrawn":
      return `Withdrew${r.decided_at ? ` ${indiaTime(r.decided_at)}` : ""}`;
    case "lapsed":
      return `Didn't pay${r.amount !== null ? ` ${rupees(r.amount)}` : ""} in time${r.pay_by ? ` (by ${indiaTime(r.pay_by)})` : ""}: the place was released`;
    case "closed":
      return "Closed with the event";
    default:
      return null;
  }
}

function RequestRow({
  r,
  fields,
  selectable,
  selected,
  onSelect,
  canDecide,
  showDecided,
  open,
  onToggleAnswers,
  onConfirm,
  onDecline,
  onReopen,
  busy,
}: {
  r: RegistrationRequest;
  fields: QuestionField[];
  selectable: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  canDecide: boolean;
  showDecided: boolean;
  open: boolean;
  onToggleAnswers: () => void;
  onConfirm: () => void;
  onDecline: () => void;
  onReopen: () => void;
  busy: boolean;
}) {
  const answers = answerRows(r.answers, fields);
  // As the waiting list says it: their ticket on WhatsApp too, when they asked.
  const contact = [r.email, r.phone, r.whatsapp_opt_in && r.phone ? "WhatsApp" : null].filter(Boolean).join(" · ");
  const columns = 4 + (selectable ? 1 : 0) + (showDecided ? 1 : 0) + (canDecide ? 1 : 0);
  return (
    <>
      <tr className={cn("border-line-soft border-t transition-colors", selected ? "bg-brand-soft/40" : "hover:bg-sunken/40")}>
        {selectable ? (
          <td className={cn(CELL, "w-10 pr-0")}>
            <Checkbox checked={selected} onCheckedChange={(v) => onSelect(v === true)} aria-label={`Select ${r.full_name}`} className="mt-0.5" />
          </td>
        ) : null}
        <td className={CELL}>
          <span className="text-ink block max-w-[260px] truncate text-[13px] font-medium">{r.full_name}</span>
          <span className={cn("block max-w-[260px] truncate font-mono text-[11px]", contact ? "text-ink-3" : "text-caution")}>{contact || "no contact given"}</span>
          {answers.length ? (
            <button type="button" onClick={onToggleAnswers} aria-expanded={open} className="text-brand hover:text-ink mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium">
              <ChevronDownIcon className={cn("size-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
              {open ? "Hide answers" : `Answers (${answers.length})`}
              <span className="sr-only"> of {r.full_name}</span>
            </button>
          ) : null}
        </td>
        <td className={CELL}>
          <span className="text-ink-2 block max-w-[180px] truncate text-[12.5px]">{r.ticket_type?.name ?? "—"}</span>
          {r.discount_code ? <span className="text-ink-3 block max-w-[180px] truncate font-mono text-[11px]">Code {r.discount_code}</span> : null}
        </td>
        <td className={cn(CELL, "whitespace-nowrap")}>
          <span className="text-ink-2 font-mono text-[11.5px] tabular-nums">{indiaTime(r.submitted_at)}</span>
        </td>
        {showDecided ? (
          <td className={CELL}>
            <StatusBadge tone={STATUS_TONE[r.status]} label={STATUS_LABEL[r.status]} />
            <span className="text-ink-3 mt-1 block max-w-[260px] text-[11.5px]">
              {decidedLine(r)}
              {r.decided_by ? ` · by ${r.decided_by}` : ""}
            </span>
            {r.decline_note ? <span className="text-ink-2 mt-0.5 block max-w-[260px] text-[11.5px] italic">“{r.decline_note}”</span> : null}
          </td>
        ) : null}
        {canDecide ? (
          <td className={cn(CELL, "text-right whitespace-nowrap")}>
            {r.status === "pending" ? (
              <span className="inline-flex gap-1.5">
                <Button size="xs" onClick={onConfirm} disabled={busy} aria-label={`Confirm ${r.full_name}`}>
                  {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Confirm
                </Button>
                <Button size="xs" variant="secondary" onClick={onDecline} disabled={busy} aria-label={`Decline ${r.full_name}`}>
                  <XIcon /> Decline
                </Button>
              </span>
            ) : r.status === "declined" || r.status === "lapsed" ? (
              <Button size="xs" variant="secondary" onClick={onReopen} disabled={busy} aria-label={`Reopen ${r.full_name}'s request`}>
                {busy ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />} Reopen
              </Button>
            ) : null}
          </td>
        ) : null}
      </tr>
      {open && answers.length ? (
        <tr className="bg-sunken/30">
          <td colSpan={columns} className="px-4 pt-1 pb-3">
            <div className={cn("max-w-[640px]", selectable && "pl-6")} aria-label={`Answers of ${r.full_name}`} role="group">
              <DefinitionRows rows={answers.map((a) => ({ k: a.label, v: a.value || <span className="text-ink-3">not answered</span> }))} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function RequestsPage({ eventId }: { eventId: number }) {
  const { can } = useAccess();
  // Owner, admin and editor decide; door staff read the queue (the server holds them to it).
  const canDecide = Boolean(can.decide_requests);
  const event = useEventDetail(eventId);
  const fields = useQuestions(eventId);
  const [status, setStatus] = React.useState<RequestTab>("pending");
  const summary = useEventSummary(eventId);
  const exporter = useExportRequests(eventId);
  const [searchInput, setSearchInput] = React.useState("");
  const [q, setQ] = React.useState("");
  const list = useRequestList(eventId, status, q);
  const bulk = useBulkDecision(eventId);
  const confirmOne = useConfirmRequest(eventId);
  const reopenOne = useReopenRequest(eventId);
  const [selection, setSelection] = React.useState<Selection>(NONE);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [outcome, setOutcome] = React.useState<OutcomeSummary | null>(null);
  const [openAnswers, setOpenAnswers] = React.useState<ReadonlySet<string>>(new Set());

  const pages = list.data?.pages;
  const first = pages?.[0];
  // Deduplicated: a row moved out and the next page read can meet the same id twice.
  const rows = React.useMemo(() => {
    const seen = new Map<string, RegistrationRequest>();
    for (const p of pages ?? []) for (const r of p?.items ?? []) if (!seen.has(r.id)) seen.set(r.id, r);
    return [...seen.values()];
  }, [pages]);

  if (first === null) {
    return (
      <FigurePanel>
        <EmptyState size="sm" icon={<InboxIcon />} title="Requests aren't available yet" description="Confirming each registration arrives with the next update of MyOtherApp. Nothing here needs you." />
      </FigurePanel>
    );
  }

  const counts = first?.counts;
  const placesLeft = first === undefined ? undefined : first.places_left;
  const waiting = counts?.pending ?? 0;
  const onWaiting = status === "pending";
  const selectable = canDecide && onWaiting && !list.isPlaceholderData;
  const showDecided = !onWaiting;
  const pendingShown = rows.filter((r) => r.status === "pending");
  const selectedCount = selection.all ? selection.total : selection.picked.size;
  const allShownSelected = !selection.all && pendingShown.length > 0 && pendingShown.every((r) => selection.picked.has(r.id));
  const requiresApproval = Boolean(event.data?.requires_approval);
  // Everyone who ever asked: the server's own total, else the statuses together (the same people).
  const total = first ? (first.total ?? totalOf(counts)) : null;
  const tabs: RequestTab[] = [...STATUS_TABS, ...(counts && counts.closed > 0 ? (["closed"] as const) : []), "all"];
  const tabCount = (t: RequestTab) => (t === "all" ? total : counts ? counts[t] : null);
  // The paid/paying split: the event's summary has it (the list's counts don't).
  const asked = summary.data?.requests;
  const figures = hasRequestFigures(asked) ? asked : null;
  const paidSplit = figures && (event.data?.has_fee || figures.approved_paid > 0 || figures.approved_awaiting_payment > 0 || figures.lapsed > 0) ? figures : null;
  // A server that counts the total has the export too; one whose export route is missing loses the button.
  const canExport = first?.total !== null && first?.total !== undefined && !exporter.missing;
  const busyRow = (id: string) => (confirmOne.isPending && confirmOne.variables?.id === id) || (reopenOne.isPending && reopenOne.variables?.id === id);

  const changeStatus = (next: RequestTab) => {
    setStatus(next);
    setSelection(NONE);
    setOpenAnswers(new Set());
  };
  const commitSearch = (value: string) => {
    const v = value.trim();
    if (v === q) return;
    setQ(v);
    setSelection(NONE);
  };
  const select = (r: RegistrationRequest, on: boolean) => {
    setSelection((cur) => {
      // From "every waiting request", unticking one is a choice among the ones shown.
      const picked = cur.all ? new Map(pendingShown.map((x) => [x.id, x])) : new Map(cur.picked);
      if (on) picked.set(r.id, r);
      else picked.delete(r.id);
      return { all: false, picked };
    });
  };
  const selectShown = (on: boolean) => setSelection(on ? { all: false, picked: new Map(pendingShown.map((r) => [r.id, r])) } : NONE);
  const toggleAnswers = (id: string) =>
    setOpenAnswers((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** A decision; afterwards the ticks go (one row's decline takes only its own tick). */
  const run = async (plan: BulkPlan, row?: RegistrationRequest) => {
    try {
      const out = await bulk.run(plan);
      setOutcome(summarise(out));
    } catch (e) {
      // The runs report a failed call in their summary; this is anything else, said as it is.
      toast.error(e instanceof Error && e.message ? e.message : "That didn't go through. Try again.");
    } finally {
      setDialog(null);
      setSelection((cur) => {
        if (!row || cur.all) return NONE;
        const picked = new Map(cur.picked);
        picked.delete(row.id);
        return { all: false, picked };
      });
    }
  };
  const confirmSelected = () =>
    void run(selection.all ? { kind: "confirm-all", total: selection.total } : { kind: "confirm", ids: queueOrder([...selection.picked.values()]).map((r) => r.id) });
  const declineChosen = ({ notify, note }: { notify: boolean; note: string }) => {
    const row = dialog?.kind === "decline" ? dialog.row : undefined;
    if (row) return void run({ kind: "decline", ids: [row.id], notify, note }, row);
    void run(
      selection.all ? { kind: "decline-all", total: selection.total, notify, note } : { kind: "decline", ids: queueOrder([...selection.picked.values()]).map((r) => r.id), notify, note },
    );
  };

  const header = counts
    ? `${formatNumber(total ?? 0)} in total · ${formatNumber(counts.pending)} waiting for you · ${formatNumber(counts.approved)} confirmed · ${formatNumber(counts.declined)} declined`
    : "Everyone who asked for a place: confirm them to send their ticket, or decline.";

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">Requests</h2>
          <p className="text-ink-3 mt-1 text-[12.5px]">{header}</p>
          {paidSplit ? (
            <p className="text-ink-2 mt-0.5 text-[12.5px]">
              Of the confirmed: <span className="text-admit font-medium">{formatNumber(paidSplit.approved_paid)} paid</span> ·{" "}
              <span className="text-caution font-medium">{formatNumber(paidSplit.approved_awaiting_payment)} paying</span>
              {paidSplit.approved_awaiting_payment > 0
                ? ` (${rupees(paidSplit.awaiting_payment_amount)} to come${paidSplit.earliest_hold_expires_at ? `, the first hold ends ${formatDateTime(paidSplit.earliest_hold_expires_at)}` : ""})`
                : ""}
              {paidSplit.lapsed > 0 ? ` · ${formatNumber(paidSplit.lapsed)} didn't pay` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-ink-2 m-0 text-[12.5px]" aria-live="polite">
            {placesLeft === undefined ? null : placesLeft === null ? "No limit on places" : `${formatNumber(placesLeft)} ${placesLeft === 1 ? "place" : "places"} left`}
          </p>
          {canExport ? (
            <Button size="sm" variant="secondary" onClick={() => exporter.mutate()} disabled={exporter.isPending}>
              {exporter.isPending ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Export
            </Button>
          ) : null}
        </div>
      </header>

      {!requiresApproval && waiting > 0 && event.data ? (
        <Notice tone="neutral" tag="Off">
          Confirming each registration is off, so new people register directly. {waiting === 1 ? "This request was" : `These ${formatNumber(waiting)} requests were`} made before it was turned off and {waiting === 1 ? "waits" : "wait"} for you to decide.
        </Notice>
      ) : null}
      {!canDecide ? (
        <Notice tone="neutral" tag="Role">
          Your role can see the requests but not decide them. Ask an owner, admin or editor to confirm or decline.
        </Notice>
      ) : null}
      {outcome ? (
        <Notice
          tone={outcome.tone}
          tag="Done"
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOutcome(null)}>
              Dismiss
            </button>
          }
        >
          <strong className="font-semibold">{outcome.title}.</strong>
          {outcome.lines.map((l) => (
            <span key={l} className="mt-0.5 block">
              {l}
            </span>
          ))}
        </Notice>
      ) : null}

      <FigurePanel className="overflow-hidden p-0">
        <Toolbar>
          <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
            {tabs.map((s) => (
              <Chip key={s} active={status === s} onClick={() => changeStatus(s)} tone={s === "pending" && waiting > 0 ? "caution" : "accent"}>
                {TAB_LABEL[s]}
                {tabCount(s) !== null ? <span className="font-mono tabular-nums">{formatNumber(tabCount(s))}</span> : null}
              </Chip>
            ))}
          </div>
          <ToolbarEnd>
            {/* The queue is oldest first (the order confirming takes); what was decided, newest first. */}
            <span className="text-ink-3 hidden font-mono text-[11px] sm:inline">{onWaiting ? "Oldest first" : "Newest first"}</span>
            <SearchField value={searchInput} onChange={setSearchInput} onCommit={commitSearch} placeholder="Name, email or phone" label="Search requests" className="w-full sm:w-64" />
          </ToolbarEnd>
        </Toolbar>

        {selectable && selectedCount > 0 ? (
          <div className="border-line-soft bg-brand-soft/30 flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5" role="region" aria-label="Selected requests">
            <span className="text-ink text-[13px] font-medium">{people(selectedCount)} selected</span>
            {selection.all ? (
              <span className="text-ink-2 text-[12.5px]">
                Every waiting request, oldest first.{" "}
                <button type="button" className="text-brand hover:text-ink font-medium" onClick={() => setSelection(NONE)}>
                  Clear selection
                </button>
              </span>
            ) : allShownSelected && waiting > pendingShown.length && !q ? (
              <span className="text-ink-2 text-[12.5px]">
                All {formatNumber(pendingShown.length)} on this page.{" "}
                <button type="button" className="text-brand hover:text-ink font-medium" onClick={() => setSelection({ all: true, total: waiting })}>
                  Select all {formatNumber(waiting)} waiting
                </button>
              </span>
            ) : null}
            <span className="flex-1" />
            <Button size="sm" onClick={() => setDialog({ kind: "confirm" })} disabled={bulk.running}>
              <CheckIcon /> Confirm {formatNumber(selectedCount)}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "decline" })} disabled={bulk.running}>
              <XIcon /> Decline {formatNumber(selectedCount)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelection(NONE)} disabled={bulk.running}>
              Clear
            </Button>
          </div>
        ) : null}

        {list.isPending ? (
          <div aria-busy="true" className="grid gap-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-11 rounded-lg" />
            ))}
          </div>
        ) : list.isError ? (
          <EmptyState
            size="sm"
            title="The requests could not load"
            description="Nothing has changed. Try again in a moment."
            action={
              <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
                Try again
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          q ? (
            <EmptyState
              size="sm"
              title="Nobody matches"
              description="Try a shorter search: part of a name, an email or a phone number."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchInput("");
                    commitSearch("");
                  }}
                >
                  Clear the search
                </Button>
              }
            />
          ) : (
            <EmptyState
              size="sm"
              icon={<InboxIcon />}
              title={onWaiting ? "Nobody is waiting" : status === "all" ? "Nobody has asked yet" : `Nothing ${STATUS_LABEL[status].toLowerCase()}`}
              description={
                onWaiting
                  ? requiresApproval
                    ? "People who fill the registration form wait here until you confirm or decline them."
                    : "Confirming each registration is off for this event, so people register directly. Turn it on under Settings."
                  : "Requests show here once they are."
              }
            />
          )
        ) : (
          <div className={cn("overflow-x-auto", list.isPlaceholderData && "opacity-60")}>
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  {selectable ? (
                    <th scope="col" className={cn(HEAD, "w-10 pr-0")}>
                      <Checkbox
                        checked={selection.all || allShownSelected ? true : selection.picked.size > 0 ? "indeterminate" : false}
                        onCheckedChange={(v) => selectShown(v === true)}
                        disabled={pendingShown.length === 0}
                        aria-label="Select all on this page"
                      />
                    </th>
                  ) : null}
                  <th scope="col" className={HEAD}>
                    Person
                  </th>
                  <th scope="col" className={HEAD}>
                    Ticket
                  </th>
                  <th scope="col" className={HEAD}>
                    Asked (India time)
                  </th>
                  {showDecided ? (
                    <th scope="col" className={HEAD}>
                      Outcome
                    </th>
                  ) : null}
                  {canDecide ? (
                    <th scope="col" className={cn(HEAD, "text-right")}>
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <RequestRow
                    key={r.id}
                    r={r}
                    fields={fields}
                    selectable={selectable}
                    selected={selection.all ? r.status === "pending" : selection.picked.has(r.id)}
                    onSelect={(on) => select(r, on)}
                    canDecide={canDecide}
                    showDecided={showDecided}
                    open={openAnswers.has(r.id)}
                    onToggleAnswers={() => toggleAnswers(r.id)}
                    onConfirm={() => confirmOne.mutate(r)}
                    onDecline={() => setDialog({ kind: "decline", row: r })}
                    onReopen={() => reopenOne.mutate(r)}
                    busy={busyRow(r.id) || bulk.running}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!list.isPending && rows.length > 0 ? (
          <div className="border-line-soft flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5">
            <span className="text-ink-3 text-[12px]">
              Showing {formatNumber(rows.length)}
              {counts && !q && tabCount(status) !== null ? ` of ${formatNumber(tabCount(status))}` : ""}
            </span>
            {list.hasNextPage ? (
              <Button variant="secondary" size="sm" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? <Loader2Icon className="animate-spin" /> : null}
                Load more
              </Button>
            ) : null}
          </div>
        ) : null}
      </FigurePanel>

      {dialog?.kind === "confirm" ? (
        <ConfirmDialog count={selectedCount} placesLeft={placesLeft} running={bulk.running} progress={bulk.progress} onConfirm={confirmSelected} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "decline" ? (
        <DeclineDialog
          count={dialog.row ? 1 : selectedCount}
          name={dialog.row?.full_name ?? (!selection.all && selection.picked.size === 1 ? [...selection.picked.values()][0]!.full_name : null)}
          running={bulk.running}
          progress={bulk.progress}
          onDecline={declineChosen}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
