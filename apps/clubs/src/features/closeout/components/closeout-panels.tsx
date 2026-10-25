"use client";

import { DownloadIcon, FileTextIcon, LockIcon } from "lucide-react";
import { formatDateTime, formatNumber } from "@moa/app-kit";
import {
  CardLabel,
  ChoiceCard,
  EmptyState,
  FigurePanel,
  IconButton,
  Notice,
  ProgressBar,
  Skeleton,
  Switch,
} from "@moa/ui";

import { openPdf } from "@/features/idcards";
import { LockBadge, useFeatureGate } from "@/features/plan";

import { reportPdfUrl } from "../api";
import {
  useGenerateReport,
  useReports,
  useUpdateCloseoutSettings,
} from "../queries";
import type { CloseoutSettings, Figures } from "../schemas";

// ─── Status ──────────────────────────────────────────────────────────────

/** Where the event is in its life, by the clock or by hand. */
export function StatusPanel({
  eventId,
  s,
}: {
  eventId: number;
  s: CloseoutSettings;
}) {
  const update = useUpdateCloseoutSettings(eventId);
  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          <label className="text-ink-2 flex items-center gap-2 text-[12.5px]">
            <Switch
              checked={s.status_clock}
              onCheckedChange={(on) => update.mutate({ status_clock: on })}
              disabled={update.isPending}
              aria-label="Status clock"
            />
            On the clock
          </label>
        }
      >
        Status
      </CardLabel>
      <p className="text-ink-3 mt-1 text-[12.5px] leading-[1.5]">
        The clock moves an event on its own: published → live at the start,
        closed after the end, archived once retention has run. Moving it by
        hand takes it off the clock.
      </p>
      <div
        className="mt-3 grid gap-2 sm:grid-cols-2"
        role="radiogroup"
        aria-label="Status"
      >
        {/* Cancelled is reached only by cancelling the event, and is final. */}
        {s.statuses.filter((o) => o.key !== "cancelled").map((o) => (
          <ChoiceCard
            key={o.key}
            checked={s.status === o.key}
            disabled={s.status === "cancelled"}
            onClick={() => update.mutate({ status: o.key })}
            title={o.label}
            hint={o.note}
            tone={o.key === "draft" ? "caution" : "brand"}
          />
        ))}
      </div>
      {s.status === "closed" || s.status === "archived" ? (
        <Notice tone="neutral" tag="Locked" className="mt-3">
          The event&apos;s details, fields and designs are read-only while it
          is {s.status}. Move it back to Live to change them.
        </Notice>
      ) : null}
      {s.status === "cancelled" ? (
        <Notice tone="refuse" tag="Cancelled" className="mt-3">
          This event was cancelled. Its status stays cancelled: registrations are closed and the details are
          read-only.
        </Notice>
      ) : null}
      {s.status === "draft" ? (
        <Notice tone="caution" tag="Draft" className="mt-3">
          A draft refuses check-ins: nobody can be admitted and no timed email
          goes out until it is published.
        </Notice>
      ) : null}
    </FigurePanel>
  );
}

// ─── Reports ─────────────────────────────────────────────────────────────

/** Every closeout report made, newest first, and making another. */
export function ReportsPanel({ eventId }: { eventId: number }) {
  const reports = useReports(eventId);
  const generate = useGenerateReport(eventId);
  // Reports already made stay downloadable; making one is the plan's `report`.
  const gate = useFeatureGate("report", { eventId });
  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <CardLabel right={<LockBadge lock={gate.lock} />}>Closeout reports</CardLabel>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={generate.isPending}
          onClick={gate.guard(() => generate.mutate())}
        >
          {gate.locked ? <LockIcon /> : <FileTextIcon />} {generate.isPending ? "Generating…" : "Generate now"}
        </button>
      </div>
      <p className="text-ink-3 px-4 pt-1 pb-3 text-[12.5px] leading-[1.5]">
        Attendance, roles, ways in, merchandise, messages, certificates and
        ratings, as of the moment it is generated. Kept here; retention emails
        the latest one to the recipients.
      </p>
      {reports.isPending ? (
        <Skeleton className="mx-4 mb-4 h-16 rounded-xl" />
      ) : reports.isError ? (
        <p className="text-ink-3 border-line-soft border-t px-4 py-4 text-[12.5px]">
          Could not load the reports. Reload to try again.
        </p>
      ) : reports.data.length ? (
        <ul>
          {reports.data.map((r) => (
            <li
              key={r.id}
              className="border-line-soft flex items-center gap-3 border-t px-4 py-2.5"
            >
              <span className="bg-sunken text-ink-2 grid size-9 shrink-0 place-items-center rounded-xl">
                <FileTextIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-ink truncate font-mono text-[12px]">
                  {r.filename}
                </div>
                <div className="text-ink-3 truncate text-[11.5px]">
                  {formatDateTime(r.generated_at)} ·{" "}
                  {r.generated_by_name ?? "Retention"}
                  {r.delivered_to.length
                    ? ` · sent to ${r.delivered_to.join(", ")}`
                    : ""}
                </div>
              </div>
              <IconButton
                label={`Download ${r.filename}`}
                onClick={() => openPdf(reportPdfUrl(eventId, r.id))}
              >
                <DownloadIcon />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          size="sm"
          icon={<FileTextIcon />}
          title="No report yet"
          description="Generate one any time; the figures are read live from the same tables as the door."
          className="border-line-soft border-t"
        />
      )}
    </FigurePanel>
  );
}

// ─── The event in figures ────────────────────────────────────────────────

function Bars({
  rows,
  empty,
  tone,
}: {
  rows: { key: string; label: string; value: number; max: number; note: string }[];
  empty: string;
  tone: "admit" | "accent" | "caution";
}) {
  if (!rows.length)
    return <p className="text-ink-3 mt-3 text-[12.5px]">{empty}</p>;
  return (
    <ul className="mt-3 grid gap-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
            <span className="text-ink truncate">{r.label}</span>
            <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
              {r.note}
            </span>
          </div>
          <ProgressBar
            value={r.value}
            max={r.max}
            tone={tone}
            height={6}
            className="mt-1"
            label={`${r.label}: ${r.note}`}
          />
        </li>
      ))}
    </ul>
  );
}

/** What the report will say, read before it is made: who came, how, and what went out. */
export function FiguresPanel({ f }: { f: Figures }) {
  const viaMax = Math.max(1, ...f.by_via.map((v) => v.count));
  const sent = f.messages.reduce((n, m) => n + m.sent, 0);
  const failed = f.messages.reduce((n, m) => n + m.failed, 0);
  return (
    <div className="grid gap-3.5 lg:grid-cols-3">
      <FigurePanel className="p-4">
        <CardLabel>Who came</CardLabel>
        <Bars
          tone="admit"
          empty="Nobody registered."
          rows={f.by_role.map((r) => ({
            key: r.role,
            label: r.label,
            value: r.checked_in,
            max: Math.max(1, r.registered),
            note: `${formatNumber(r.checked_in)} of ${formatNumber(r.registered)}`,
          }))}
        />
      </FigurePanel>
      <FigurePanel className="p-4">
        <CardLabel
          right={
            f.walk_ins ? (
              <span className="text-ink-3 text-[11px]">
                {formatNumber(f.walk_ins)} registered at the door
              </span>
            ) : null
          }
        >
          How they came in
        </CardLabel>
        <Bars
          tone="accent"
          empty="Nobody has been checked in."
          rows={f.by_via.map((v) => ({
            key: v.via,
            label: v.label,
            value: v.count,
            max: viaMax,
            note: formatNumber(v.count),
          }))}
        />
      </FigurePanel>
      <FigurePanel className="p-4">
        <CardLabel>Handed out and sent</CardLabel>
        <Bars
          tone="accent"
          empty="No merchandise to hand out."
          rows={f.merch.map((m) => ({
            key: m.name,
            label: m.name,
            value: m.collected,
            max: Math.max(1, m.total),
            note: `${formatNumber(m.collected)} of ${formatNumber(m.total)} collected`,
          }))}
        />
        <dl className="border-line-soft m-0 mt-3 grid grid-cols-3 gap-2 border-t pt-3">
          {[
            { k: "Cards", v: formatNumber(f.cards_printed) },
            { k: "Messages", v: formatNumber(f.messages.length) },
            {
              k: "Sent",
              v: failed
                ? `${formatNumber(sent)} · ${formatNumber(failed)} failed`
                : formatNumber(sent),
            },
          ].map((x) => (
            <div key={x.k} className="min-w-0">
              <dt className="eyebrow">{x.k}</dt>
              <dd className="text-ink m-0 mt-1 truncate font-mono text-[13px] tabular-nums">
                {x.v}
              </dd>
            </div>
          ))}
        </dl>
      </FigurePanel>
    </div>
  );
}
