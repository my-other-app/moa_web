"use client";

import { COLOR_REF_LABEL, type ColorRef, type TokenGroup } from "@moa/layout";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@moa/ui";
import { Loader2Icon } from "lucide-react";
import * as React from "react";

import type { DesignToken } from "../schemas";
import { ui } from "./kit";

/** The spinner a button shows while its work is in flight. */
export const Busy = ({ on }: { on: boolean }) => (on ? <Loader2Icon className="animate-spin" /> : null);

/**
 * A number that commits while typing when it parses, and keeps a half-typed
 * value ("-", "1.") on screen without fighting the person typing.
 */
export const NumberField = ({
  id,
  label: text,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
}) => {
  const shown = String(Math.round(value * 100) / 100);
  const [draft, setDraft] = React.useState(shown);
  const [seen, setSeen] = React.useState(shown);
  if (shown !== seen) {
    setSeen(shown);
    if (Number(draft) !== value) setDraft(shown);
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={ui.label}>
        {text}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(n))
              onChange(
                min !== undefined || max !== undefined ? Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)) : n
              );
          }}
          onBlur={() => setDraft(shown)}
          className={cn(ui.control, suffix && "pr-8")}
        />
        {suffix ? (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[10.5px] text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
};

export const SelectField = <T extends string | number>({
  id,
  label: text,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) => (
  <div className="min-w-0">
    <label htmlFor={id} className={ui.label}>
      {text}
    </label>
    <select
      id={id}
      value={String(value)}
      disabled={disabled}
      onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}
      className={ui.control}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

export const Segmented = <T extends string>({
  label: text,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) => (
  <div className="min-w-0">
    <span className={ui.label}>{text}</span>
    <div role="radiogroup" aria-label={text} className="flex h-9 overflow-hidden rounded-md border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-[7px] text-[12px] transition-colors",
            value === o.value ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A colour that can be fixed, or follow the club's brand or each guest's
 * ticket type -- one design, every type in its own colour.
 */
export const ColorRefField = ({
  id,
  label: text,
  value,
  onChange,
  resolve,
  allowNone,
  refs = true,
}: {
  id: string;
  label: string;
  value: ColorRef | null;
  onChange: (v: ColorRef | null) => void;
  resolve: (v: ColorRef) => string;
  allowNone?: boolean;
  refs?: boolean;
}) => {
  const fixed = value && HEX.test(value) ? value : null;
  const shown = value ? resolve(value) : null;
  const [draft, setDraft] = React.useState(fixed ?? "");
  const [seen, setSeen] = React.useState(fixed);
  if (fixed !== seen) {
    setSeen(fixed);
    setDraft(fixed ?? "");
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={ui.label}>
        {text}
      </label>
      <div className="flex items-center gap-1.5">
        <span
          className="relative size-9 shrink-0 overflow-hidden rounded-md border"
          style={{ background: shown ?? "repeating-linear-gradient(45deg,#ddd 0 4px,#fff 4px 8px)" }}
        >
          <input
            type="color"
            aria-label={`${text} picker`}
            value={shown && HEX.test(shown) ? shown : "#000000"}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
        <input
          id={id}
          value={fixed ? draft : value ? (COLOR_REF_LABEL as Record<string, string>)[value] : "None"}
          readOnly={!fixed}
          onFocus={() => !fixed && shown && (onChange(shown.toUpperCase()), setDraft(shown.toUpperCase()))}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            if (HEX.test(v)) onChange(v.toUpperCase());
          }}
          className={cn(ui.control, "font-mono uppercase", !fixed && "text-muted-foreground")}
        />
      </div>
      {refs || allowNone ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {refs
            ? (Object.keys(COLOR_REF_LABEL) as (keyof typeof COLOR_REF_LABEL)[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={value === r}
                  onClick={() => onChange(r)}
                  className={cn(
                    "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px]",
                    value === r ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="size-2 rounded-full" style={{ background: resolve(r) }} />
                  {COLOR_REF_LABEL[r]}
                </button>
              ))
            : null}
          {allowNone ? (
            <button
              type="button"
              aria-pressed={value === null}
              onClick={() => onChange(null)}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10.5px]",
                value === null ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              None
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const groupHeading = "px-2.5 pt-2 pb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground";

/** Insert a token or a conditional block where the cursor is. */
export const TokenMenu = ({
  onInsert,
  tokens,
  samples,
  groups,
}: {
  onInsert: (snippet: string) => void;
  /** The catalogue the server offers for this event -- the fixed tokens and the guest-list columns. */
  tokens: DesignToken[];
  samples: Record<string, string>;
  groups: TokenGroup[];
}) => {
  const fields = tokens.filter((t) => t.group === "Guest fields");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="xs">
          Insert token ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[420px] w-[300px] overflow-y-auto">
        {groups.map((g, gi) => (
          <React.Fragment key={g}>
            {gi ? <DropdownMenuSeparator /> : null}
            <div className={groupHeading}>{g}</div>
            {tokens
              .filter((t) => t.group === g)
              .map((t) => (
                <DropdownMenuItem key={t.key} onSelect={() => onInsert(`{{${t.key}}}`)}>
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="text-[12.5px]">{t.label}</span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">{samples[t.key] || t.sample}</span>
                  </span>
                </DropdownMenuItem>
              ))}
          </React.Fragment>
        ))}
        {fields.length ? (
          <>
            <DropdownMenuSeparator />
            <div className={groupHeading}>Registration form fields</div>
            {fields.map((f) => (
              <DropdownMenuItem key={f.key} onSelect={() => onInsert(`{{${f.key}}}`)}>
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-[12.5px]">{f.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{f.key}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <div className={groupHeading}>Blocks</div>
        <DropdownMenuItem onSelect={() => onInsert("{% if organization %}{{organization}}{% endif %}")}>
          Only when they have an organisation
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onInsert("{{event_time}}{% if event_end_time %} – {{event_end_time}}{% endif %}")}>
          Start – end time
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onInsert("{% if team_name %}Team {{team_name}}{% else %}Individual{% endif %}")}>
          Team, or a fallback
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onInsert("{{attendee_name | upper}}")}>A token in capitals</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
