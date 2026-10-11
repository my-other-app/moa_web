"use client";

import * as React from "react";
import { cn } from "@moa/ui";

import { useAudienceCount } from "../queries";
import {
  AUDIENCE_WHO,
  TRIGGER_MODES,
  type EmailAudience,
  type EmailScope,
  type EmailStage,
  type EmailTemplateFields,
  type EmailTheme,
  type EmailToken,
  type EmailTrigger,
} from "../schemas";
import { ColorField, NumberField, Segmented, SelectField, TemplateField, Toggle, ui } from "./kit";

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
}: { theme: EmailTheme; onChange: (t: EmailTheme) => void; brandPrimary: string } & TokenProps) {
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
      <p className={ui.note}>Email clients draw with the fonts they have, so these are the families they all share.</p>
      <Segmented
        label="Accent"
        value={custom ? "custom" : "brand"}
        options={[
          { value: "brand", label: "Ticket design's" },
          { value: "custom", label: "Pick one" },
        ]}
        onChange={(v) => patch({ accent: v === "brand" ? "brand" : brandPrimary })}
      />
      <div className="grid grid-cols-2 gap-2">
        {custom ? <ColorField id="t-accent" label="Accent colour" value={theme.accent} fallback={brandPrimary} onChange={(v) => patch({ accent: v ?? brandPrimary })} /> : null}
        <ColorField id="t-accent-text" label="Text on accent" value={theme.accentText} fallback="#FFFFFF" onChange={(v) => patch({ accentText: v ?? "#FFFFFF" })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ColorField id="t-bg" label="Page" value={theme.background} fallback="#F3F4F1" onChange={(v) => patch({ background: v ?? "#F3F4F1" })} />
        <ColorField id="t-surface" label="Card" value={theme.surface} fallback="#FFFFFF" onChange={(v) => patch({ surface: v ?? "#FFFFFF" })} />
        <ColorField id="t-text" label="Text" value={theme.text} fallback="#141614" onChange={(v) => patch({ text: v ?? "#141614" })} />
        <ColorField id="t-muted" label="Quiet text" value={theme.muted} fallback="#6B716C" onChange={(v) => patch({ muted: v ?? "#6B716C" })} />
      </div>
      <NumberField id="t-radius" label="Corner radius" value={theme.radius} min={0} max={32} suffix="px" onChange={(radius) => patch({ radius })} />
      <Segmented
        label="Club logo at the top"
        value={theme.logo}
        options={[
          { value: "org_logo", label: "Show" },
          { value: "none", label: "Hide" },
        ]}
        onChange={(logo) => patch({ logo })}
      />
      <TemplateField id="t-footer" label="Footer" value={theme.footer} rows={2} onChange={(footer) => patch({ footer })} tokens={tokens} samples={samples} />
    </div>
  );
}

const unitOf = (minutes: number) => (minutes % 1440 === 0 ? "days" : minutes % 60 === 0 ? "hours" : "minutes");
const PER: Record<"minutes" | "hours" | "days", number> = { minutes: 1, hours: 60, days: 1440 };

function TriggerFields({ trigger, onChange, stage }: { trigger: EmailTrigger; onChange: (t: EmailTrigger) => void; stage: EmailStage }) {
  const timed = trigger.mode === "BEFORE_START" || trigger.mode === "AFTER_END";
  const minutes = trigger.minutes ?? 60;
  const [unit, setUnit] = React.useState<"minutes" | "hours" | "days">(unitOf(minutes));
  const modes = TRIGGER_MODES.filter((m) => m.value !== "ON_TICKETS" || stage === "INVITE");
  return (
    <div className="space-y-2">
      <SelectField id="tr-mode" label="When it goes out" value={trigger.mode} options={modes} onChange={(mode) => onChange({ ...trigger, mode, minutes: mode === "BEFORE_START" || mode === "AFTER_END" ? (trigger.minutes ?? 60) : null })} />
      <p className={ui.note}>{modes.find((m) => m.value === trigger.mode)?.note}</p>
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
              onChange({ ...trigger, minutes: Math.max(1, Math.round(minutes / PER[unit])) * PER[u] });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function AudienceFields({
  audience,
  onChange,
  eventId,
}: {
  audience: EmailAudience;
  onChange: (a: EmailAudience) => void;
  /** With an event, the live count of who this reaches. */
  eventId?: number;
}) {
  const count = useAudienceCount(eventId ?? 0, audience, eventId !== undefined);
  return (
    <div className="space-y-2">
      <Segmented label="Who" value={audience.who} options={AUDIENCE_WHO.map((w) => ({ value: w.value, label: w.label }))} onChange={(who) => onChange({ ...audience, who })} />
      <div>
        <span className={ui.label}>Roles (none = all)</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Roles">
          {ROLES.map((r) => {
            const on = audience.roles.includes(r.value);
            return (
              <button
                key={r.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...audience, roles: on ? audience.roles.filter((x) => x !== r.value) : [...audience.roles, r.value] })}
                className={cn("rounded-full border px-2.5 py-1 text-[12px] transition-colors", on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      {eventId !== undefined ? (
        <p className={ui.note} aria-live="polite">
          {count.data
            ? `Reaches ${count.data.recipients} ${count.data.recipients === 1 ? "guest" : "guests"}${count.data.withoutEmail ? ` · ${count.data.withoutEmail} without an email address` : ""}`
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
}: { fields: EmailTemplateFields; onChange: (f: EmailTemplateFields) => void; scope: EmailScope; stage: EmailStage } & TokenProps) {
  const patch = (p: Partial<EmailTemplateFields>) => onChange({ ...fields, ...p });
  return (
    <div className="space-y-3">
      <div className="min-w-0">
        <label htmlFor="f-name" className={ui.label}>
          Name (only you see it)
        </label>
        <input id="f-name" value={fields.name} maxLength={80} onChange={(e) => patch({ name: e.target.value })} className={cn(ui.control, ui.input)} />
      </div>
      <TemplateField id="f-subject" label="Subject" value={fields.subject} single onChange={(subject) => patch({ subject })} tokens={tokens} samples={samples} />
      <div className="space-y-2 border-t pt-3">
        <p className={ui.heading}>Audience</p>
        <AudienceFields audience={fields.audience} onChange={(audience) => patch({ audience })} eventId={scope.kind === "event" ? scope.eventId : undefined} />
      </div>
      <div className="space-y-2 border-t pt-3">
        <p className={ui.heading}>Attached files</p>
        <Toggle id="f-ticket" label="The guest's ticket PDF" checked={fields.attachments.ticketPdf} onChange={(ticketPdf) => patch({ attachments: { ...fields.attachments, ticketPdf } })} note="Skipped for a revoked ticket." />
        <Toggle id="f-cert" label="The guest's certificate PDF" checked={fields.attachments.certificatePdf} onChange={(certificatePdf) => patch({ attachments: { ...fields.attachments, certificatePdf } })} note="Only guests who hold one get it." />
      </div>
      <div className="space-y-2 border-t pt-3">
        <p className={ui.heading}>Timing</p>
        <TriggerFields trigger={fields.trigger} onChange={(trigger) => patch({ trigger })} stage={stage} />
      </div>
      <div className="border-t pt-3">
        <Toggle
          id="f-enabled"
          label="Switched on"
          checked={fields.enabled}
          onChange={(enabled) => patch({ enabled })}
          note={stage === "INVITE" ? "On: tickets go out in this email. Off: the plain ticket email." : "Off: timers do not fire and it is not sent."}
        />
      </div>
    </div>
  );
}
