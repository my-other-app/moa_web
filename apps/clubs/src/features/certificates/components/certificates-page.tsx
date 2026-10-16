"use client";

import * as React from "react";
import Link from "next/link";
import { AwardIcon, Loader2Icon, PaletteIcon } from "lucide-react";
import { PageHeader, formatDateTime } from "@moa/app-kit";
import {
  Button,
  Chip,
  ChoiceCard,
  cn,
  EmptyState,
  Pager,
  Skeleton,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { DeliveryBar, verdictOf } from "@/features/deliveries";
import { useEventDetail } from "@/features/events";

import {
  useCertificateSummary,
  useCertificates,
  useIssueCertificates,
  useIssuePreview,
} from "../queries";
import { CERTIFICATE_AUDIENCES, type CertificateAudience } from "../schemas";
import { CertificateActions } from "./certificate-actions";

const ROLES = [
  { value: "attendee", label: "Attendees" },
  { value: "speaker", label: "Speakers" },
  { value: "staff", label: "Staff" },
] as const;

const CELL = "px-4 py-3 text-left align-middle";

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-border/70 shadow-sm px-4 py-3">
      <p className="text-muted-foreground font-mono text-[11px] uppercase tracking-[0.08em]">
        {label}
      </p>
      <p className="text-2xl font-medium tabular-nums">{value}</p>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </div>
  );
}

/**
 * Certificates, after the event: who gets one, issue them, send them, and
 * see each one land. Issuing is idempotent -- a guest never gets two -- and a
 * design change marks the ones issued with an older design.
 */
export function CertificatesPage({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const summary = useCertificateSummary(eventId);
  const [audience, setAudience] =
    React.useState<CertificateAudience>("checked_in");
  const [roles, setRoles] = React.useState<string[]>([]);
  const body = { audience, roles: audience === "roles" ? roles : [] };
  const preview = useIssuePreview(eventId, body);
  const issue = useIssueCertificates(eventId);

  const [status, setStatus] = React.useState<"issued" | "revoked" | undefined>(
    undefined,
  );
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const list = useCertificates({
    eventId,
    status,
    search: search.trim() || undefined,
    page,
    pageSize,
  });
  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const s = summary.data;
  const p = preview.data;
  const email = s?.channels.find((c) => c.channel === "email");
  const nothingToIssue = !p || (p.to_issue === 0 && p.outdated === 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificates"
        description="Who gets one, sending them, and taking one back. Each carries a number and a QR that says whether it is genuine."
        action={
          <Button variant="outline" asChild className={pressable}>
            <Link href={`/events/${eventId}/design`}>
              <PaletteIcon /> Certificate design
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Issued"
          value={s?.issued ?? "—"}
          note={s?.revoked ? `${s.revoked} revoked` : "certificates on record"}
        />
        <Tile
          label="Attended"
          value={s?.attended ?? "—"}
          note={`of ${s?.registrations ?? "—"} registered`}
        />
        <Tile
          label="Design"
          value={s ? `v${s.design_version}` : "—"}
          note={
            s?.outdated
              ? `${s.outdated} issued with an older design`
              : "everyone on the current design"
          }
        />
        <Tile
          label="Sent"
          value={email?.sent ?? "—"}
          note={`of ${s?.issued ?? "—"} issued`}
        />
      </div>

      <div className="rounded-2xl bg-card ring-1 ring-border/70 shadow-sm p-4">
        <p className="text-[15px] font-medium text-foreground">
          Issue certificates
        </p>
        <p className="text-muted-foreground mb-3 text-sm">
          Each guest gets one certificate with its own number, drawn from the
          current design. Issuing again after a design change refreshes the ones
          made with an older design; nobody is ever issued twice.
        </p>
        <div
          className="grid gap-2 md:grid-cols-3"
          role="radiogroup"
          aria-label="Who receives a certificate"
        >
          {CERTIFICATE_AUDIENCES.map((a) => (
            <ChoiceCard
              key={a.value}
              checked={audience === a.value}
              onClick={() => setAudience(a.value)}
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
                    setRoles((cur) =>
                      on ? cur.filter((x) => x !== r.value) : [...cur, r.value],
                    )
                  }
                >
                  {r.label.toUpperCase()}
                </Chip>
              );
            })}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            className={pressable}
            disabled={issue.isPending || nothingToIssue}
            onClick={() => issue.mutate(body)}
          >
            {issue.isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <AwardIcon />
            )}
            {p
              ? p.to_issue
                ? `Issue ${p.to_issue} ${p.to_issue === 1 ? "certificate" : "certificates"}`
                : p.outdated
                  ? `Refresh ${p.outdated} with the current design`
                  : "Issue certificates"
              : "Issue certificates"}
          </Button>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {p
              ? `${p.eligible} eligible · ${p.already_issued} already issued${p.outdated ? ` · ${p.outdated} outdated` : ""}`
              : audience === "roles" && !roles.length
                ? "pick at least one role"
                : "…"}
          </span>
        </div>
      </div>

      <DeliveryBar eventId={eventId} kind="certificate" />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email or number"
            aria-label="Search certificates"
            className="input w-64"
          />
          {(
            [
              [undefined, "All"],
              ["issued", "Issued"],
              ["revoked", "Revoked"],
            ] as const
          ).map(([value, label]) => (
            <Chip
              key={label}
              active={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {label}
            </Chip>
          ))}
        </div>

        {list.isPending ? (
          <Skeleton className="h-[320px] w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-card ring-1 ring-border/70 shadow-sm p-10">
            <EmptyState
              tone="muted"
              title={
                search || status ? "Nobody matches" : "No certificates yet"
              }
              description={
                search || status
                  ? "Try a shorter search, or clear the filter."
                  : "Choose who receives one above and issue them."
              }
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/70 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/60 text-[13px] font-medium text-muted-foreground">
                    <th scope="col" className={cn(CELL, "font-light")}>
                      Number
                    </th>
                    <th scope="col" className={cn(CELL, "font-light")}>
                      Guest
                    </th>
                    <th scope="col" className={cn(CELL, "font-light")}>
                      Role
                    </th>
                    <th scope="col" className={cn(CELL, "font-light")}>
                      Status
                    </th>
                    <th scope="col" className={cn(CELL, "font-light")}>
                      Delivery
                    </th>
                    <th scope="col" className={cn(CELL, "font-light")}>
                      Issued
                    </th>
                    <th
                      scope="col"
                      className={cn(CELL, "font-light text-right")}
                    >
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const d = r.deliveries.find((x) => x.channel === "email");
                    return (
                      <tr
                        key={r.registration_id}
                        className="border-t border-border/60 transition-colors hover:bg-muted/40"
                      >
                        <td className={cn(CELL, "font-mono text-xs")}>
                          {r.number}
                        </td>
                        <td className={CELL}>
                          <div className="text-foreground">{r.name}</div>
                          <div className="text-muted-foreground font-mono text-xs">
                            {r.email ?? "no email"}
                          </div>
                        </td>
                        <td className={cn(CELL, "capitalize")}>{r.role}</td>
                        <td className={CELL}>
                          <span className="flex flex-wrap items-center gap-1">
                            {r.status === "revoked" ? (
                              <StatusBadge tone="destructive" label="Revoked" />
                            ) : (
                              <StatusBadge tone="success" label="Issued" />
                            )}
                            {s &&
                            r.status === "issued" &&
                            r.design_version < s.design_version ? (
                              <StatusBadge
                                tone="warning"
                                label={`v${r.design_version}`}
                              />
                            ) : null}
                          </span>
                        </td>
                        <td className={CELL}>
                          {d ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <StatusBadge
                                    tone={verdictOf(d).tone}
                                    label={verdictOf(d).label}
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {verdictOf(d).label}
                                {d.reason || d.error
                                  ? ` — ${d.reason ?? d.error}`
                                  : ""}
                                {d.sent_at
                                  ? ` · ${formatDateTime(d.sent_at)}`
                                  : ""}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              not sent
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            CELL,
                            "text-muted-foreground font-mono text-xs whitespace-nowrap tabular-nums",
                          )}
                        >
                          {r.issued_at ? formatDateTime(r.issued_at) : "—"}
                        </td>
                        <td className={cn(CELL, "text-right")}>
                          <CertificateActions eventId={eventId} row={r} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!list.isPending && total > 0 ? (
          <Pager
            page={page}
            pageCount={pages}
            total={total}
            pageSize={pageSize}
            noun={["guest", "guests"]}
            busy={list.isFetching}
            onPage={setPage}
            onPageSize={(n) => (setPageSize(n), setPage(1))}
          />
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">
        Every certificate carries a QR that says whether it is genuine and still
        valid — nothing more than the guest&apos;s name, the event and the date.
        Revoking one makes that answer no.
      </p>
    </div>
  );
}
