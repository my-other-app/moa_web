"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  LockIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { RequestFunnelCard, formatDateTime, formatNumber, hasRequestFigures } from "@moa/app-kit";
import {
  CardLabel,
  EmptyState,
  FigurePanel,
  Notice,
  ProgressBar,
  Skeleton,
  StatTile,
  cn,
  toast,
} from "@moa/ui";

import { useCertificateSummary } from "@/features/certificates";
import { useEventDetail } from "@/features/events";
import { useFinance } from "@/features/finance";
import { openPdf } from "@/features/idcards";
import { useFeedback } from "@/features/live";
import { useFeatureGate } from "@/features/plan";

import { reportPdfUrl } from "../api";
import {
  useCloseoutSettings,
  useFigures,
  useGenerateReport,
  useReports,
  useRetention,
  useUpdateCloseoutSettings,
} from "../queries";
import type { CloseoutSettings, Figures } from "../schemas";
import { FiguresPanel, ReportsPanel, StatusPanel } from "./closeout-panels";
import { RetentionPanel } from "./retention-panel";

/**
 * Closeout, rebuilt as the list an organiser works down the morning after:
 * is the attendance final, is the money settled, are the certificates out,
 * did the feedback go, is the report kept, is the event closed, and what
 * happens to the guest data. Four figures first; then that list, each step
 * saying where it stands and the one thing that moves it; then the night in
 * figures, the status and the reports, and the guest data at the foot.
 */
const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const rupees = (n: number) =>
  n < 0 ? `−${INR.format(Math.abs(n))}` : INR.format(n);
const plural = (n: number, one: string, many = `${one}s`) =>
  n === 1 ? one : many;

type StepState = "done" | "todo" | "attention" | "waiting";
interface Step {
  key: string;
  title: string;
  state: StepState;
  detail: React.ReactNode;
  action?: React.ReactNode;
}

const STATE_WORD: Record<StepState, string> = {
  done: "Done",
  todo: "To do",
  attention: "Needs a look",
  waiting: "Waiting",
};

function Marker({ state, n }: { state: StepState; n: number }) {
  const base =
    "grid size-7 shrink-0 place-items-center rounded-full border text-[11px] font-mono font-semibold";
  if (state === "done")
    return (
      <span className={cn(base, "border-admit-line bg-admit-soft text-admit")}>
        <CheckIcon className="size-3.5" aria-hidden="true" />
      </span>
    );
  if (state === "attention")
    return (
      <span
        className={cn(base, "border-caution-line bg-caution-soft text-caution")}
      >
        <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
      </span>
    );
  if (state === "waiting")
    return (
      <span className={cn(base, "border-line bg-sunken text-ink-3")}>
        <ClockIcon className="size-3.5" aria-hidden="true" />
      </span>
    );
  return (
    <span className={cn(base, "border-line bg-surface text-ink-2")}>{n}</span>
  );
}

const go = (href: string, text: string) => (
  <Link href={href} className="btn btn-secondary btn-xs">
    {text}
  </Link>
);

// ─── After the event ─────────────────────────────────────────────────────

function Checklist({
  eventId,
  s,
  f,
  now,
}: {
  eventId: number;
  s: CloseoutSettings;
  f: Figures | undefined;
  now: number;
}) {
  const finance = useFinance({ kind: "event", eventId }, {});
  const certs = useCertificateSummary(eventId);
  const feedback = useFeedback(eventId);
  const reports = useReports(eventId);
  const retention = useRetention(eventId);
  const update = useUpdateCloseoutSettings(eventId);
  const generate = useGenerateReport(eventId);
  const reportGate = useFeatureGate("report", { eventId });
  const base = `/events/${eventId}`;
  const ended = now >= new Date(s.ends_at).getTime();
  const closed = s.status === "closed" || s.status === "archived";
  const statusLabel =
    s.statuses.find((o) => o.key === s.status)?.label ?? s.status;
  const steps: Step[] = [];

  // Attendance: final once the event is over and someone was counted.
  if (!f)
    steps.push({
      key: "attendance",
      title: "Attendance",
      state: "waiting",
      detail: "Reading the figures…",
    });
  else if (!ended)
    steps.push({
      key: "attendance",
      title: "Attendance",
      state: "waiting",
      detail: `${formatNumber(f.checked_in)} of ${formatNumber(f.registered)} checked in so far. The door counts until ${formatDateTime(s.ends_at)}.`,
      action: go(`${base}/check-ins`, "Check-ins"),
    });
  else if (f.registered > 0 && f.checked_in === 0)
    steps.push({
      key: "attendance",
      title: "Attendance",
      state: "attention",
      detail:
        "Nobody was marked present. Certificates for those who came, and the turnout in the report, both read it.",
      action: go(`${base}/check-ins`, "Mark attendance"),
    });
  else
    steps.push({
      key: "attendance",
      title: "Attendance is final",
      state: "done",
      detail: f.registered
        ? `${formatNumber(f.checked_in)} of ${formatNumber(f.registered)} checked in · ${f.turnout_pct}% turnout · ${formatNumber(f.no_shows)} no-shows`
        : "Nobody registered, so there was nobody to count.",
      action: go(`${base}/check-ins`, "Check-ins"),
    });

  // Money: settled when nobody owes anything and what was spent is logged.
  const fin = finance.data?.figures;
  if (!fin)
    steps.push({
      key: "money",
      title: "Money",
      state: "waiting",
      detail: finance.isError
        ? "Could not read the ledger. Finance has the figures."
        : "Reading the ledger…",
      action: go(`${base}/finance`, "Finance"),
    });
  else if (fin.outstanding_count > 0)
    steps.push({
      key: "money",
      title: "Money",
      state: "attention",
      detail: `${rupees(fin.outstanding)} is still owed by ${formatNumber(fin.outstanding_count)} ${plural(fin.outstanding_count, "guest")}. It will not arrive by itself.`,
      action: go(`${base}/attendees`, "See who"),
    });
  else if (fin.gross > 0 && fin.expense_count === 0)
    steps.push({
      key: "money",
      title: "Money",
      state: "todo",
      detail: `${rupees(fin.gross)} came in and nothing spent is logged, so the net is just the income.`,
      action: go(`${base}/finance`, "Log expenses"),
    });
  else
    steps.push({
      key: "money",
      title: "Money is settled",
      state: "done",
      detail:
        fin.gross || fin.expenses
          ? `${rupees(fin.gross)} in · ${rupees(fin.expenses)} out · ${rupees(fin.net)} net · nobody owes anything`
          : "No money moved for this event.",
      action: go(`${base}/finance`, "Finance"),
    });

  // Certificates: out when everyone who came has one and it has been sent.
  const c = certs.data;
  const email = c?.channels.find((x) => x.channel === "email");
  const unsent = email ? email.unsent + email.failed + email.skipped : 0;
  if (!c)
    steps.push({
      key: "certificates",
      title: "Certificates",
      state: "waiting",
      detail: certs.isError
        ? "Could not read the certificates."
        : "Reading the certificates…",
      action: go(`${base}/certificates`, "Certificates"),
    });
  else if (c.issued === 0)
    steps.push({
      key: "certificates",
      title: "Certificates",
      state: c.attended === 0 ? "waiting" : "todo",
      detail:
        c.attended === 0
          ? "None issued. The usual rule gives one to everyone who checked in, so attendance comes first."
          : `None issued yet for the ${formatNumber(c.attended)} who came.`,
      action: go(`${base}/certificates`, "Issue"),
    });
  else if (unsent > 0)
    steps.push({
      key: "certificates",
      title: "Certificates",
      state: email && email.failed > 0 ? "attention" : "todo",
      detail: `${formatNumber(c.issued)} issued · ${formatNumber(unsent)} not sent yet${email?.failed ? `, ${formatNumber(email.failed)} of them failed` : ""}.`,
      action: go(`${base}/certificates`, "Send"),
    });
  else
    steps.push({
      key: "certificates",
      title: "Certificates are out",
      state: "done",
      detail: `${formatNumber(c.issued)} issued and sent${c.outdated ? ` · ${formatNumber(c.outdated)} on an older design` : ""}`,
      action: go(`${base}/certificates`, "Certificates"),
    });

  // Feedback: the survey has gone, or is set to.
  const fb = feedback.data;
  const rated = f && f.rating_count > 0;
  const rating = rated
    ? ` · rated ${f.rating_avg.toFixed(1)} by ${formatNumber(f.rating_count)}`
    : "";
  if (fb?.sent_at)
    steps.push({
      key: "feedback",
      title: "Feedback is in",
      state: "done",
      detail: `Survey sent to ${formatNumber(fb.sent_count)} ${formatDateTime(fb.sent_at)} · ${formatNumber(fb.results.responses)} answered${rating}`,
      action: go(`${base}/live?view=feedback`, "Results"),
    });
  else if (fb?.sends_at)
    steps.push({
      key: "feedback",
      title: "Feedback",
      state: "waiting",
      detail: `The survey goes to everyone checked in at ${formatDateTime(fb.sends_at)}.`,
      action: go(`${base}/live?view=feedback`, "Survey"),
    });
  else if (!fb && feedback.isPending)
    steps.push({
      key: "feedback",
      title: "Feedback",
      state: "waiting",
      detail: "Reading the survey…",
    });
  else
    steps.push({
      key: "feedback",
      title: rated ? "Feedback is in" : "Feedback",
      state: rated ? "done" : "todo",
      detail: rated
        ? `No survey sent${rating}.`
        : "No survey has gone out. Send it while the night is fresh.",
      action: go(`${base}/live?view=feedback`, "Survey"),
    });

  // The report: kept once one has been generated.
  const latest = reports.data?.[0];
  if (latest)
    steps.push({
      key: "report",
      title: "The report is kept",
      state: "done",
      detail: `Latest ${formatDateTime(latest.generated_at)}${latest.delivered_to.length ? ` · sent to ${latest.delivered_to.join(", ")}` : ""}`,
      action: (
        <button
          type="button"
          className="btn btn-secondary btn-xs"
          onClick={() => openPdf(reportPdfUrl(eventId, latest.id))}
        >
          <DownloadIcon /> PDF
        </button>
      ),
    });
  else
    steps.push({
      key: "report",
      title: "The report",
      state: reports.isPending ? "waiting" : "todo",
      detail: reports.isPending
        ? "Reading the reports…"
        : "None yet. It sums the event up as of the moment it is made, and can be made again.",
      action: reports.isPending ? undefined : (
        <button
          type="button"
          className="btn btn-secondary btn-xs"
          disabled={generate.isPending}
          onClick={reportGate.guard(() => generate.mutate())}
        >
          {reportGate.locked ? <LockIcon /> : <FileTextIcon />} Generate
        </button>
      ),
    });

  // Closing it: the one primary action once the event is over.
  if (closed)
    steps.push({
      key: "close",
      title: "The event is closed",
      state: "done",
      detail: `${statusLabel}. Settings are locked and the door is shut.`,
    });
  else if (ended)
    steps.push({
      key: "close",
      title: "Close the event",
      state: "todo",
      detail: `Still ${statusLabel.toLowerCase()}. Closing it locks the settings and shuts the door; it can be moved back to Live.`,
      action: (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={update.isPending}
          onClick={() =>
            update.mutate(
              { status: "closed" },
              {
                onSuccess: () =>
                  toast.success("Event closed", {
                    description:
                      "Settings are locked and the door is shut. Move it back to Live to change anything.",
                  }),
              },
            )
          }
        >
          <LockIcon /> Close the event
        </button>
      ),
    });
  else
    steps.push({
      key: "close",
      title: "Close the event",
      state: "waiting",
      detail: s.status_clock
        ? `The clock closes it after it ends, ${formatDateTime(s.ends_at)}.`
        : `It is off the clock, so close it by hand once it ends, ${formatDateTime(s.ends_at)}.`,
    });

  // The guest data: decided, scheduled, or scrubbed.
  const r = retention.data;
  if (!r)
    steps.push({
      key: "data",
      title: "Guest data",
      state: "waiting",
      detail: retention.isError
        ? "Could not read the retention schedule."
        : "Reading the retention schedule…",
    });
  else if (r.state === "failed")
    steps.push({
      key: "data",
      title: "Guest data",
      state: "attention",
      detail: `The last retention run failed${r.last_error ? `: ${r.last_error}` : ""}. Nothing was scrubbed.`,
      action: (
        <a href="#guest-data" className="btn btn-secondary btn-xs">
          Guest data
        </a>
      ),
    });
  else if (r.state === "deleted")
    steps.push({
      key: "data",
      title: "Guest data is scrubbed",
      state: "done",
      detail: `Scrubbed ${formatDateTime(r.completed_at)}${r.keeps_contacts ? ` · ${formatNumber(r.contacts_kept)} contacts kept for the club` : ""}`,
    });
  else if (s.retention_mode === "delete")
    steps.push({
      key: "data",
      title: "Guest data",
      state: "waiting",
      detail: `Scrubbed ${formatDateTime(r.run_at)}, once the report is kept${r.recipients.length ? ` and sent to ${r.recipients.join(", ")}` : ""}.`,
      action: (
        <a href="#guest-data" className="btn btn-secondary btn-xs">
          Change
        </a>
      ),
    });
  else
    steps.push({
      key: "data",
      title: "Guest data is kept",
      state: "done",
      detail:
        "Nothing is scrubbed unless you run it by hand. Closed events are archived a month after they end.",
      action: (
        <a href="#guest-data" className="btn btn-secondary btn-xs">
          Change
        </a>
      ),
    });

  const done = steps.filter((x) => x.state === "done").length;

  return (
    <FigurePanel className="p-0">
      <div className="px-4 pt-4">
        <CardLabel
          right={
            <span className="text-ink-3 font-mono text-[11px] tabular-nums">
              {done} of {steps.length} done
            </span>
          }
        >
          After the event
        </CardLabel>
        <ProgressBar
          value={done}
          max={steps.length}
          tone={done === steps.length ? "admit" : "accent"}
          height={6}
          className="mt-2.5"
          label={`${done} of ${steps.length} closeout steps done`}
        />
      </div>
      <ol className="mt-3">
        {steps.map((st, i) => (
          <li
            key={st.key}
            className="border-line-soft grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-t px-4 py-3 sm:grid-cols-[28px_minmax(0,1fr)_auto] sm:items-center"
          >
            <Marker state={st.state} n={i + 1} />
            <div className="min-w-0">
              <p className="text-ink m-0 flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                {st.title}
                <span
                  className={cn(
                    "text-[11.5px] font-normal",
                    st.state === "attention" ? "text-caution" : "sr-only",
                  )}
                >
                  {STATE_WORD[st.state]}
                </span>
              </p>
              <p className="text-ink-3 m-0 mt-0.5 text-[12.5px] leading-[1.5]">
                {st.detail}
              </p>
            </div>
            {st.action ? (
              <div className="col-start-2 sm:col-start-auto">{st.action}</div>
            ) : null}
          </li>
        ))}
      </ol>
    </FigurePanel>
  );
}

// ─── The page ────────────────────────────────────────────────────────────

/** Closing the event: what is left to do, the night in figures, its status, the report, and the guest data. */
export function CloseoutPage({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const settings = useCloseoutSettings(eventId);
  const figures = useFigures(eventId);
  const finance = useFinance({ kind: "event", eventId }, {});
  const certs = useCertificateSummary(eventId);
  const [now] = React.useState(() => Date.now());
  const s = settings.data;
  const f = figures.data;
  const fin = finance.data?.figures;
  const sent = certs.data?.channels.find((c) => c.channel === "email")?.sent;
  const ended = s ? now >= new Date(s.ends_at).getTime() : false;
  const statusLabel = s
    ? (s.statuses.find((o) => o.key === s.status)?.label ?? s.status)
    : null;
  const base = `/events/${eventId}`;

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">
            Closeout
          </h2>
          <p className="text-ink-2 mt-1 text-[13px]">
            {s
              ? `${statusLabel} · ${ended ? "ended" : "ends"} ${formatDateTime(s.ends_at)}${s.status_clock ? " · on the clock" : " · moved by hand"}`
              : "What is left after the event, the report that sums it up, and what happens to the guest data."}
          </p>
        </div>
      </header>

      {settings.isError ? (
        <EmptyState
          tone="muted"
          title="Could not load the closeout"
          description={settings.error.message}
          action={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void settings.refetch()}
            >
              Try again
            </button>
          }
        />
      ) : !s ? (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[120px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-[360px] rounded-2xl" />
        </>
      ) : (
        <>
          {f ? (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Turnout"
                value={`${f.turnout_pct}%`}
                note={`${formatNumber(f.checked_in)} of ${formatNumber(f.registered)} checked in · ${formatNumber(f.no_shows)} no-shows`}
                scale="hero"
              />
              <StatTile
                label="Certificates"
                value={formatNumber(f.certificates_issued)}
                note={`${sent !== undefined ? `${formatNumber(sent)} sent · ` : ""}${formatNumber(f.cards_printed)} ${plural(f.cards_printed, "card")} printed`}
                action={{ label: "Open certificates", href: `${base}/certificates` }}
                linkAs={Link}
              />
              <StatTile
                label="Rating"
                value={f.rating_count ? f.rating_avg.toFixed(1) : "—"}
                note={
                  f.rating_count
                    ? `from ${formatNumber(f.rating_count)} ${plural(f.rating_count, "rating")}`
                    : "no ratings yet"
                }
              />
              <StatTile
                label="Net"
                value={fin ? rupees(fin.net) : "—"}
                note={
                  fin
                    ? `${rupees(fin.gross)} in · ${rupees(fin.expenses)} out${fin.outstanding ? ` · ${rupees(fin.outstanding)} owed` : ""}`
                    : finance.isError
                      ? "could not read the ledger"
                      : "reading the ledger…"
                }
                action={{ label: "Open finance", href: `${base}/finance` }}
                linkAs={Link}
              />
            </div>
          ) : figures.isError ? (
            <Notice
              tone="refuse"
              tag="Figures"
              action={
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void figures.refetch()}
                >
                  Try again
                </button>
              }
            >
              Could not read the event&apos;s figures: {figures.error.message}
            </Notice>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[120px] rounded-2xl" />
              ))}
            </div>
          )}

          <Checklist eventId={eventId} s={s} f={f} now={now} />

          {f ? <FiguresPanel f={f} /> : null}

          {/* Confirm each registration: who asked and what came of it, as the report says. */}
          {f && hasRequestFigures(f.requests) ? (
            <RequestFunnelCard
              requests={f.requests}
              title="Requests"
              paidEvent={event.data?.has_fee ? true : undefined}
              pageViews={event.data?.page_views}
              requestsHref={`${base}/requests`}
            />
          ) : null}

          <div className="grid items-start gap-3.5 lg:grid-cols-[1.4fr_1fr]">
            <StatusPanel eventId={eventId} s={s} />
            <ReportsPanel eventId={eventId} />
          </div>

          <RetentionPanel
            eventId={eventId}
            slug={event.data?.slug ?? ""}
            s={s}
          />
        </>
      )}
    </div>
  );
}
