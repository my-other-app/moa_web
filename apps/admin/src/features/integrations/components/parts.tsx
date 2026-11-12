"use client";

import * as React from "react";
import { AlertTriangleIcon, CheckIcon, CopyIcon } from "lucide-react";
import { Checkbox, cn, toast } from "@moa/ui";

import { SCOPE_GROUPS, SCOPE_HINT, SCOPE_LABEL, orderScopes, scopeLabel, type Scope } from "../schemas";

/**
 * A value the server gives once (a partner app's client secret), with a copy
 * button and the warning that it won't be shown again. It lives only in the
 * dialog's state: closing the dialog forgets it.
 */
export function SecretOnce({ label, value, testId = "secret" }: { label: string; value: string; testId?: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy. Select it and copy it by hand.");
    }
  };
  return (
    <div>
      <span className="eyebrow mb-1.5 block">{label}</span>
      <div className="border-line bg-sunken flex items-center gap-2 rounded-xl border p-1.5 pl-3">
        <code data-testid={testId} className="text-ink min-w-0 flex-1 font-mono text-[12.5px] break-all select-all">
          {value}
        </code>
        <button type="button" className={cn("btn btn-sm", copied ? "btn-secondary" : "btn-primary")} onClick={() => void copy()} aria-label={`Copy ${label.toLowerCase()}`}>
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** The warning over a value shown once: a client secret's by default, or `children` for another (a docs link). */
export function ShownOnceWarning({ children }: { children?: React.ReactNode }) {
  return (
    <div className="bg-caution-soft text-ink flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[12.5px] leading-[1.55]" role="alert">
      <AlertTriangleIcon className="text-caution mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="m-0">
        {children ?? (
          <>
            <strong className="font-semibold">Copy the secret now. It won&apos;t be shown again.</strong> We keep only a fingerprint of it. Send it to the partner by a private
            channel, never by email in plain text; if it&apos;s lost, make a new one.
          </>
        )}
      </p>
    </div>
  );
}

export function ScopeTags({ scopes }: { scopes: readonly string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {orderScopes(scopes).map((s) => (
        <span key={s} title={s} className={cn("rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap", s === "attendees:read" || s === "clubs:create" ? "bg-caution-soft text-caution" : "bg-sunken text-ink-2")}>
          {scopeLabel(s)}
        </span>
      ))}
    </span>
  );
}

/** The scopes a partner app may ever ask clubs for, in groups. */
export function ScopeChecklist({ value, onChange, error }: { value: string[]; onChange: (next: string[]) => void; error?: string | undefined }) {
  const toggle = (s: Scope, on: boolean) => onChange(on ? [...value.filter((v) => v !== s), s] : value.filter((v) => v !== s));
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="eyebrow mb-1 p-0">What it may ask clubs for</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {SCOPE_GROUPS.map((g) => (
          <div key={g.label} role="group" aria-label={g.label} className="border-line-soft rounded-xl border p-2.5">
            <div className="text-ink-2 mb-1 text-[12px] font-semibold">{g.label}</div>
            {g.scopes.map((s) => {
              const id = `partner-scope-${s.replace(/[^a-z]/g, "-")}`;
              return (
                <div key={s} className="flex items-start gap-2 py-1">
                  <Checkbox id={id} checked={value.includes(s)} onCheckedChange={(next) => toggle(s, next === true)} className="mt-0.5" />
                  <label htmlFor={id} className="min-w-0 cursor-pointer">
                    <span className="text-ink block text-[12.5px]">{SCOPE_LABEL[s]}</span>
                    {SCOPE_HINT[s] ? <span className="text-ink-3 block text-[11.5px] leading-[1.4]">{SCOPE_HINT[s]}</span> : null}
                  </label>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-refuse m-0 text-[12px]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/*
 * Theme tokens, as the clubs' charts: the quiet series is the brand's line
 * tint, the other stacked on it in the refuse colour.
 */
const BAR = "var(--brand-line)";
const ERR = "var(--refuse)";
const RULE = "var(--line)";
const INK = "var(--ink-3)";
const MONO = "var(--font-plex-mono), ui-monospace, monospace";

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const n = (v: number) => v.toLocaleString("en-IN");

/** A day per bar: `total` in the brand's tint, `bad` (errors, failures) in red at its foot. */
export function DailyBars({ days, what, bad }: { days: readonly { date: string; total: number; bad: number }[]; what: string; bad: string }) {
  const id = React.useId();
  const count = days.length;
  if (count === 0) return null;
  const W = 640;
  const H = 140;
  const PAD = { l: 40, r: 8, t: 12, b: 22 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const peak = Math.max(1, ...days.map((d) => d.total));
  const bw = iw / count;
  const gap = count > 40 ? 0.5 : 2;
  const x = (i: number) => PAD.l + i * bw;
  const y = (v: number) => PAD.t + ih - (Math.min(v, peak) / peak) * ih;
  const every = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(iw / 72))));
  const total = days.reduce((s, d) => s + d.total, 0);
  const badTotal = days.reduce((s, d) => s + d.bad, 0);
  const caption = `${what} per day from ${dayLabel(days[0]!.date)} to ${dayLabel(days[count - 1]!.date)}: ${n(total)} in all, ${n(badTotal)} ${bad}.`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={`${id}-t`}>
      <title id={`${id}-t`}>{caption}</title>
      {[0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(peak * f)} y2={y(peak * f)} stroke={RULE} strokeDasharray="2 4" />
          <text x={PAD.l - 6} y={y(peak * f) + 3.5} textAnchor="end" fontSize={9.5} fill={INK} fontFamily={MONO}>
            {n(Math.round(peak * f))}
          </text>
        </g>
      ))}
      <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke={RULE} />
      {days.map((d, i) => (
        <g key={d.date}>
          <title>{`${dayLabel(d.date)}: ${n(d.total)}, ${n(d.bad)} ${bad}`}</title>
          <rect x={x(i) + gap / 2} y={y(d.total)} width={Math.max(0.5, bw - gap)} height={Math.max(0, PAD.t + ih - y(d.total))} rx={bw > 6 ? 2 : 0} fill={BAR} />
          {d.bad > 0 ? <rect x={x(i) + gap / 2} y={y(d.bad)} width={Math.max(0.5, bw - gap)} height={Math.max(1, PAD.t + ih - y(d.bad))} rx={bw > 6 ? 2 : 0} fill={ERR} /> : null}
        </g>
      ))}
      {days.map((d, i) =>
        i === count - 1 || (i % every === 0 && (count - 1 - i) * bw > 56) ? (
          <text key={`t${d.date}`} x={x(i) + (i === count - 1 ? bw : 0)} y={H - 6} textAnchor={i === count - 1 ? "end" : "start"} fontSize={9.5} fill={INK} fontFamily={MONO}>
            {dayLabel(d.date)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
