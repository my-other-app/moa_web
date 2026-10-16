"use client";

import * as React from "react";
import Link from "next/link";
import { AwardIcon, Loader2Icon, PaletteIcon } from "lucide-react";
import { formatDateTime, formatNumber } from "@moa/app-kit";
import {
  CardLabel,
  Chip,
  ChoiceCard,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@moa/ui";

import { verdictOf, type CertificateSummary } from "@/features/deliveries";
import { useSendDocuments } from "@/features/deliveries/queries";

import {
  useCertificateSummary,
  useCertificates,
  useIssueCertificates,
  useIssuePreview,
} from "../queries";
import {
  CERTIFICATE_AUDIENCES,
  type CertificateAudience,
  type CertificateRow,
  type IssuePreview,
} from "../schemas";
import { CertificateActions } from "./certificate-actions";
import { CertificateSending } from "./certificate-sending";

/**
 * Certificates, after the event, in the order the work goes: who earns
 * one, issue them, send them, then each one with its number, where it
 * landed, and a way to open, resend or take it back. One line and four
 * figures first; what needs a look said once. Issuing is idempotent — a
 * guest never gets two — and a design change marks the ones issued with an
 * older design, which issuing again brings up to date.
 */
const ROLES = [
  { value: "attendee", label: "Attendees" },
  { value: "speaker", label: "Speakers" },
  { value: "staff", label: "Staff" },
] as const;

const plural = (n: number, one: string, many = `${one}s`) =>
  n === 1 ? one : many;

type Email = CertificateSummary["channels"][number];
const NO_EMAIL: Email = {
  channel: "email",
  sent: 0,
  failed: 0,
  skipped: 0,
  pending: 0,
  unsent: 0,
};

// ─── Who earns one ───────────────────────────────────────────────────────

function IssuePanel({
  audience,
  onAudience,
  roles,
  onRoles,
  preview,
  previewPending,
  issuing,
  onIssue,
  primary,
}: {
  audience: CertificateAudience;
  onAudience: (a: CertificateAudience) => void;
  roles: string[];
  onRoles: (r: string[]) => void;
  preview: IssuePreview | undefined;
  previewPending: boolean;
  issuing: boolean;
  onIssue: () => void;
  primary: boolean;
}) {
  const p = preview;
  const nothing = !p || (p.to_issue === 0 && p.outdated === 0);
  const pickRoles = audience === "roles" && roles.length === 0;
  const figures: { k: string; v: number | undefined; tone?: string }[] = [
    { k: "Eligible", v: p?.eligible },
    { k: "Have one", v: p?.already_issued },
    { k: "To issue", v: p?.to_issue, tone: "text-brand" },
    { k: "Outdated", v: p?.outdated, tone: p?.outdated ? "text-caution" : undefined },
  ];
  return (
    <FigurePanel className="flex flex-col p-4">
      <CardLabel>Who earns one</CardLabel>
      <p className="text-ink-3 mt-1 text-[12.5px] leading-[1.5]">
        Each guest gets one certificate with its own number, drawn from the
        current design. Issuing again after a design change refreshes the ones
        made with an older design; nobody is ever issued twice.
      </p>
      <div
        className="mt-3 grid gap-2 md:grid-cols-3"
        role="radiogroup"
        aria-label="Who receives a certificate"
      >
        {CERTIFICATE_AUDIENCES.map((a) => (
          <ChoiceCard
            key={a.value}
            checked={audience === a.value}
            onClick={() => onAudience(a.value)}
            title={a.label}
            hint={a.note}
          />
        ))}
      </div>
      {audience === "roles" ? (
        <div
          className="mt-2.5 flex flex-wrap gap-1.5"
          role="group"
          aria-label="Roles"
        >
          {ROLES.map((r) => {
            const on = roles.includes(r.value);
            return (
              <Chip
                key={r.value}
                active={on}
                onClick={() =>
                  onRoles(
                    on ? roles.filter((x) => x !== r.value) : [...roles, r.value],
                  )
                }
              >
                {r.label}
              </Chip>
            );
          })}
        </div>
      ) : null}

      <div className="border-line-soft mt-auto flex flex-wrap items-end gap-x-6 gap-y-3 border-t pt-3">
        {pickRoles ? (
          <p className="text-ink-3 text-[12.5px]">
            Pick at least one role to see who that is.
          </p>
        ) : (
          <dl className="m-0 flex flex-wrap gap-x-6 gap-y-2" aria-busy={previewPending}>
            {figures.map((f) => (
              <div key={f.k}>
                <dt className="eyebrow">{f.k}</dt>
                <dd
                  className={cn(
                    "m-0 mt-1 font-mono text-[18px] leading-none tabular-nums",
                    f.tone ?? "text-ink",
                  )}
                >
                  {f.v === undefined ? "—" : formatNumber(f.v)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <button
          type="button"
          className={cn("btn ml-auto", primary ? "btn-primary" : "btn-secondary")}
          disabled={issuing || nothing}
          onClick={onIssue}
        >
          {issuing ? <Loader2Icon className="animate-spin" /> : <AwardIcon />}
          {p?.to_issue
            ? `Issue ${formatNumber(p.to_issue)} ${plural(p.to_issue, "certificate")}`
            : p?.outdated
              ? `Refresh ${formatNumber(p.outdated)} with the current design`
              : p
                ? "Everyone eligible has one"
                : "Issue certificates"}
        </button>
      </div>
    </FigurePanel>
  );
}

// ─── Every certificate ───────────────────────────────────────────────────

const COLS =
  "sm:grid-cols-[118px_minmax(0,1.7fr)_88px_minmax(0,1.2fr)_118px_76px]";

function Delivery({ row }: { row: CertificateRow }) {
  const d = row.deliveries.find((x) => x.channel === "email");
  if (!d) return <span className="text-ink-3 text-[12px]">Not sent</span>;
  const v = verdictOf(d);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-full">
          <StatusBadge tone={v.tone} label={v.label} />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {v.label}
        {d.reason || d.error ? ` — ${d.reason ?? d.error}` : ""}
        {d.sent_at ? ` · ${formatDateTime(d.sent_at)}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}

function CertificateLine({
  eventId,
  row,
  current,
}: {
  eventId: number;
  row: CertificateRow;
  current: number;
}) {
  const revoked = row.status === "revoked";
  const older = !revoked && current > 0 && row.design_version < current;
  return (
    <li
      className={cn(
        "border-line-soft grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t px-4 py-2.5 text-[12.5px]",
        COLS,
      )}
    >
      <span className="text-ink-2 hidden font-mono text-[11.5px] sm:block">
        {row.number}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate text-[13.5px] font-medium",
            revoked ? "text-ink-3 line-through" : "text-ink",
          )}
        >
          {row.name}
        </span>
        <span className="text-ink-3 block truncate text-[11.5px]">
          <span className="font-mono sm:hidden">{row.number} · </span>
          {row.email ?? "no email"}
        </span>
      </span>
      <span className="text-ink-2 hidden capitalize sm:block">{row.role}</span>
      <span className="hidden flex-wrap items-center gap-1 sm:flex">
        {revoked ? (
          <StatusBadge tone="destructive" label="Revoked" />
        ) : (
          <Delivery row={row} />
        )}
        {older ? (
          <StatusBadge tone="warning" label={`Design v${row.design_version}`} />
        ) : null}
      </span>
      <span className="text-ink-3 hidden font-mono text-[11.5px] whitespace-nowrap tabular-nums sm:block">
        {row.issued_at ? formatDateTime(row.issued_at) : "—"}
      </span>
      <CertificateActions eventId={eventId} row={row} />
    </li>
  );
}

function ListPanel({
  eventId,
  s,
}: {
  eventId: number;
  s: CertificateSummary | undefined;
}) {
  const [status, setStatus] = React.useState<"issued" | "revoked" | undefined>(
    undefined,
  );
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const list = useCertificates({
    eventId,
    status,
    search: query.trim() || undefined,
    page,
    pageSize,
  });
  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = Boolean(query.trim() || status);
  const filters = [
    [undefined, "All"],
    ["issued", "Issued"],
    ["revoked", s?.revoked ? `Revoked ${s.revoked}` : "Revoked"],
  ] as const;

  return (
    <FigurePanel className="overflow-hidden p-0">
      <Toolbar>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Which certificates"
        >
          {filters.map(([value, label]) => (
            <Chip
              key={value ?? "all"}
              active={status === value}
              tone={value === "revoked" ? "refuse" : "accent"}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
        <ToolbarEnd>
          <SearchInput
            value={search}
            onChange={setSearch}
            onDebouncedChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            delayMs={300}
            placeholder="Name, email or number"
            aria-label="Search certificates"
            containerClassName="sm:w-60"
          />
        </ToolbarEnd>
      </Toolbar>

      {list.isPending ? (
        <div className="grid gap-2 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 rounded-xl" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState
          size="sm"
          title="Could not load the certificates"
          description={list.error.message}
          action={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void list.refetch()}
            >
              Try again
            </button>
          }
        />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState
            size="sm"
            title="Nobody matches"
            description="Try a shorter search, or clear the filter."
            action={
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSearch("");
                  setQuery("");
                  setStatus(undefined);
                  setPage(1);
                }}
              >
                Clear
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={<AwardIcon />}
            title="No certificates yet"
            description="Choose who earns one above and issue them. Each lands here with its number, ready to send, open or revoke."
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
            <span>Number</span>
            <span>Guest</span>
            <span>Role</span>
            <span>Delivery</span>
            <span>Issued</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul>
            {rows.map((r) => (
              <CertificateLine
                key={r.registration_id}
                eventId={eventId}
                row={r}
                current={s?.design_version ?? 0}
              />
            ))}
          </ul>
          <div className="border-line-soft border-t px-4 py-2.5">
            <Pager
              page={page}
              pageCount={pages}
              total={total}
              pageSize={pageSize}
              noun={["certificate", "certificates"]}
              busy={list.isFetching}
              onPage={setPage}
              onPageSize={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
          </div>
        </>
      )}
    </FigurePanel>
  );
}

// ─── The page ────────────────────────────────────────────────────────────

function Attention({
  eventId,
  s,
  email,
  audience,
  onRetry,
  retrying,
}: {
  eventId: number;
  s: CertificateSummary;
  email: Email;
  audience: CertificateAudience;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (s.registrations > 0 && s.attended === 0 && audience === "checked_in")
    return (
      <Notice
        tone="caution"
        tag="Attendance"
        action={
          <Link
            href={`/events/${eventId}/check-ins`}
            className="btn btn-secondary btn-sm"
          >
            Check-ins
          </Link>
        }
      >
        Nobody is marked present yet, so the usual rule issues nothing. Mark
        attendance first, or give one to everyone registered.
      </Notice>
    );
  if (email.failed > 0)
    return (
      <Notice
        tone="refuse"
        tag="Failed"
        action={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={retrying}
            onClick={onRetry}
          >
            Retry
          </button>
        }
      >
        {formatNumber(email.failed)}{" "}
        {plural(email.failed, "certificate")} could not be sent. The delivery
        log says why; retrying sends only those.
      </Notice>
    );
  if (s.outdated > 0)
    return (
      <Notice tone="caution" tag="Design">
        {formatNumber(s.outdated)} {plural(s.outdated, "was", "were")} issued
        with an older design. Issuing again brings{" "}
        {s.outdated === 1 ? "it" : "them"} onto v{s.design_version}; the
        numbers stay.
      </Notice>
    );
  return null;
}

/**
 * Certificates, after the event: who gets one, issue them, send them, and
 * see each one land.
 */
export function CertificatesPage({ eventId }: { eventId: number }) {
  const summary = useCertificateSummary(eventId);
  const [audience, setAudience] =
    React.useState<CertificateAudience>("checked_in");
  const [roles, setRoles] = React.useState<string[]>([]);
  const body = { audience, roles: audience === "roles" ? roles : [] };
  const preview = useIssuePreview(eventId, body);
  const issue = useIssueCertificates(eventId);
  const retry = useSendDocuments(eventId, "certificate");

  const s = summary.data;
  const p = preview.data;
  const email = s?.channels.find((c) => c.channel === "email") ?? NO_EMAIL;
  const toSend = email.unsent + email.failed + email.skipped;
  const toIssue = Boolean(p && (p.to_issue > 0 || p.outdated > 0));
  const designHref = `/events/${eventId}/design?kind=certificate`;

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">
            Certificates
          </h2>
          <p className="text-ink-2 mt-1 text-[13px]">
            {s
              ? `${formatNumber(s.issued)} issued · ${formatNumber(email.sent)} sent by email · ${formatNumber(s.attended)} of ${formatNumber(s.registrations)} attended`
              : "Who gets one, sending them, and taking one back. Each carries a number and a QR that says whether it is genuine."}
          </p>
        </div>
        <Link href={designHref} className="btn btn-secondary">
          <PaletteIcon /> Certificate design
        </Link>
      </header>

      {summary.isError ? (
        <EmptyState
          tone="muted"
          title="Could not load the certificates"
          description={summary.error.message}
          action={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void summary.refetch()}
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
          <div className="grid gap-3.5 lg:grid-cols-[1.6fr_1fr]">
            <Skeleton className="h-[240px] rounded-2xl" />
            <Skeleton className="h-[240px] rounded-2xl" />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Issued"
              value={formatNumber(s.issued)}
              note={`${formatNumber(s.attended)} of ${formatNumber(s.registrations)} attended${s.revoked ? ` · ${formatNumber(s.revoked)} revoked` : ""}`}
              scale="hero"
            />
            <StatTile
              label="Sent by email"
              value={formatNumber(email.sent)}
              note={`of ${formatNumber(s.issued)} issued${email.pending ? ` · ${formatNumber(email.pending)} sending` : ""}`}
            />
            <StatTile
              label="Still to send"
              value={formatNumber(toSend)}
              note={
                toSend
                  ? [
                      email.unsent ? `${formatNumber(email.unsent)} not sent` : "",
                      email.failed ? `${formatNumber(email.failed)} failed` : "",
                      email.skipped ? `${formatNumber(email.skipped)} no address` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : s.issued
                    ? "every certificate has gone out"
                    : "nothing issued yet"
              }
            />
            <StatTile
              label="Design"
              value={`v${s.design_version}`}
              note={
                s.outdated
                  ? `${formatNumber(s.outdated)} issued on an older one`
                  : "everyone on the current design"
              }
              action={{ label: "Open the designer", href: designHref }}
              linkAs={Link}
            />
          </div>

          <Attention
            eventId={eventId}
            s={s}
            email={email}
            audience={audience}
            onRetry={() => retry.mutate("failed")}
            retrying={retry.isPending}
          />

          <div className="grid items-stretch gap-3.5 lg:grid-cols-[1.6fr_1fr]">
            <IssuePanel
              audience={audience}
              onAudience={setAudience}
              roles={roles}
              onRoles={setRoles}
              preview={p}
              previewPending={preview.isFetching}
              issuing={issue.isPending}
              onIssue={() => issue.mutate(body)}
              primary={toIssue}
            />
            <CertificateSending
              eventId={eventId}
              primary={!toIssue && toSend > 0}
            />
          </div>

          <ListPanel eventId={eventId} s={s} />

          <p className="text-ink-3 text-[12px] leading-[1.5]">
            Every certificate carries a QR that says whether it is genuine and
            still valid — nothing more than the guest&apos;s name, the event
            and the date. Revoking one makes that answer no.
          </p>
        </>
      )}
    </div>
  );
}
