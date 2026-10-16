"use client";

import * as React from "react";
import { formatDateTime } from "@moa/app-kit";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  StatusBadge,
  toast,
} from "@moa/ui";

import { type DeliveryBrief, verdictOf } from "@/features/deliveries";

import { useRegistration } from "../queries";
import type { EventField, RegistrationDetail } from "../schemas";

/** A value shown in full, with a copy button -- names and addresses are cut short in the list, never here. */
function Copyable({
  value,
  mono,
}: {
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex items-start gap-2">
      <span
        className={
          mono
            ? "min-w-0 flex-1 font-mono text-xs break-all"
            : "min-w-0 flex-1 break-words"
        }
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          toast("Copied");
        }}
        className="text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]"
        aria-label={`Copy ${value}`}
      >
        COPY
      </button>
    </span>
  );
}

function Rows({ rows }: { rows: { k: string; v: React.ReactNode }[] }) {
  return (
    <dl className="m-0">
      {rows.map((r) => (
        <div key={r.k} className="flex gap-3 border-t py-1.5 first:border-t-0">
          <dt className="text-muted-foreground w-24 shrink-0 font-mono text-[11px] uppercase tracking-[0.05em] leading-relaxed">
            {r.k}
          </dt>
          <dd className="m-0 min-w-0 flex-1 text-sm">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-muted/40 rounded-md border px-3.5 py-3">
      <h3 className="text-muted-foreground mb-2 font-mono text-[10px] uppercase tracking-[0.08em]">
        {title}
      </h3>
      {children}
    </section>
  );
}

const sendLine = (d: DeliveryBrief) => {
  const v = verdictOf(d);
  const when = d.sent_at ? ` · ${formatDateTime(d.sent_at)}` : "";
  const why = d.reason ?? d.error;
  if (d.status === "sent" && !d.outcome)
    return `sent${when} — waiting to hear it arrived`;
  if (d.status === "failed")
    return `failed after ${d.attempts} ${d.attempts === 1 ? "try" : "tries"}${why ? ` — ${why}` : ""}`;
  if (d.status === "skipped") return `skipped — ${why ?? "no address"}`;
  return `${v.label.toLowerCase()}${when}${why && d.outcome && d.outcome !== "delivered" && d.outcome !== "read" ? ` — ${why}` : ""}`;
};

/**
 * One guest in full. The list shows a row; this shows everything on their
 * record and everything that happened to them, with the actions in one place.
 */
export function AttendeeDetailDialog({
  eventId,
  registrationId,
  fields,
  open,
  onOpenChange,
  onEdit,
  onRemove,
}: {
  eventId: number;
  registrationId: string | null;
  fields: EventField[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (a: RegistrationDetail) => void;
  onRemove: (a: RegistrationDetail) => void;
}) {
  const detail = useRegistration(eventId, open ? registrationId : null);
  const a = detail.data;
  const answers = (a?.additional_details ?? {}) as Record<string, unknown>;
  const ticketSends = a?.ticket_deliveries ?? [];
  const certSends = a?.certificate_deliveries ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{a?.full_name ?? a?.name ?? "Guest"}</DialogTitle>
          <DialogDescription>
            {a
              ? `On the list since ${formatDateTime(a.created_at)}`
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>
        {!a ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge
                tone="default"
                label={a.role.charAt(0).toUpperCase() + a.role.slice(1)}
              />
              {a.is_attended ? (
                <StatusBadge tone="success" label="Checked in" />
              ) : (
                <StatusBadge tone="default" label="Not yet in" />
              )}
              {a.ticket_revoked_at ? (
                <StatusBadge tone="destructive" label="Ticket revoked" />
              ) : (
                <StatusBadge
                  tone="info"
                  label={`Ticket ${a.ticket_id ?? ""}`}
                />
              )}
              {a.certificate_revoked_at ? (
                <StatusBadge tone="destructive" label="Certificate revoked" />
              ) : a.certificate_issued_at ? (
                <StatusBadge tone="success" label="Certificate issued" />
              ) : null}
            </div>

            <Section title="Contact">
              <Rows
                rows={[
                  { k: "Name", v: <Copyable value={a.full_name ?? a.name} /> },
                  { k: "Email", v: <Copyable value={a.email} mono /> },
                  { k: "Phone", v: <Copyable value={a.phone} mono /> },
                  {
                    k: "Institution",
                    v: a.institution ?? (
                      <span className="text-muted-foreground">—</span>
                    ),
                  },
                ]}
              />
            </Section>

            {fields.length || Object.keys(answers).length ? (
              <Section title="Answers">
                <Rows
                  rows={[
                    ...fields.map((f) => ({
                      k: f.label ?? f.key,
                      v: answers[f.key] ? (
                        String(answers[f.key])
                      ) : (
                        <span className="text-muted-foreground">
                          not answered
                        </span>
                      ),
                    })),
                    ...Object.entries(answers)
                      .filter(([k]) => !fields.some((f) => f.key === k))
                      .map(([k, v]) => ({ k, v: String(v) })),
                  ]}
                />
              </Section>
            ) : null}

            <Section title="Ticket and delivery">
              <Rows
                rows={[
                  { k: "Ticket", v: <Copyable value={a.ticket_id} mono /> },
                  {
                    k: "Status",
                    v: a.ticket_revoked_at
                      ? `Revoked ${formatDateTime(a.ticket_revoked_at)} — check-in refuses it`
                      : "Issued",
                  },
                  {
                    k: "Sent",
                    v: ticketSends.length ? (
                      <span className="flex flex-col gap-1">
                        {ticketSends.map((d) => (
                          <span
                            key={d.channel}
                            className="flex flex-wrap items-center gap-1.5"
                          >
                            <StatusBadge
                              tone={verdictOf(d).tone}
                              label={
                                d.channel === "email" ? "Email" : d.channel
                              }
                            />
                            <span className="text-muted-foreground text-xs">
                              {sendLine(d)}
                            </span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        not sent yet
                      </span>
                    ),
                  },
                ]}
              />
            </Section>

            <Section title="Certificate">
              <Rows
                rows={[
                  {
                    k: "Status",
                    v: a.certificate_revoked_at
                      ? `Revoked ${formatDateTime(a.certificate_revoked_at)}`
                      : a.certificate_issued_at
                        ? `Issued ${formatDateTime(a.certificate_issued_at)}`
                        : a.is_attended
                          ? "Not issued — downloads as an attended guest"
                          : "Not issued",
                  },
                  {
                    k: "Sent",
                    v: certSends.length ? (
                      <span className="flex flex-col gap-1">
                        {certSends.map((d) => (
                          <span
                            key={d.channel}
                            className="flex flex-wrap items-center gap-1.5"
                          >
                            <StatusBadge
                              tone={verdictOf(d).tone}
                              label={
                                d.channel === "email" ? "Email" : d.channel
                              }
                            />
                            <span className="text-muted-foreground text-xs">
                              {sendLine(d)}
                            </span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">not sent</span>
                    ),
                  },
                ]}
              />
            </Section>

            <Section title="At the event">
              <Rows
                rows={[
                  {
                    k: "Check-in",
                    v: a.is_attended
                      ? a.attended_on
                        ? formatDateTime(a.attended_on)
                        : "Checked in"
                      : "Not checked in",
                  },
                  { k: "Registered", v: formatDateTime(a.created_at) },
                  {
                    k: "Updated",
                    v: a.updated_at ? formatDateTime(a.updated_at) : "—",
                  },
                ]}
              />
            </Section>

            <div className="flex flex-wrap gap-1.5 border-t pt-3">
              <Button size="sm" onClick={() => onEdit(a)}>
                Correct details
              </Button>
              <span className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(a)}
              >
                Remove from the list
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
