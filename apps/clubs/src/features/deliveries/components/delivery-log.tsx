"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2Icon,
  DownloadIcon,
  Loader2Icon,
  MailIcon,
  RotateCwIcon,
} from "lucide-react";
import { formatDateTime, formatNumber, relativeTime } from "@moa/app-kit";
import {
  Button,
  CardLabel,
  Chip,
  cn,
  EmptyState,
  FigurePanel,
  Notice,
  Pager,
  SearchInput,
  Skeleton,
  StatTile,
  StatusBadge,
  Toolbar,
  ToolbarEnd,
} from "@moa/ui";

import { useEventDetail } from "@/features/events";

import {
  fetchDeliveryLog,
  type DeliveryLogQuery,
  type DocumentKind,
} from "../api";
import {
  useDeliveryLog,
  useDeliverySummary,
  useDeliveryTallies,
  useSendDocuments,
  useSendOneDocument,
} from "../queries";
import {
  addTallies,
  isProblem,
  tallyFigures,
  verdictOf,
  type DeliveryLogRow,
  type DeliverySummary,
  type TallyFigures,
} from "../schemas";
import { SendsBar } from "./sends-bar";

/**
 * Deliveries, rebuilt around the two questions an organiser brings to it:
 * did it arrive, and what needs sending again. One line and four figures on
 * every send the event made — sent, delivered, did not arrive, could not be
 * sent; then each kind (tickets, certificates, messages) as a bar, beside
 * what to do about the problems, each with its button. Then every send,
 * newest first, narrowed to a kind or to the problems, with Send again on a
 * ticket or certificate that did not land. The figures are always the whole
 * event's, so narrowing the list never makes a number look smaller than it
 * is.
 */
type Kind = "all" | DocumentKind | "message";
const KINDS: { value: Kind; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "ticket", label: "Tickets" },
  { value: "certificate", label: "Certificates" },
  { value: "message", label: "Messages" },
];
const KIND_NOUN: Record<Exclude<Kind, "all">, [string, string]> = {
  ticket: ["ticket", "tickets"],
  certificate: ["certificate", "certificates"],
  message: ["message", "messages"],
};
const readKind = (v: string | null): Kind =>
  v === "ticket" || v === "certificate" || v === "message" ? v : "all";
const n = (count: number, [one, many]: [string, string]) =>
  `${formatNumber(count)} ${count === 1 ? one : many}`;
const csvCell = (v: string | null | undefined) =>
  `"${(v ?? "").replace(/"/g, '""')}"`;
const emailOf = (s: DeliverySummary | undefined) =>
  s?.channels.find((c) => c.channel === "email");
const COLS =
  "sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1.2fr)_96px_minmax(0,1.35fr)_112px]";
const LEGEND = [
  ["bg-admit", "delivered"],
  ["bg-info", "awaiting"],
  ["bg-refuse", "did not arrive"],
  ["bg-caution", "not sent"],
] as const;

function ByKind({
  by,
  unsent,
  onPick,
}: {
  by: Record<Exclude<Kind, "all">, TallyFigures>;
  unsent: Record<DocumentKind, number>;
  onPick: (k: Kind) => void;
}) {
  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          <span className="text-ink-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
            {LEGEND.map(([fill, word]) => (
              <span key={word} className="flex items-center gap-1">
                <i className={cn("inline-block size-2 rounded-full", fill)} />
                {word}
              </span>
            ))}
          </span>
        }
      >
        By what was sent
      </CardLabel>
      <ul className="mt-3 grid gap-2">
        {(["ticket", "certificate", "message"] as const).map((k) => {
          const f = by[k];
          const left = k === "message" ? 0 : unsent[k];
          const label = KINDS.find((x) => x.value === k)!.label;
          const parts = [
            f.didntArrive
              ? `${formatNumber(f.didntArrive)} did not arrive`
              : null,
            f.failed ? `${formatNumber(f.failed)} refused` : null,
            f.skipped ? `${formatNumber(f.skipped)} without an address` : null,
            f.pending ? `${formatNumber(f.pending)} sending` : null,
            left ? `${formatNumber(left)} not sent yet` : null,
          ].filter(Boolean);
          return (
            <li key={k}>
              <button
                type="button"
                onClick={() => onPick(k)}
                className="hover:bg-sunken/60 -mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1.5 text-left transition-colors"
                aria-label={`Show the ${label.toLowerCase()} sent`}
              >
                <span className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="text-ink font-medium">{label}</span>
                  <span className="text-ink-3 font-mono text-[11px] tabular-nums">
                    {f.sends
                      ? `${formatNumber(f.sent)} sent · ${formatNumber(f.delivered)} delivered${f.deliveryRate !== null ? ` · ${f.deliveryRate}%` : ""}`
                      : "none sent"}
                  </span>
                </span>
                <SendsBar
                  f={f}
                  unsent={left}
                  label={label}
                  className="mt-1.5"
                />
                <span
                  className={cn(
                    "mt-1 block text-[11.5px]",
                    f.problems ? "text-caution" : "text-ink-3",
                  )}
                >
                  {parts.length
                    ? parts.join(" · ")
                    : f.sends
                      ? f.awaiting
                        ? `${formatNumber(f.awaiting)} awaiting the provider's report`
                        : "every one accepted"
                      : `no ${KIND_NOUN[k][0]} has gone out yet`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </FigurePanel>
  );
}

function FixRow({
  tone,
  title,
  children,
  action,
}: {
  tone: "refuse" | "caution" | "neutral" | "admit";
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const dot = {
    refuse: "bg-refuse",
    caution: "bg-caution",
    neutral: "bg-ink-3",
    admit: "bg-admit",
  }[tone];
  return (
    <li className="border-line-soft flex flex-wrap items-start gap-3 border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className={cn("mt-[7px] size-2 shrink-0 rounded-full", dot)}
      />
      <div className="min-w-[180px] flex-1">
        <p className="text-ink text-[13px] font-medium">{title}</p>
        {children ? (
          <p className="text-ink-3 mt-0.5 text-[12px] leading-[1.5]">
            {children}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
      ) : null}
    </li>
  );
}

function Resends({
  eventId,
  all,
  message,
  tickets,
  certificates,
  onShowProblems,
}: {
  eventId: number;
  all: TallyFigures;
  message: TallyFigures;
  tickets: DeliverySummary | undefined;
  certificates: DeliverySummary | undefined;
  onShowProblems: () => void;
}) {
  const sendTickets = useSendDocuments(eventId, "ticket");
  const sendCertificates = useSendDocuments(eventId, "certificate");
  const unconfigured = (tickets?.providers ?? []).filter((p) => !p.configured);
  const docs = [
    { kind: "ticket" as const, s: tickets, send: sendTickets },
    { kind: "certificate" as const, s: certificates, send: sendCertificates },
  ]
    .map((d) => {
      const e = emailOf(d.s);
      return {
        ...d,
        unsent: e?.unsent ?? 0,
        failed: e?.failed ?? 0,
        skipped: e?.skipped ?? 0,
        toSend: e ? e.unsent + e.failed + e.skipped : 0,
      };
    })
    .filter((d) => d.toSend > 0);
  const nothing =
    unconfigured.length === 0 &&
    docs.length === 0 &&
    all.didntArrive === 0 &&
    message.failed === 0;

  return (
    <FigurePanel className="p-4">
      <CardLabel>What needs a resend</CardLabel>
      <ul className="mt-3">
        {unconfigured.map((p) => (
          <FixRow
            key={p.channel}
            tone="refuse"
            title={`${p.name} is not set up, so nothing goes out by ${p.channel}`}
          >
            {p.note}
          </FixRow>
        ))}
        {docs.map((d, i) => {
          const noun = KIND_NOUN[d.kind];
          const busy = d.send.isPending;
          return (
            <FixRow
              key={d.kind}
              tone={d.failed ? "refuse" : "caution"}
              title={`${n(d.toSend, ["guest is", "guests are"])} without their ${noun[0]}`}
              action={
                <Button
                  size="sm"
                  variant={i === 0 ? "primary" : "secondary"}
                  disabled={busy}
                  onClick={() => d.send.mutate("unsent")}
                >
                  {busy ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <RotateCwIcon />
                  )}
                  Send {n(d.toSend, noun)}
                </Button>
              }
            >
              {[
                d.unsent ? `${formatNumber(d.unsent)} not sent yet` : null,
                d.failed
                  ? `${formatNumber(d.failed)} refused by the mail provider`
                  : null,
                d.skipped
                  ? `${formatNumber(d.skipped)} with no email address, skipped until one is added on Attendees`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              . Anyone who already has theirs is not sent it twice.
            </FixRow>
          );
        })}
        {all.didntArrive > 0 ? (
          <FixRow
            tone="caution"
            title={`${n(all.didntArrive, ["send", "sends"])} did not arrive`}
            action={
              <>
                <Button size="sm" variant="ghost" onClick={onShowProblems}>
                  Show them
                </Button>
                <Link
                  href={`/events/${eventId}/attendees`}
                  className="btn btn-secondary btn-sm"
                >
                  Attendees
                </Link>
              </>
            }
          >
            {[
              all.bounced ? `${formatNumber(all.bounced)} bounced` : null,
              all.complained
                ? `${formatNumber(all.complained)} marked as spam`
                : null,
              all.undelivered
                ? `${formatNumber(all.undelivered)} not delivered`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            . The same address fails the same way: correct it on Attendees, then
            use Send again on its row below.
          </FixRow>
        ) : null}
        {message.failed > 0 ? (
          <FixRow
            tone="neutral"
            title={`${n(message.failed, ["message delivery was", "message deliveries were"])} refused`}
            action={
              <Link
                href={`/events/${eventId}/messages`}
                className="btn btn-secondary btn-sm"
              >
                Messages
              </Link>
            }
          >
            A message is not sent again by itself. Write a new one to reach the
            guests it missed.
          </FixRow>
        ) : null}
        {nothing ? (
          <FixRow tone="admit" title="Nothing needs a resend">
            {all.sends
              ? "Every send so far was accepted, and none came back."
              : "Nothing has been sent yet. Tickets go out from Attendees, certificates from Certificates."}
          </FixRow>
        ) : null}
      </ul>
    </FigurePanel>
  );
}

function Row({
  r,
  now,
  onResend,
  resending,
}: {
  r: DeliveryLogRow;
  now: Date;
  onResend: (r: DeliveryLogRow) => void;
  resending: boolean;
}) {
  const v = verdictOf(r);
  const problem = isProblem(r);
  const document = r.kind === "ticket" || r.kind === "certificate";
  const what =
    r.kind === "ticket"
      ? "Ticket"
      : r.kind === "certificate"
        ? "Certificate"
        : (r.what ?? "Message");
  return (
    <li
      className={cn(
        "border-line-soft grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 border-t px-4 py-3 text-[12.5px]",
        COLS,
      )}
    >
      <span className="min-w-0">
        <span className="text-ink block truncate text-[13.5px] font-medium">
          {r.name || "Unnamed guest"}
        </span>
        <span
          className={cn(
            "block truncate font-mono text-[11.5px]",
            r.address ? "text-ink-3" : "text-caution",
          )}
        >
          {r.address || "no address"}
        </span>
      </span>
      <span className="hidden min-w-0 sm:block">
        <span className="text-ink-2 block truncate">{what}</span>
        <span className="text-ink-3 block truncate font-mono text-[11px]">
          {r.kind === "message" ? "message · " : ""}
          {r.ticket_id} · {r.channel}
          {r.attempts > 1 ? ` · ${r.attempts} tries` : ""}
        </span>
      </span>
      <span
        className="text-ink-3 hidden font-mono text-[11px] tabular-nums sm:block"
        title={r.sent_at ? formatDateTime(r.sent_at) : undefined}
      >
        {r.sent_at ? relativeTime(r.sent_at, now) : "—"}
      </span>
      <span className="min-w-0">
        <span
          title={
            r.outcome_at
              ? `Reported ${formatDateTime(r.outcome_at)}`
              : undefined
          }
        >
          <StatusBadge tone={v.tone} label={v.label} />
        </span>
        <span className="text-ink-3 ml-2 text-[11.5px] sm:hidden">{what}</span>
        {r.reason ? (
          <span
            className={cn(
              "mt-1 block text-[11.5px] leading-snug",
              problem ? "text-refuse" : "text-ink-3",
            )}
          >
            {r.reason}
          </span>
        ) : null}
      </span>
      <span className="flex justify-end">
        {document && problem ? (
          <Button
            size="xs"
            variant="secondary"
            disabled={resending}
            onClick={() => onResend(r)}
            aria-label={`Send ${r.name || "this guest"} their ${r.kind} again`}
          >
            {resending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <RotateCwIcon />
            )}
            Send again
          </Button>
        ) : null}
      </span>
    </li>
  );
}

export function DeliveryLog({ eventId }: { eventId: number }) {
  const params = useSearchParams();
  const event = useEventDetail(eventId);
  const [now] = React.useState(() => new Date());
  const [kind, setKind] = React.useState<Kind>(() =>
    readKind(params.get("kind")),
  );
  const [problem, setProblem] = React.useState(
    () => params.get("problem") === "1",
  );
  const [search, setSearch] = React.useState("");
  const [settled, setSettled] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [downloading, setDownloading] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  const q: DeliveryLogQuery = {
    eventId,
    kind: kind === "all" ? undefined : kind,
    problem,
    search: settled || undefined,
    page,
    pageSize,
  };
  const log = useDeliveryLog(q);
  const tallies = useDeliveryTallies(eventId);
  const ticketSummary = useDeliverySummary(eventId, "ticket");
  const certificateSummary = useDeliverySummary(eventId, "certificate");
  const resendTicket = useSendOneDocument(eventId, "ticket");
  const resendCertificate = useSendOneDocument(eventId, "certificate");

  const by = {
    ticket: tallyFigures(tallies.ticket),
    certificate: tallyFigures(tallies.certificate),
    message: tallyFigures(tallies.message),
  };
  const all = tallyFigures(
    addTallies(tallies.ticket, tallies.certificate, tallies.message),
  );
  const unsent = {
    ticket: emailOf(ticketSummary.data)?.unsent ?? 0,
    certificate: emailOf(certificateSummary.data)?.unsent ?? 0,
  };
  const scoped = kind === "all" ? all : by[kind];
  const items = log.data?.items ?? [];
  const total = log.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const ready = !tallies.isPending && !tallies.isError;
  const hero =
    all.didntArrive > 0 ? "didnt" : all.notSent > 0 ? "notSent" : null;

  const pick = (k: Kind) => {
    setKind(k);
    setPage(1);
  };
  const showProblems = () => {
    setProblem(true);
    setPage(1);
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const resend = (r: DeliveryLogRow) =>
    (r.kind === "certificate" ? resendCertificate : resendTicket).mutate(
      r.registration_id,
    );
  const resendingId = resendTicket.isPending
    ? resendTicket.variables
    : resendCertificate.isPending
      ? resendCertificate.variables
      : null;

  const download = async () => {
    setDownloading(true);
    try {
      const rows: DeliveryLogRow[] = [];
      // Walk the pages rather than asking for everything at once: a busy event
      // is thousands of sends, and this is a file somebody waits for.
      for (let p = 1; p <= 200; p++) {
        const res = await fetchDeliveryLog({ ...q, page: p, pageSize: 200 });
        rows.push(...res.items);
        if (rows.length >= res.total || !res.items.length) break;
      }
      const csv = [
        [
          "Guest",
          "Ticket",
          "Address",
          "Channel",
          "What",
          "Sent",
          "Outcome",
          "Reason",
        ].join(","),
        ...rows.map((r) =>
          [
            csvCell(r.name),
            csvCell(r.ticket_id),
            csvCell(r.address),
            csvCell(r.channel),
            csvCell(r.kind === "message" ? `message: ${r.what ?? ""}` : r.kind),
            csvCell(r.sent_at ? formatDateTime(r.sent_at) : ""),
            csvCell(verdictOf(r).label),
            csvCell(r.reason),
          ].join(","),
        ),
      ].join("\n");
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${event.data?.slug ?? `event-${eventId}`}-deliveries${kind === "all" ? "" : `-${kind}`}${problem ? "-problems" : ""}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">
            Deliveries
          </h2>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {ready && all.sends
              ? `${n(all.sends, ["send", "sends"])} to guests · ${formatNumber(all.delivered)} delivered · ${all.problems ? `${formatNumber(all.problems)} need a look` : "nothing needs a look"}${all.pending ? ` · ${formatNumber(all.pending)} sending now` : ""}`
              : "Every ticket, certificate and message sent to a guest, and what became of it."}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={downloading || !total}
          onClick={download}
        >
          {downloading ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <DownloadIcon />
          )}
          Export CSV
        </Button>
      </header>

      {tallies.isError ? (
        <EmptyState
          tone="muted"
          title="Could not load the delivery figures"
          description="Try reloading the page."
        />
      ) : !ready ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[108px] rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-[220px] rounded-2xl" />
            <Skeleton className="h-[220px] rounded-2xl" />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Sent"
              value={formatNumber(all.sent)}
              note={
                all.sends
                  ? `${formatNumber(by.ticket.sent)} tickets · ${formatNumber(by.certificate.sent)} certificates · ${formatNumber(by.message.sent)} messages`
                  : "nothing sent yet"
              }
            />
            <StatTile
              label="Delivered"
              value={all.deliveryRate === null ? "—" : `${all.deliveryRate}%`}
              note={
                all.known
                  ? `${formatNumber(all.delivered)} of ${formatNumber(all.known)} reported${all.awaiting ? ` · ${formatNumber(all.awaiting)} awaiting` : ""}`
                  : all.sent
                    ? "no delivery reports yet"
                    : "nothing sent yet"
              }
            />
            <StatTile
              label="Did not arrive"
              value={formatNumber(all.didntArrive)}
              note={
                all.didntArrive
                  ? [
                      all.bounced
                        ? `${formatNumber(all.bounced)} bounced`
                        : null,
                      all.complained
                        ? `${formatNumber(all.complained)} spam`
                        : null,
                      all.undelivered
                        ? `${formatNumber(all.undelivered)} not delivered`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "none bounced"
              }
              scale={hero === "didnt" ? "hero" : "sm"}
              action={
                all.didntArrive
                  ? { label: "Show them", onClick: showProblems }
                  : undefined
              }
            />
            <StatTile
              label="Could not be sent"
              value={formatNumber(all.notSent)}
              note={
                all.notSent
                  ? `${formatNumber(all.failed)} refused · ${formatNumber(all.skipped)} no address`
                  : all.pending
                    ? `${formatNumber(all.pending)} still sending`
                    : "every send accepted"
              }
              scale={hero === "notSent" ? "hero" : "sm"}
              action={
                all.notSent
                  ? { label: "Show them", onClick: showProblems }
                  : undefined
              }
            />
          </div>

          {all.pending > 0 ? (
            <Notice tone="accent" tag="Sending">
              {n(all.pending, ["send is", "sends are"])} on the way. The figures
              follow as each one lands.
            </Notice>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <ByKind
              by={by}
              unsent={unsent}
              onPick={(k) => {
                pick(k);
                listRef.current?.scrollIntoView?.({
                  behavior: "smooth",
                  block: "start",
                });
              }}
            />
            <Resends
              eventId={eventId}
              all={all}
              message={by.message}
              tickets={ticketSummary.data}
              certificates={certificateSummary.data}
              onShowProblems={showProblems}
            />
          </div>
        </>
      )}

      <div ref={listRef} className="scroll-mt-4">
        <FigurePanel className="p-0">
          <Toolbar>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="What was sent"
            >
              {KINDS.map((k) => {
                const count = k.value === "all" ? all.sends : by[k.value].sends;
                return (
                  <Chip
                    key={k.value}
                    active={kind === k.value}
                    onClick={() => pick(k.value)}
                  >
                    {k.label}
                    {ready && count ? ` ${formatNumber(count)}` : ""}
                  </Chip>
                );
              })}
              <span
                className="border-line-soft mx-1 hidden border-l sm:block"
                aria-hidden="true"
              />
              <Chip
                tone="refuse"
                active={problem}
                onClick={() => {
                  setProblem((p) => !p);
                  setPage(1);
                }}
              >
                Problems
                {ready && scoped.problems
                  ? ` ${formatNumber(scoped.problems)}`
                  : ""}
              </Chip>
            </div>
            <ToolbarEnd>
              <SearchInput
                value={search}
                onChange={setSearch}
                onDebouncedChange={(v) => {
                  const next = v.trim();
                  if (next === settled) return;
                  setSettled(next);
                  setPage(1);
                }}
                delayMs={300}
                placeholder="Name, email or ticket"
                aria-label="Search the deliveries"
                containerClassName="sm:w-60"
              />
            </ToolbarEnd>
          </Toolbar>

          {log.isPending ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : log.isError ? (
            <EmptyState
              tone="muted"
              title="Could not load the deliveries"
              description="Try reloading the page."
            />
          ) : items.length === 0 ? (
            problem ? (
              <EmptyState
                size="sm"
                icon={<CheckCircle2Icon />}
                title="Nothing went wrong"
                description={
                  settled
                    ? "Nobody matching that search had a problem."
                    : "Every send here was accepted, and none came back."
                }
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setProblem(false)}
                  >
                    Show every send
                  </Button>
                }
              />
            ) : settled ? (
              <EmptyState
                size="sm"
                title="Nobody matches"
                description="Try a name, an email address or a ticket number."
              />
            ) : kind !== "all" ? (
              <EmptyState
                size="sm"
                icon={<MailIcon />}
                title={`No ${KIND_NOUN[kind][1]} sent yet`}
                description={
                  kind === "ticket"
                    ? "Tickets go out from Attendees, at registration or all at once."
                    : kind === "certificate"
                      ? "Certificates go out from Certificates once they are issued."
                      : "Messages and journey emails show here once they go out."
                }
              />
            ) : (
              <EmptyState
                icon={<MailIcon />}
                title="Nothing sent yet"
                description="Tickets go out from Attendees, certificates from Certificates and messages from Messages. Each send lands here with what became of it."
                action={
                  <Link
                    href={`/events/${eventId}/attendees`}
                    className="btn btn-secondary"
                  >
                    Go to Attendees
                  </Link>
                }
              />
            )
          ) : (
            <>
              <div
                className={cn(
                  "text-ink-3 hidden gap-3 px-4 py-2 font-mono text-[10px] tracking-[0.06em] uppercase sm:grid",
                  COLS,
                )}
              >
                <span>Guest</span>
                <span>What</span>
                <span>Sent</span>
                <span>Outcome</span>
                <span />
              </div>
              <ul>
                {items.map((r) => (
                  <Row
                    key={r.id}
                    r={r}
                    now={now}
                    onResend={resend}
                    resending={resendingId === r.registration_id}
                  />
                ))}
              </ul>
            </>
          )}

          {!log.isPending && total > 0 ? (
            <div className="border-line-soft border-t px-4 py-2.5">
              <Pager
                page={page}
                pageCount={pages}
                total={total}
                pageSize={pageSize}
                sizes={[20, 50, 100]}
                noun={["send", "sends"]}
                busy={log.isFetching}
                onPage={setPage}
                onPageSize={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </div>
          ) : null}
          <p className="text-ink-3 border-line-soft border-t px-4 py-2.5 text-[11.5px]">
            Sent means handed to the mail provider. Delivered, bounced and
            marked as spam come back in the provider&apos;s reports, usually
            within minutes; until then a send reads Sent.
          </p>
        </FigurePanel>
      </div>
    </div>
  );
}
