"use client";

import { COLOR_REF_LABEL, type ColorRef, type TokenGroup } from "@moa/layout";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  NativeSelect,
  Segmented,
  cn,
} from "@moa/ui";
import { BracesIcon, ChevronDownIcon, Loader2Icon } from "lucide-react";
import * as React from "react";

import type { DesignToken } from "../schemas";
import { ui } from "./kit";

/** The spinner a button shows while its work is in flight. */
export const Busy = ({ on }: { on: boolean }) => (on ? <Loader2Icon className="animate-spin" /> : null);

/**
 * A titled group of fields inside a panel. The properties of a layer read as
 * a few short sections -- where it sits, what it says, how it looks -- rather
 * than one long column of inputs.
 */
export const Section = ({
  title,
  right,
  children,
  className,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={cn("border-line-soft flex flex-col gap-3 border-t px-4 py-3.5", className)}>
    {title || right ? (
      <div className="flex min-h-6 items-center justify-between gap-2">
        {title ? <h3 className="text-ink m-0 text-[12.5px] font-semibold">{title}</h3> : <span />}
        {right}
      </div>
    ) : null}
    {children}
  </section>
);

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
          className={cn(ui.control, suffix && "pr-9")}
        />
        {suffix ? (
          <span className="text-ink-3 pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[10.5px]">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
};

/** A short, fixed list: the kit's native select, under its label. */
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
    <NativeSelect
      id={id}
      size="sm"
      value={String(value)}
      disabled={disabled}
      onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  </div>
);

/** Two to four exclusive choices: the kit's segmented track, under its label. */
export const SegmentedField = <T extends string>({
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
    <Segmented label={text} value={value} options={options} onChange={onChange} />
  </div>
);

const HEX = /^#[0-9a-f]{6}$/i;
type Source = "fixed" | "none" | keyof typeof COLOR_REF_LABEL;

/**
 * A colour that can be fixed, or follow the club's brand or each guest's
 * ticket type -- one design, every type in its own colour. The swatch is the
 * picker; the select says where the colour comes from; a fixed colour shows
 * its hex to type into.
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
  const isRef = !!value && value in COLOR_REF_LABEL;
  const fixed = value && !isRef ? value : null;
  const shown = value ? resolve(value) : null;
  const [draft, setDraft] = React.useState(fixed ?? "");
  const [seen, setSeen] = React.useState(fixed);
  if (fixed !== seen) {
    setSeen(fixed);
    setDraft(fixed ?? "");
  }
  const sources: { value: Source; label: string }[] = [
    { value: "fixed", label: "Fixed colour" },
    ...(refs
      ? (Object.keys(COLOR_REF_LABEL) as (keyof typeof COLOR_REF_LABEL)[]).map((r) => ({ value: r as Source, label: COLOR_REF_LABEL[r] ?? r }))
      : []),
    ...(allowNone ? [{ value: "none" as Source, label: "None" }] : []),
  ];
  const source: Source = value === null ? "none" : isRef ? (value as Source) : "fixed";
  const choosing = sources.length > 1;
  const pick = (next: Source) => {
    if (next === "none") onChange(null);
    else if (next === "fixed") onChange(shown && HEX.test(shown) ? shown.toUpperCase() : "#000000");
    else onChange(next);
  };
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={ui.label}>
        {text}
      </label>
      <div className="flex items-center gap-1.5">
        <span
          className="border-line relative size-8 shrink-0 overflow-hidden rounded-[var(--radius-md)] border"
          // The swatch shows the design's own colour; "none" is drawn as a hatch in the chrome's colours.
          style={{ background: shown ?? "repeating-linear-gradient(45deg,var(--line) 0 4px,var(--surface) 4px 8px)" }}
        >
          <input
            type="color"
            aria-label={`${text} picker`}
            value={shown && HEX.test(shown) ? shown : "#000000"}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
        {choosing ? (
          <NativeSelect id={id} size="sm" value={source} onChange={(e) => pick(e.target.value as Source)} className="min-w-0 flex-1">
            {sources.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        {source === "fixed" ? (
          <input
            id={choosing ? undefined : id}
            aria-label={choosing ? `${text} hex` : undefined}
            value={draft}
            spellCheck={false}
            maxLength={7}
            onChange={(e) => {
              setDraft(e.target.value);
              const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
              if (HEX.test(v)) onChange(v.toUpperCase());
            }}
            onBlur={() => setDraft(fixed ?? "")}
            className={cn(ui.control, "font-mono uppercase", choosing ? "w-[96px] shrink-0" : "min-w-0 flex-1")}
          />
        ) : null}
      </div>
    </div>
  );
};

const groupHeading = "eyebrow px-2 pt-2 pb-1";

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
        <Button type="button" variant="secondary" size="xs">
          <BracesIcon /> Insert token <ChevronDownIcon />
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
                    <span className="text-ink text-[12.5px]">{t.label}</span>
                    <span className="text-ink-3 truncate font-mono text-[10.5px]">{samples[t.key] || t.sample}</span>
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
                  <span className="text-ink text-[12.5px]">{f.label}</span>
                  <span className="text-ink-3 font-mono text-[10.5px]">{f.key}</span>
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
