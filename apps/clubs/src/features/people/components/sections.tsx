"use client";

import * as React from "react";
import { CopyIcon, ExternalLinkIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import { DefinitionRows, IconButton, StatusBadge, toast } from "@moa/ui";

import { answerParts } from "@/features/answers";
import { isMasked } from "@/lib/masked";

import type { GuestProfileData, ProfilePrint } from "../schemas";
import { PRINT_TONE, PRINT_WORDS, askedBy, channelWord, deliveryLine, deliveryTone, methodWord, whatWord } from "../words";

const none = (text = "—") => <span className="text-ink-3">{text}</span>;
const when = (at: string | null) => (at ? formatDateTime(at) : null);

/** A value in full with a copy button. One the server sent in part (door staff see contacts masked) is shown as it came, with nothing to copy. */
export function Copyable({ value, mono, label }: { value: string | null | undefined; mono?: boolean; label?: string }) {
  if (!value) return none();
  if (isMasked(value)) {
    return (
      <span className={mono ? "font-mono text-[12px] break-all" : "break-words"} title="Shown in part for your role">
        {value}
      </span>
    );
  }
  return (
    <span className="flex items-start gap-2">
      <span className={mono ? "min-w-0 flex-1 font-mono text-[12px] break-all" : "min-w-0 flex-1 break-words"}>{value}</span>
      <IconButton
        label={`Copy ${label ?? value}`}
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

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="border-line-soft rounded-xl border px-3.5 py-3">
      <h3 id={id} className="eyebrow m-0 mb-1.5">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function ContactSection({ p }: { p: GuestProfileData }) {
  const { person } = p;
  const account = person.account?.kind;
  return (
    <Section title="Contact">
      <DefinitionRows
        rows={[
          { k: "Name", v: <Copyable value={person.full_name} /> },
          { k: "Email", v: <Copyable value={person.email} mono /> },
          { k: "Phone", v: <Copyable value={person.phone} mono /> },
          { k: "Institution", v: person.institution ?? none() },
          ...(person.role ? [{ k: "Role", v: person.role.charAt(0).toUpperCase() + person.role.slice(1) }] : []),
          ...(account ? [{ k: "Account", v: account === "app" ? "Has the app" : account === "guest" ? "Registered as a guest" : "No account" }] : []),
        ]}
      />
      {p.status.email_bounced ? (
        <p className="text-refuse mt-2 mb-0 text-[12px]">Their email bounced{p.status.email_bounce_reason ? ` — ${p.status.email_bounce_reason}` : ""}. Correct it to send again.</p>
      ) : null}
    </Section>
  );
}

export function AnswersSection({ p }: { p: GuestProfileData }) {
  const missing = p.answers.filter((a) => a.missing).length;
  return (
    <Section title="Answers">
      {p.answers.length === 0 ? (
        none("No answers on this registration.")
      ) : (
        <>
          {missing ? (
            <p className="text-caution mt-0 mb-2 text-[12.5px]">
              {missing === 1 ? "1 answer is" : `${missing} answers are`} missing.
            </p>
          ) : null}
          <dl className="divide-line-soft m-0 divide-y">
            {p.answers.map((a) => {
              const parts = answerParts(a.value);
              return (
                <div key={a.key} className="grid gap-1 py-2 first:pt-0 last:pb-0">
                  <dt className="text-ink-2 text-[12.5px] leading-[1.45] [overflow-wrap:anywhere]">{a.label || a.key.replace(/_/g, " ")}</dt>
                  <dd className="text-ink m-0 text-[13.5px] leading-[1.5] [overflow-wrap:anywhere]">
                    {a.missing || parts.length === 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <StatusBadge tone="warning" label="Missing" />
                        <span className="text-ink-3">not answered</span>
                      </span>
                    ) : (
                      <span className="whitespace-pre-line">{parts.join(", ")}</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </>
      )}
    </Section>
  );
}

function Sends({ rows, empty }: { rows: GuestProfileData["deliveries"]; empty: string }) {
  if (!rows.length) return none(empty);
  return (
    <span className="flex flex-col gap-1">
      {rows.map((d, i) => (
        <span key={`${d.what}-${d.channel}-${d.at}-${i}`} className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={deliveryTone(d)} label={channelWord(d.channel)} />
          <span className="text-ink-2 text-[12px]">
            {whatWord(d.what)}: {deliveryLine(d).toLowerCase()}
            {d.at ? <span className="text-ink-3"> · {formatDateTime(d.at)}</span> : null}
          </span>
        </span>
      ))}
    </span>
  );
}

export function TicketSection({ p }: { p: GuestProfileData }) {
  const t = p.ticket;
  const sends = p.deliveries.filter((d) => d.what !== "certificate");
  return (
    <Section title="Ticket and delivery">
      {t ? (
        <DefinitionRows
          rows={[
            { k: "Ticket", v: <Copyable value={t.code} mono /> },
            { k: "Type", v: t.type_name ?? none() },
            ...(t.admission_no ? [{ k: "Admission", v: <Copyable value={t.admission_no} mono /> }] : []),
            {
              k: "Status",
              v: t.revoked_at ? <span className="text-refuse">Revoked {when(t.revoked_at)} — check-in refuses it</span> : t.issued_at ? `Issued ${when(t.issued_at)}` : "Issued",
            },
            {
              k: "PDF",
              v: t.pdf_url ? (
                <a href={t.pdf_url} target="_blank" rel="noopener noreferrer" className="text-brand inline-flex items-center gap-1 underline">
                  Open the ticket PDF <ExternalLinkIcon className="size-3" aria-hidden="true" />
                </a>
              ) : (
                none("not made yet")
              ),
            },
            { k: "Sent", v: <Sends rows={sends} empty="not sent yet" /> },
          ]}
        />
      ) : (
        <>
          <p className="text-ink-2 m-0 text-[12.5px]">No ticket yet.</p>
          {sends.length ? <div className="mt-2"><Sends rows={sends} empty="" /></div> : null}
        </>
      )}
    </Section>
  );
}

export function PaymentSection({ p }: { p: GuestProfileData }) {
  const pay = p.payment;
  if (!pay) {
    return (
      <Section title="Payment">
        {none(p.status.paid === false ? "Not paid yet." : "No payment on this registration.")}
      </Section>
    );
  }
  const money = pay.amount === null ? null : `${pay.currency && pay.currency !== "INR" ? `${pay.currency} ` : "₹"}${pay.amount}`;
  return (
    <Section title="Payment">
      <DefinitionRows
        rows={[
          { k: "Amount", v: money ?? none() },
          { k: "Status", v: pay.status ? pay.status.charAt(0).toUpperCase() + pay.status.slice(1) : none() },
          ...(pay.method ? [{ k: "Method", v: pay.method }] : []),
          ...(pay.paid_at ? [{ k: "Paid", v: formatDateTime(pay.paid_at) }] : []),
          ...(pay.receipt ? [{ k: "Receipt", v: <Copyable value={pay.receipt} mono /> }] : []),
        ]}
      />
    </Section>
  );
}

export function PrintLine({ pr }: { pr: ProfilePrint }) {
  const detail = [when(pr.at), pr.door, pr.printer, pr.by ?? askedBy(pr.source)].filter(Boolean).join(" · ");
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={PRINT_TONE[pr.status]} label={PRINT_WORDS[pr.status]} />
        <span className="text-ink-3 text-[12px]">{detail}</span>
      </span>
      {pr.error ? <span className="text-refuse text-[12px]">{pr.error}</span> : null}
    </span>
  );
}

export function EventSection({ p }: { p: GuestProfileData }) {
  const c = p.check_in;
  const how = c ? [when(c.at), c.door ?? "no door recorded", methodWord(c.method), c.by ? `by ${c.by}` : null].filter(Boolean).join(" · ") : null;
  return (
    <Section title="At the event">
      <DefinitionRows
        rows={[
          { k: "Check-in", v: c ? how : p.status.checked_in ? "Checked in" : "Not checked in" },
          {
            k: "ID card",
            v: p.prints.length ? (
              <span className="flex flex-col gap-1.5">
                {p.prints.map((pr, i) => (
                  <PrintLine key={`${pr.at}-${i}`} pr={pr} />
                ))}
              </span>
            ) : (
              none("no card printed")
            ),
          },
          {
            k: "Merch",
            v: p.merch.length ? (
              <span className="flex flex-col gap-0.5">
                {p.merch.map((m, i) => (
                  <span key={`${m.item}-${i}`}>
                    {m.item}
                    {m.variant ? ` — ${m.variant}` : ""}
                    <span className="text-ink-3">
                      {" · "}
                      {[when(m.at), m.by].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                ))}
              </span>
            ) : (
              none("nothing collected")
            ),
          },
        ]}
      />
    </Section>
  );
}

export function CertificateSection({ p }: { p: GuestProfileData }) {
  const cert = p.status.certificate;
  const sends = p.deliveries.filter((d) => d.what === "certificate");
  return (
    <Section title="Certificate">
      <DefinitionRows
        rows={[
          {
            k: "Status",
            v: cert === "revoked" ? "Revoked" : cert === "issued" ? "Issued" : p.status.checked_in ? "Not issued — downloads as an attended guest" : "Not issued",
          },
          { k: "Sent", v: <Sends rows={sends} empty="not sent" /> },
        ]}
      />
    </Section>
  );
}
