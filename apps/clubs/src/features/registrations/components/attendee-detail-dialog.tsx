"use client";

import * as React from "react";
import { CopyIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import {
  Button,
  CardLabel,
  DefinitionRows,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton,
  Skeleton,
  StatusBadge,
  toast,
} from "@moa/ui";

import { type DeliveryBrief, verdictOf, viaText } from "@/features/deliveries";
import { answerText } from "@/lib/answers";

import { useRegistration } from "../queries";
import type { EventField, RegistrationDetail } from "../schemas";

const none = (text = "—") => <span className="text-ink-3">{text}</span>;

/** A value shown in full, with a copy button — names and addresses are cut short in the list, never here. */
function Copyable({ value, mono }: { value: string | null | undefined; mono?: boolean }) {
  if (!value) return none();
  return (
    <span className="flex items-start gap-2">
      <span className={mono ? "min-w-0 flex-1 font-mono text-[12px] break-all" : "min-w-0 flex-1 break-words"}>{value}</span>
      <IconButton
        label={`Copy ${value}`}
        variant="quiet"
        size="xs"
        className="-my-1"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          toast("Copied");
        }}
      >
        <CopyIcon />
      </IconButton>
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line-soft rounded-xl border px-3.5 py-3">
      <CardLabel className="mb-1.5">{title}</CardLabel>
      {children}
    </section>
  );
}

const sendLine = (d: DeliveryBrief) => {
  const v = verdictOf(d);
  const when = d.sent_at ? ` · ${formatDateTime(d.sent_at)}` : "";
  const why = d.reason ?? d.error;
  if (d.status === "sent" && !d.outcome) return `sent${when} — waiting to hear it arrived`;
  if (d.status === "failed") return `failed after ${d.attempts} ${d.attempts === 1 ? "try" : "tries"}${why ? ` — ${why}` : ""}`;
  if (d.status === "skipped") return `skipped — ${why ?? "no address"}`;
  return `${v.label.toLowerCase()}${when}${why && d.outcome && d.outcome !== "delivered" && d.outcome !== "read" ? ` — ${why}` : ""}`;
};

function Sends({ sends, empty }: { sends: DeliveryBrief[]; empty: string }) {
  if (!sends.length) return none(empty);
  return (
    <span className="flex flex-col gap-1">
      {sends.map((d) => (
        <span key={d.channel} className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={verdictOf(d).tone} label={d.channel === "email" ? "Email" : d.channel} />
          <span className="text-ink-2 text-[12px]">{sendLine(d)}</span>
          {/* WhatsApp: the club's own number, or MyOtherApp's and why. */}
          {viaText(d) ? <span className={d.fallback_code || d.fallback_reason ? "text-caution text-[12px]" : "text-ink-3 text-[12px]"}>{viaText(d)}</span> : null}
        </span>
      ))}
    </span>
  );
}

/**
 * One guest in full. The list shows a row; this shows everything on their
 * record and everything that happened to them, with the two things to do
 * about it — correct them, or take them off the list — in one place.
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{a?.full_name ?? a?.name ?? "Guest"}</DialogTitle>
          <DialogDescription>{a ? `On the list since ${formatDateTime(a.created_at)}` : detail.isError ? "This guest could not be loaded." : "Loading…"}</DialogDescription>
        </DialogHeader>
        {detail.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-ink-2 text-[12.5px]">They may have been removed from the list a moment ago.</p>
            <Button variant="secondary" size="sm" onClick={() => void detail.refetch()}>
              Try again
            </Button>
          </div>
        ) : !a ? (
          <div className="grid gap-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone="default" label={a.role.charAt(0).toUpperCase() + a.role.slice(1)} />
              {a.is_attended ? <StatusBadge tone="success" label="Checked in" /> : <StatusBadge tone="default" label="Not yet in" />}
              {a.ticket_revoked_at ? <StatusBadge tone="destructive" label="Ticket revoked" /> : <StatusBadge tone="info" label={`Ticket ${a.ticket_id ?? ""}`} />}
              {a.email_bounced_at ? <StatusBadge tone="destructive" label="Email bounced" /> : null}
              {a.certificate_revoked_at ? (
                <StatusBadge tone="destructive" label="Certificate revoked" />
              ) : a.certificate_issued_at ? (
                <StatusBadge tone="success" label="Certificate issued" />
              ) : null}
            </div>

            <Section title="Contact">
              <DefinitionRows
                rows={[
                  { k: "Name", v: <Copyable value={a.full_name ?? a.name} /> },
                  {
                    k: "Email",
                    v: (
                      <>
                        <Copyable value={a.email} mono />
                        {a.email_bounced_at ? <span className="text-refuse mt-0.5 block text-[11.5px]">Bounced{a.email_bounce_reason ? ` — ${a.email_bounce_reason}` : ""}. Correct it to send again.</span> : null}
                      </>
                    ),
                  },
                  { k: "Phone", v: <Copyable value={a.phone} mono /> },
                  { k: "Institution", v: a.institution ?? none() },
                ]}
              />
            </Section>

            {fields.length || Object.keys(answers).length ? (
              <Section title="Answers">
                <DefinitionRows
                  rows={[
                    ...fields.map((f) => ({
                      k: f.label ?? f.key,
                      v: answerText(answers[f.key]) ? answerText(answers[f.key]) : none("not answered"),
                    })),
                    ...Object.entries(answers)
                      .filter(([k]) => !fields.some((f) => f.key === k))
                      .map(([k, v]) => ({ k, v: answerText(v) })),
                  ]}
                />
              </Section>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Section title="Ticket and delivery">
                <DefinitionRows
                  rows={[
                    { k: "Ticket", v: <Copyable value={a.ticket_id} mono /> },
                    {
                      k: "Status",
                      v: a.ticket_revoked_at ? <span className="text-refuse">Revoked {formatDateTime(a.ticket_revoked_at)} — check-in refuses it</span> : "Issued",
                    },
                    { k: "Sent", v: <Sends sends={a.ticket_deliveries} empty="not sent yet" /> },
                  ]}
                />
              </Section>

              <Section title="Certificate">
                <DefinitionRows
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
                    { k: "Sent", v: <Sends sends={a.certificate_deliveries} empty="not sent" /> },
                  ]}
                />
              </Section>
            </div>

            <Section title="At the event">
              <DefinitionRows
                rows={[
                  { k: "Check-in", v: a.is_attended ? (a.attended_on ? formatDateTime(a.attended_on) : "Checked in") : "Not checked in" },
                  { k: "Registered", v: formatDateTime(a.created_at) },
                  { k: "Updated", v: a.updated_at ? formatDateTime(a.updated_at) : none() },
                ]}
              />
            </Section>

            <div className="border-line-soft flex flex-wrap items-center gap-2 border-t pt-3">
              <Button size="sm" onClick={() => onEdit(a)}>
                <PencilIcon /> Correct details
              </Button>
              <span className="flex-1" />
              <Button size="sm" variant="ghost" danger onClick={() => onRemove(a)}>
                <Trash2Icon /> Remove from the list
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
