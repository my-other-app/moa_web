"use client";

import * as React from "react";
import { formatNumber } from "@moa/app-kit";
import { ChoiceCard, Chip } from "@moa/ui";

import { useAudienceCount } from "../queries";
import {
  AUDIENCE_WHO,
  STAGE_META,
  TRIGGER_MODES,
  type EmailAudience,
  type EmailScope,
  type EmailStage,
  type EmailTemplateFields,
  type EmailTheme,
  type EmailToken,
  type EmailTrigger,
} from "../schemas";
import {
  ColorField,
  NumberField,
  Segmented,
  SelectField,
  TemplateField,
  Toggle,
  ui,
} from "./kit";

interface TokenProps {
  tokens: EmailToken[];
  samples: Record<string, string>;
}

const ROLES = [
  { value: "attendee", label: "Attendees" },
  { value: "speaker", label: "Speakers" },
  { value: "staff", label: "Staff" },
] as const;

/** The look of the whole email: fonts, colours, the card, the footer. */
export function ThemePanel({
  theme,
  onChange,
  brandPrimary,
  tokens,
  samples,
}: {
  theme: EmailTheme;
  onChange: (t: EmailTheme) => void;
  brandPrimary: string;
} & TokenProps) {
  const patch = (p: Partial<EmailTheme>) => onChange({ ...theme, ...p });
  const custom = theme.accent !== "brand";
  return (
    <div className="space-y-3">
      <SelectField
        id="t-font"
        label="Font"
        value={theme.font}
        options={[
          { value: "sans", label: "Sans (Helvetica, Arial)" },
          { value: "serif", label: "Serif (Georgia)" },
          { value: "mono", label: "Monospace" },
        ]}
        onChange={(font) => patch({ font })}
      />
      <p className={ui.note}>
        Email clients draw with the fonts they have, so these are the families
        they all share.
      </p>
      <Segmented
        label="Accent"
        value={custom ? "custom" : "brand"}
        options={[
          { value: "brand", label: "Ticket design's" },
          { value: "custom", label: "Pick one" },
        ]}
        onChange={(v) =>
          patch({ accent: v === "brand" ? "brand" : brandPrimary })
        }
      />
      <div className="grid grid-cols-2 gap-2">
        {custom ? (
          <ColorField
            id="t-accent"
            label="Accent colour"
            value={theme.accent}
            fallback={brandPrimary}
            onChange={(v) => patch({ accent: v ?? brandPrimary })}
          />
        ) : null}
        <ColorField
          id="t-accent-text"
          label="Text on accent"
          value={theme.accentText}
          fallback="#FFFFFF"
          onChange={(v) => patch({ accentText: v ?? "#FFFFFF" })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ColorField
          id="t-bg"
          label="Page"
          value={theme.background}
          fallback="#F3F4F1"
          onChange={(v) => patch({ background: v ?? "#F3F4F1" })}
        />
        <ColorField
          id="t-surface"
          label="Card"
          value={theme.surface}
          fallback="#FFFFFF"
          onChange={(v) => patch({ surface: v ?? "#FFFFFF" })}
        />
        <ColorField
          id="t-text"
          label="Text"
          value={theme.text}
          fallback="#141614"
          onChange={(v) => patch({ text: v ?? "#141614" })}
        />
        <ColorField
          id="t-muted"
          label="Quiet text"
          value={theme.muted}
          fallback="#6B716C"
          onChange={(v) => patch({ muted: v ?? "#6B716C" })}
        />
      </div>
      <NumberField
        id="t-radius"
        label="Corner radius"
        value={theme.radius}
        min={0}
        max={32}
        suffix="px"
        onChange={(radius) => patch({ radius })}
      />
      <Segmented
        label="Club logo at the top"
        value={theme.logo}
        options={[
          { value: "org_logo", label: "Show" },
          { value: "none", label: "Hide" },
        ]}
        onChange={(logo) => patch({ logo })}
      />
      <TemplateField
        id="t-footer"
        label="Footer"
        value={theme.footer}
        rows={2}
        onChange={(footer) => patch({ footer })}
        tokens={tokens}
        samples={samples}
      />
    </div>
  );
}

const unitOf = (minutes: number) =>
  minutes % 1440 === 0 ? "days" : minutes % 60 === 0 ? "hours" : "minutes";
const PER: Record<"minutes" | "hours" | "days", number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

function TriggerFields({
  trigger,
  onChange,
  stage,
}: {
  trigger: EmailTrigger;
  onChange: (t: EmailTrigger) => void;
  stage: EmailStage;
}) {
  const timed = trigger.mode === "BEFORE_START" || trigger.mode === "AFTER_END";
  const minutes = trigger.minutes ?? 60;
  const [unit, setUnit] = React.useState<"minutes" | "hours" | "days">(
    unitOf(minutes),
  );
  const modes = TRIGGER_MODES.filter(
    (m) => m.value !== "ON_TICKETS" || stage === "INVITE",
  );
  return (
    <div className="space-y-2">
      <SelectField
        id="tr-mode"
        label="When it goes out"
        value={trigger.mode}
        options={modes}
        onChange={(mode) =>
          onChange({
            ...trigger,
            mode,
            minutes:
              mode === "BEFORE_START" || mode === "AFTER_END"
                ? (trigger.minutes ?? 60)
                : null,
          })
        }
      />
      <p className={ui.note}>
        {modes.find((m) => m.value === trigger.mode)?.note}
      </p>
      {timed ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            id="tr-amount"
            label="How long"
            value={Math.max(1, Math.round(minutes / PER[unit]))}
            min={1}
            max={unit === "days" ? 30 : unit === "hours" ? 720 : 43200}
            onChange={(n) => onChange({ ...trigger, minutes: n * PER[unit] })}
          />
          <SelectField
            id="tr-unit"
            label="Unit"
            value={unit}
            options={[
              { value: "minutes", label: "Minutes" },
              { value: "hours", label: "Hours" },
              { value: "days", label: "Days" },
            ]}
            onChange={(u) => {
              setUnit(u);
              onChange({
                ...trigger,
                minutes: Math.max(1, Math.round(minutes / PER[unit])) * PER[u],
              });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** "240 guests", or "…" while it is counted. */
const reach = (n: number | undefined) =>
  n === undefined ? "…" : `${formatNumber(n)} ${n === 1 ? "guest" : "guests"}`;

/**
 * Who an email goes to: one of three audiences as cards, each saying how
 * many it reaches with the roles picked, then the roles as chips. Within an
 * event every count is live; in the library there is nobody to count yet.
 */
export function AudienceFields({
  audience,
  onChange,
  eventId,
}: {
  audience: EmailAudience;
  onChange: (a: EmailAudience) => void;
  /** With an event, the live count of who each audience reaches. */
  eventId?: number;
}) {
  const live = eventId !== undefined;
  const id = eventId ?? 0;
  const roles = audience.roles;
  const counts = {
    ALL: useAudienceCount(id, { who: "ALL", roles }, live),
    CHECKED_IN: useAudienceCount(id, { who: "CHECKED_IN", roles }, live),
    NOT_CHECKED_IN: useAudienceCount(
      id,
      { who: "NOT_CHECKED_IN", roles },
      live,
    ),
  };
  const picked = counts[audience.who].data;
  const toggle = (r: string) =>
    onChange({
      ...audience,
      roles: roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r],
    });
  return (
    <div className="space-y-3">
      <div>
        <span className={ui.label}>Who gets it</span>
        <div
          className="grid gap-1.5"
          role="radiogroup"
          aria-label="Who gets it"
        >
          {AUDIENCE_WHO.map((w) => (
            <ChoiceCard
              key={w.value}
              checked={audience.who === w.value}
              onClick={() => onChange({ ...audience, who: w.value })}
              title={w.label}
              hint={w.note}
              right={live ? reach(counts[w.value].data?.recipients) : undefined}
            />
          ))}
        </div>
      </div>
      <div>
        <span className={ui.label}>Roles</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Roles">
          <Chip
            active={roles.length === 0}
            onClick={() => onChange({ ...audience, roles: [] })}
          >
            Every role
          </Chip>
          {ROLES.map((r) => (
            <Chip
              key={r.value}
              active={roles.includes(r.value)}
              onClick={() => toggle(r.value)}
            >
              {r.label}
            </Chip>
          ))}
        </div>
      </div>
      {live ? (
        <p className={ui.note} aria-live="polite">
          {picked
            ? `Reaches ${reach(picked.recipients)}${picked.withoutEmail ? ` · ${formatNumber(picked.withoutEmail)} without an email address are skipped` : ""}`
            : "Counting…"}
        </p>
      ) : null}
    </div>
  );
}

/** Name, subject, who gets it, what rides along, and when. */
export function SendingPanel({
  fields,
  onChange,
  scope,
  stage,
  tokens,
  samples,
}: {
  fields: EmailTemplateFields;
  onChange: (f: EmailTemplateFields) => void;
  scope: EmailScope;
  stage: EmailStage;
} & TokenProps) {
  const patch = (p: Partial<EmailTemplateFields>) =>
    onChange({ ...fields, ...p });
  // A registration request's email goes to that one person as the request moves: no audience, no timer.
  const when = STAGE_META[stage].when;
  return (
    <div className="space-y-3">
      <div className="min-w-0">
        <label htmlFor="f-name" className={ui.label}>
          Name (only you see it)
        </label>
        <input
          id="f-name"
          value={fields.name}
          maxLength={80}
          onChange={(e) => patch({ name: e.target.value })}
          className={ui.control}
        />
      </div>
      <TemplateField
        id="f-subject"
        label="Subject"
        value={fields.subject}
        single
        onChange={(subject) => patch({ subject })}
        tokens={tokens}
        samples={samples}
      />
      {when ? (
        <div className="border-line-soft space-y-2 border-t pt-3">
          <p className={ui.heading}>Who and when</p>
          <p className={ui.note}>
            Sent to the person whose request it is, {when}.
          </p>
        </div>
      ) : (
      <>
      <div className="border-line-soft space-y-2 border-t pt-3">
        <AudienceFields
          audience={fields.audience}
          onChange={(audience) => patch({ audience })}
          eventId={scope.kind === "event" ? scope.eventId : undefined}
        />
      </div>
      <div className="border-line-soft space-y-2 border-t pt-3">
        <p className={ui.heading}>Attached files</p>
        <Toggle
          id="f-ticket"
          label="The guest's ticket PDF"
          checked={fields.attachments.ticketPdf}
          onChange={(ticketPdf) =>
            patch({ attachments: { ...fields.attachments, ticketPdf } })
          }
          note="Skipped for a revoked ticket."
        />
        <Toggle
          id="f-cert"
          label="The guest's certificate PDF"
          checked={fields.attachments.certificatePdf}
          onChange={(certificatePdf) =>
            patch({ attachments: { ...fields.attachments, certificatePdf } })
          }
          note="Only guests who hold one get it."
        />
      </div>
      <div className="border-line-soft space-y-2 border-t pt-3">
        <p className={ui.heading}>Timing</p>
        {stage === "INVITE" ? (
          <p className={ui.note}>
            The invite is the ticket email. It goes out with every ticket: when
            a guest registers, when a payment lands, and from Send tickets on
            the attendees page.
          </p>
        ) : (
          <TriggerFields
            trigger={fields.trigger}
            onChange={(trigger) => patch({ trigger })}
            stage={stage}
          />
        )}
      </div>
      </>
      )}
      <div className="border-line-soft border-t pt-3">
        <Toggle
          id="f-enabled"
          label="Switched on"
          checked={fields.enabled}
          onChange={(enabled) => patch({ enabled })}
          note={
            stage === "INVITE"
              ? "On: tickets go out in this email. Off: the plain ticket email."
              : when
                ? "Off: this version of the email is not used."
                : "Off: timers do not fire and it is not sent."
          }
        />
      </div>
    </div>
  );
}
