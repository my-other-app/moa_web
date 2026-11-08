"use client";

import * as React from "react";
import { NativeSelect } from "@moa/ui";

import { inputTypeOf, isMultiChoice, type AnswerField, type AnswerValue } from "@/lib/answers";

import { DOOR_FIELD, DOOR_LABEL, TouchChoice } from "./door-kit";

/**
 * One of the event's own questions as the door asks it: big ticks for
 * several choices, a dropdown for one, else the typed input, sized for a
 * thumb. Nothing is ever required at the door. Shared by the walk-up form
 * and the missing answers filled at check-in.
 */
export function DoorQuestionField({
  field: f,
  value,
  onChange,
  idPrefix,
  note = "— optional at the door",
  error,
}: {
  field: AnswerField;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  /** The control's id is `${idPrefix}-${key}`, which its label points at. */
  idPrefix: string;
  /** Said after the label. */
  note?: string;
  /** The server's word on this answer, under it. */
  error?: string | null;
}) {
  const id = `${idPrefix}-${f.key}`;
  const label = f.label?.trim() || f.key;
  return (
    <div>
      <label htmlFor={id} className={DOOR_LABEL}>
        {label} {note ? <span className="text-ink-3 font-normal">{note}</span> : null}
      </label>
      {isMultiChoice(f) ? (
        <div id={id} role="group" aria-label={label} className="flex flex-wrap gap-2">
          {(f.options ?? []).map((o) => {
            const ticked = Array.isArray(value) ? value : [];
            const on = ticked.includes(o);
            return (
              <TouchChoice key={o} role="checkbox" checked={on} onClick={() => onChange(on ? ticked.filter((t) => t !== o) : [...ticked, o])}>
                {o}
              </TouchChoice>
            );
          })}
        </div>
      ) : f.options?.length ? (
        <NativeSelect id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} className="h-11 text-[16px]" aria-invalid={!!error || undefined}>
          <option value="">—</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <input id={id} type={inputTypeOf(f)} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} className={DOOR_FIELD} aria-invalid={!!error || undefined} />
      )}
      {error ? <p className="text-refuse mt-1.5 text-[13px]">{error}</p> : null}
    </div>
  );
}
