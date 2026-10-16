"use client";

import * as React from "react";
import { CardLabel, ChoiceCard, FigurePanel, Switch } from "@moa/ui";

import { useUpdateGateSettings } from "../queries";
import type { GateSettings } from "../schemas";

const MODES: {
  value: GateSettings["door_mode"];
  label: string;
  note: string;
}[] = [
  {
    value: "open",
    label: "Open",
    note: "Anyone with a valid ticket is admitted, any time.",
  },
  {
    value: "auto",
    label: "Around the event",
    note: "Opens a day before the start and shuts after the end.",
  },
  {
    value: "closed",
    label: "Shut",
    note: "Nobody is admitted. For before the doors open, or after.",
  },
];

const OPTIONS = [
  {
    key: "spot_registration_checks_in",
    label: "A desk registration is admitted at once",
    hint: "Off: the desk registers them, and they are checked in when they reach a door.",
  },
  {
    key: "capture_contact_at_gate",
    label: "Ask for a mobile number at the door",
    hint: "After a check-in with no number on record. Skipping is one tap.",
  },
  {
    key: "require_contact_at_gate",
    label: "Make the number required",
    hint: "The sheet says so; the check-in is recorded either way.",
  },
] as const;

function CloseAfter({
  value,
  onSave,
}: {
  value: number;
  onSave: (minutes: number) => void;
}) {
  const [minutes, setMinutes] = React.useState(String(value));
  const commit = () => {
    const n = Math.min(10080, Math.max(0, Math.round(Number(minutes) || 0)));
    setMinutes(String(n));
    if (n !== value) onSave(n);
  };
  return (
    <label className="text-ink-2 mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
      Shuts
      <input
        type="number"
        min={0}
        max={10080}
        inputMode="numeric"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => (e.key === "Enter" ? commit() : undefined)}
        aria-label="Minutes after the end"
        className="input input-sm w-20 font-mono"
      />
      minutes after the end
    </label>
  );
}

/** How the gate behaves: when it admits anyone, and what it asks at the door. Applies to the next scan. */
export function DoorSettingsPanel({
  eventId,
  settings,
}: {
  eventId: number;
  settings: GateSettings;
}) {
  const update = useUpdateGateSettings(eventId);
  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          <span className="text-ink-3 text-[11px]">
            applies to the next scan
          </span>
        }
      >
        How the door behaves
      </CardLabel>
      <div role="radiogroup" aria-label="Door mode" className="mt-3 grid gap-2">
        {MODES.map((m) => (
          <ChoiceCard
            key={m.value}
            checked={settings.door_mode === m.value}
            onClick={() =>
              settings.door_mode !== m.value &&
              update.mutate({ door_mode: m.value })
            }
            title={m.label}
            hint={m.note}
            tone={m.value === "closed" ? "caution" : "brand"}
            disabled={update.isPending}
          />
        ))}
      </div>
      {settings.door_mode === "auto" ? (
        <CloseAfter
          key={settings.close_after_minutes}
          value={settings.close_after_minutes}
          onSave={(n) => update.mutate({ close_after_minutes: n })}
        />
      ) : null}
      <ul className="border-line-soft mt-4 border-t">
        {OPTIONS.map((o) => (
          <li
            key={o.key}
            className="border-line-soft flex items-start gap-3 border-b py-3 last:border-b-0 last:pb-0"
          >
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[13px]">{o.label}</span>
              <span className="text-ink-3 block text-[11.5px] leading-[1.5]">
                {o.hint}
              </span>
            </span>
            <Switch
              checked={settings[o.key]}
              onCheckedChange={(on) => update.mutate({ [o.key]: on })}
              aria-label={o.label}
              disabled={
                update.isPending ||
                (o.key === "require_contact_at_gate" &&
                  !settings.capture_contact_at_gate &&
                  !settings.require_contact_at_gate)
              }
              className="mt-0.5"
            />
          </li>
        ))}
      </ul>
    </FigurePanel>
  );
}
