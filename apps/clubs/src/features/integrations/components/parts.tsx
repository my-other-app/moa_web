"use client";

import * as React from "react";
import { AlertTriangleIcon, CheckIcon, CopyIcon, ShieldAlertIcon } from "lucide-react";
import { Checkbox, cn, toast } from "@moa/ui";

import { SCOPE_GROUPS, SCOPE_INFO, groupScopes, needsNoticeTick, noticeText, scopeLabel, ATTENDEES_SCOPE, type Scope } from "../schemas";

/**
 * A secret the server gives once — an API key, a webhook signing secret —
 * with its copy button and the plain warning that it will not be shown
 * again. The secret lives only in the dialog's state: closing the dialog
 * forgets it, and nothing writes it anywhere else.
 */
export function SecretOnce({ label, secret, warning, children }: { label: string; secret: string; warning?: React.ReactNode; children?: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy. Select it and copy it by hand.");
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-caution-soft text-ink flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[12.5px] leading-[1.55]" role="alert">
        <AlertTriangleIcon className="text-caution mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="m-0">
          <strong className="font-semibold">Copy it now. It won&apos;t be shown again.</strong>{" "}
          {warning ?? "We keep only a fingerprint of it, so if it's lost, make a new one. Keep it out of websites, apps and shared documents: anyone who has it acts as your club."}
        </p>
      </div>
      <div>
        <span className="eyebrow mb-1.5 block">{label}</span>
        <div className="border-line bg-sunken flex items-center gap-2 rounded-xl border p-1.5 pl-3">
          <code data-testid="secret" className="text-ink min-w-0 flex-1 font-mono text-[12.5px] break-all select-all">
            {secret}
          </code>
          <button type="button" className={cn("btn btn-sm", copied ? "btn-secondary" : "btn-primary")} onClick={() => void copy()}>
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Scopes as small tags, in their groups' order. */
export function ScopeTags({ scopes, max }: { scopes: readonly string[]; max?: number }) {
  const ordered = groupScopes(scopes).flatMap((g) => g.scopes);
  const shown = max ? ordered.slice(0, max) : ordered;
  const more = ordered.length - shown.length;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((s) => (
        <span key={s} title={s} className={cn("rounded-full px-2 py-0.5 text-[11px]", s === ATTENDEES_SCOPE ? "bg-caution-soft text-caution" : "bg-sunken text-ink-2")}>
          {scopeLabel(s)}
        </span>
      ))}
      {more > 0 ? <span className="text-ink-3 px-1 text-[11px]">+{more} more</span> : null}
    </span>
  );
}

/**
 * The scopes to tick, in groups, each with what it lets the other system do.
 * People's details (`attendees:read`) are marked, and ticking them brings up
 * the club's word that its form tells people (India's DPDP Act): without it,
 * they can't be given.
 */
export function ScopePicker({
  value,
  onChange,
  offered,
  recipient,
  noticeTicked,
  onNoticeTicked,
  error,
  noticeError,
  idPrefix = "scope",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** Only these may be ticked (a partner app asks for some); all of them by default. */
  offered?: readonly string[];
  /** Who receives the details, as the tick names it: a key's name, a partner app's. */
  recipient: string;
  noticeTicked: boolean;
  onNoticeTicked: (next: boolean) => void;
  error?: string | undefined;
  noticeError?: string | undefined;
  idPrefix?: string;
}) {
  const allowed = offered ? new Set(offered) : null;
  const groups = SCOPE_GROUPS.map((g) => ({ ...g, scopes: g.scopes.filter((s) => !allowed || allowed.has(s)) })).filter((g) => g.scopes.length > 0);
  const toggle = (s: Scope, on: boolean) => onChange(on ? [...value.filter((v) => v !== s), s] : value.filter((v) => v !== s));
  const allTicked = groups.every((g) => g.scopes.every((s) => value.includes(s)));
  const everything = groups.flatMap((g) => g.scopes);

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" aria-describedby={error ? `${idPrefix}-error` : undefined}>
      <div className="flex items-center justify-between gap-2">
        <legend className="eyebrow p-0">What it may do</legend>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => onChange(allTicked ? [] : everything)}>
          {allTicked ? "Clear all" : "Tick all"}
        </button>
      </div>
      {groups.map((g) => (
        <div key={g.key} role="group" aria-label={g.label} className="border-line-soft rounded-xl border">
          <div className="text-ink-2 border-line-soft border-b px-3 py-1.5 text-[12px] font-semibold">{g.label}</div>
          <ul className="m-0 flex list-none flex-col p-0">
            {g.scopes.map((s) => {
              const id = `${idPrefix}-${s.replace(/[^a-z]/g, "-")}`;
              const sensitive = s === ATTENDEES_SCOPE;
              return (
                <li key={s} className="border-line-soft flex items-start gap-3 border-b px-3 py-2.5 last:border-0">
                  <Checkbox id={id} checked={value.includes(s)} onCheckedChange={(next) => toggle(s, next === true)} className="mt-0.5" />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                    <span className="text-ink flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                      {SCOPE_INFO[s].label}
                      {sensitive ? (
                        <span className="bg-caution-soft text-caution inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-medium">
                          <ShieldAlertIcon className="size-3" aria-hidden="true" /> Personal data
                        </span>
                      ) : null}
                    </span>
                    <span className="text-ink-3 block text-[12px] leading-[1.45]">{SCOPE_INFO[s].description}</span>
                    <code className="text-ink-3 font-mono text-[10.5px]">{s}</code>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {error ? (
        <p id={`${idPrefix}-error`} role="alert" className="text-refuse m-0 text-[12px]">
          {error}
        </p>
      ) : null}
      {needsNoticeTick(value) ? <NoticeTick id={`${idPrefix}-notice`} recipient={recipient} checked={noticeTicked} onChange={onNoticeTicked} error={noticeError} /> : null}
    </fieldset>
  );
}

/** The club's word, required before people's details are shared (India's DPDP Act 2023: the club is the data fiduciary). */
export function NoticeTick({
  id,
  recipient,
  text,
  checked,
  onChange,
  error,
}: {
  id: string;
  recipient: string;
  /** The words, when the server words them its own way (an endpoint: by its host). */
  text?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  error?: string | undefined;
}) {
  return (
    <div className={cn("rounded-xl border p-3", checked ? "border-line bg-sunken" : "border-caution-line bg-caution-soft")}>
      <div className="flex items-start gap-3">
        <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} className="mt-0.5" aria-describedby={`${id}-why`} />
        <div className="min-w-0">
          <label htmlFor={id} className="text-ink cursor-pointer text-[13px] font-medium">
            {text ?? noticeText(recipient)}
          </label>
          <p id={`${id}-why`} className="text-ink-3 m-0 mt-0.5 text-[12px] leading-[1.5]">
            Required by India&apos;s DPDP Act before people&apos;s names, emails, phones and answers leave MyOtherApp. Your club decides who gets them and answers for it. Every read
            is counted in your club&apos;s log.
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-refuse m-0 mt-2 text-[12px]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
