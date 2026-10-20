"use client";

import * as React from "react";
import { parseTicketTemplate } from "@moa/layout";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  NativeSelect,
  Segmented as KitSegmented,
} from "@moa/ui";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";

import { EMAIL_TOKEN_KEYS, type EmailToken } from "../schemas";

/**
 * The few class lists the email screens share, in the Meridian vocabulary:
 * an eyebrow for a section, a field label, the field itself, a quiet note.
 * Panels are `FigurePanel`; buttons are the kit's.
 */
export const ui = {
  heading: "eyebrow",
  label: "eyebrow mb-1.5 block",
  control: "input",
  small: "input input-sm",
  note: "text-ink-3 text-[11.5px] leading-[1.5]",
} as const;

export const Busy = ({ on }: { on: boolean }) =>
  on ? <Loader2Icon className="animate-spin" /> : null;

/** A value that settles `ms` after it stops changing. */
export function useDebounced<T>(value: T, ms = 400): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** The problems the editor shows for a piece of template text. */
export const problemsOf = (src: string): string[] =>
  parseTicketTemplate(src, EMAIL_TOKEN_KEYS).errors;

const TOKEN_GROUPS = [
  "Guest",
  "Ticket",
  "Event",
  "Links",
  "Club",
  "Certificate",
] as const;
const groupHeading = "eyebrow px-2 pt-2 pb-1";

/** Insert a token or a conditional block where the cursor is. */
export const TokenMenu = ({
  onInsert,
  tokens,
  samples,
  size = "xs",
}: {
  onInsert: (snippet: string) => void;
  tokens: EmailToken[];
  samples: Record<string, string>;
  size?: "xs" | "sm";
}) => {
  const fields = tokens.filter((t) => t.group === "Guest fields");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size={size}>
          Insert token <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[420px] w-[300px] overflow-y-auto"
      >
        {TOKEN_GROUPS.map((g, gi) => {
          const members = tokens.filter((t) => t.group === g);
          if (!members.length) return null;
          return (
            <React.Fragment key={g}>
              {gi ? <DropdownMenuSeparator /> : null}
              <div className={groupHeading}>{g}</div>
              {members.map((t) => (
                <DropdownMenuItem
                  key={t.key}
                  onSelect={() => onInsert(`{{${t.key}}}`)}
                >
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="text-[12.5px]">{t.label}</span>
                    <span className="text-ink-3 truncate font-mono text-[10px]">
                      {samples[t.key] || t.sample}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </React.Fragment>
          );
        })}
        {fields.length ? (
          <>
            <DropdownMenuSeparator />
            <div className={groupHeading}>Registration form fields</div>
            {fields.map((f) => (
              <DropdownMenuItem
                key={f.key}
                onSelect={() => onInsert(`{{${f.key}}}`)}
              >
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-[12.5px]">{f.label}</span>
                  <span className="text-ink-3 font-mono text-[10px]">
                    {f.key}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <div className={groupHeading}>Blocks</div>
        <DropdownMenuItem
          onSelect={() =>
            onInsert(
              "{% if certificate_url %}Your certificate: {{certificate_url}}{% endif %}",
            )
          }
        >
          Only when they hold a certificate
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onInsert("{% if venue %} at {{venue}}{% endif %}")}
        >
          The venue, when there is one
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onInsert("**{{first_name}}**")}>
          The first name in bold
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onInsert("[Open your ticket]({{ticket_url}})")}
        >
          A link to the ticket
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * Template text with a token menu that inserts at the cursor, and the
 * parser's verdict under it so a mistyped token is caught while typing.
 */
export const TemplateField = ({
  id,
  label,
  value,
  onChange,
  rows = 3,
  tokens,
  samples,
  placeholder,
  single,
  extra,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  tokens: EmailToken[];
  samples: Record<string, string>;
  placeholder?: string;
  /** One line: a subject, a label. */
  single?: boolean;
  /** Beside the token menu: "Write with AI". */
  extra?: React.ReactNode;
}) => {
  const ref = React.useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const insert = (snippet: string) => {
    const el = ref.current;
    const s = el?.selectionStart ?? value.length;
    const e = el?.selectionEnd ?? s;
    onChange(value.slice(0, s) + snippet + value.slice(e));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + snippet.length, s + snippet.length);
    });
  };
  const problems = problemsOf(value);
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-end justify-between gap-2">
        <label htmlFor={id} className="eyebrow">
          {label}
        </label>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {extra}
          <TokenMenu onInsert={insert} tokens={tokens} samples={samples} />
        </div>
      </div>
      {single ? (
        <input
          id={id}
          ref={ref as React.RefObject<HTMLInputElement>}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={ui.control}
        />
      ) : (
        <textarea
          id={id}
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(ui.control, "leading-[1.5]")}
        />
      )}
      {problems.length ? (
        <p className="text-refuse mt-1 text-[11.5px]">{problems[0]}</p>
      ) : null}
    </div>
  );
};

export const NumberField = ({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) => (
  <div className="min-w-0">
    <label htmlFor={id} className={ui.label}>
      {label}
    </label>
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n))
            onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
        }}
        className={cn(ui.control, "tabular-nums", suffix && "pr-8")}
      />
      {suffix ? (
        <span className="text-ink-3 pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[10.5px]">
          {suffix}
        </span>
      ) : null}
    </div>
  </div>
);

export const SelectField = <T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) => (
  <div className="min-w-0">
    <label htmlFor={id} className={ui.label}>
      {label}
    </label>
    <NativeSelect
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  </div>
);

export const Segmented = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) => (
  <div className="min-w-0">
    <span className={ui.label}>{label}</span>
    <KitSegmented
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      className="w-full"
    />
  </div>
);

const HEX = /^#[0-9a-f]{6}$/i;

/** A colour, or nothing ("inherit"), with a swatch and a hex box. */
export const ColorField = ({
  id,
  label,
  value,
  onChange,
  fallback,
  clearable,
}: {
  id: string;
  label: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  /** Shown in the swatch when the value is empty. */
  fallback: string;
  clearable?: boolean;
}) => {
  const [draft, setDraft] = React.useState(value ?? "");
  const [seen, setSeen] = React.useState(value ?? "");
  if ((value ?? "") !== seen) {
    setSeen(value ?? "");
    setDraft(value ?? "");
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={HEX.test(value ?? "") ? value! : fallback}
          onChange={(e) => onChange(e.target.value)}
          className="border-line size-9 shrink-0 cursor-pointer rounded-[var(--radius-md)] border bg-transparent p-0.5"
        />
        <input
          id={id}
          value={draft}
          placeholder={clearable ? "inherit" : fallback}
          onChange={(e) => {
            setDraft(e.target.value);
            if (HEX.test(e.target.value)) onChange(e.target.value);
            else if (clearable && e.target.value === "") onChange(null);
          }}
          className={cn(ui.control, "font-mono")}
        />
      </div>
    </div>
  );
};

export const Toggle = ({
  id,
  label,
  checked,
  onChange,
  note,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  note?: string;
}) => (
  <label
    htmlFor={id}
    className={cn(
      "flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-field)] border px-3 py-2 transition-colors",
      checked
        ? "border-brand-line bg-brand-soft"
        : "border-line hover:bg-sunken",
    )}
  >
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
    />
    <span className="min-w-0">
      <span className="text-ink block text-[13px]">{label}</span>
      {note ? <span className={cn(ui.note, "block")}>{note}</span> : null}
    </span>
  </label>
);
