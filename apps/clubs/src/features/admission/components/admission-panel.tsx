"use client";

import * as React from "react";
import { CardLabel, Checkbox, FigurePanel } from "@moa/ui";

import { useAdmission, useNumberEveryone, useUpdateAdmission } from "../queries";
import { previewNumber } from "../schemas";

const label = "eyebrow mb-1.5 block";

/** How this event numbers its tickets: a prefix, a padded sequence, the event code. Numbers already given out never change. */
export function AdmissionPanel({ eventId }: { eventId: number }) {
  const admission = useAdmission(eventId);
  const update = useUpdateAdmission(eventId);
  const numberAll = useNumberEveryone(eventId);
  const s = admission.data;
  const [prefix, setPrefix] = React.useState<string | null>(null);
  const [digits, setDigits] = React.useState<number | null>(null);
  if (!s) return null;
  const p = prefix ?? (s.prefix ?? "");
  const d = digits ?? s.digits;
  const preview = previewNumber(p, d, s.include_code, s.code, 1);
  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          <span className="text-ink-3 text-[11px]">
            Next <span className="text-ink font-mono">{s.next_number}</span>
          </span>
        }
      >
        Admission numbers
      </CardLabel>
      <p className="text-ink-3 mt-1 text-[12.5px] leading-[1.5]">
        The number a ticket and a card carry beside the scan code: a prefix, a padded sequence, and the event code that keeps two events apart. Numbers already given out are never rewritten; a new format applies to the next ticket.
      </p>
      <div className="mt-3 grid items-end gap-3 sm:grid-cols-[160px_110px_minmax(0,1fr)]">
        <div>
          <label htmlFor={`admission-prefix-${eventId}`} className={label}>
            Prefix
          </label>
          <input
            id={`admission-prefix-${eventId}`}
            value={p}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            onBlur={() => p !== (s.prefix ?? "") && update.mutate({ prefix: p || null })}
            placeholder="MOA"
            maxLength={12}
            className="input font-mono uppercase"
          />
        </div>
        <div>
          <label htmlFor={`admission-digits-${eventId}`} className={label}>
            Digits
          </label>
          <input
            id={`admission-digits-${eventId}`}
            value={d}
            inputMode="numeric"
            onChange={(e) => setDigits(Math.min(8, Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1))))}
            onBlur={() => d !== s.digits && update.mutate({ digits: d })}
            className="input font-mono"
          />
        </div>
        <div className="flex h-9 items-center gap-2.5">
          <Checkbox
            id={`admission-code-${eventId}`}
            checked={s.include_code}
            onCheckedChange={(v) => update.mutate({ include_code: v === true })}
          />
          <label htmlFor={`admission-code-${eventId}`} className="text-ink cursor-pointer text-[13px]">
            End with the event code (<span className="font-mono">{s.code}</span>)
          </label>
        </div>
      </div>
      <div className="border-line-soft mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
        <span className="text-ink-3 text-[12.5px]">
          Reads as <span className="bg-sunken text-ink rounded-md px-2 py-0.5 font-mono">{preview}</span>
        </span>
        <span className="flex-1" />
        <span className="text-ink-3 text-[12px]">
          {s.numbered} numbered{s.unnumbered ? ` · ${s.unnumbered} without a number` : ""}
        </span>
        {s.unnumbered ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled={numberAll.isPending} onClick={() => numberAll.mutate()}>
            Number everyone registered so far ({s.unnumbered})
          </button>
        ) : null}
      </div>
    </FigurePanel>
  );
}
