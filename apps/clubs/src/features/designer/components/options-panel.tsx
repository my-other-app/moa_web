"use client";

import { Button, CardLabel, FigurePanel, Input, NativeSelect, Notice, Switch, Textarea, cn } from "@moa/ui";
import { CheckIcon, ImagePlusIcon, Trash2Icon } from "lucide-react";
import * as React from "react";

import { IMAGE_ACCEPT } from "@/lib/images";

import {
  accentAgainst,
  accentContrast,
  bindableSlots,
  bindingOf,
  choicesOf,
  contrastRatio,
  isHex,
  MAX_FIXED_TEXT,
  MIN_ACCENT_CONTRAST,
  OPTION_GROUPS,
  optionGroup,
  optionKind,
  type QuestionField,
  slotLabel,
} from "../presets";
import type { Binding, BindingSource, DesignInfo, DesignOption, DesignSlot, PresetChoice } from "../schemas";
import { Busy, Section } from "./fields";
import { ui } from "./kit";

/**
 * A ready design's settings, one short section each: its colour, its
 * wording, who signs it, its pictures, how it prints, and where each
 * optional field comes from. Every change is a new draft the preview
 * follows; nothing is saved from here.
 */

type Patch = (fn: (c: PresetChoice) => PresetChoice) => void;

const Problem = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={id} role="alert" className="text-refuse m-0 mt-1 text-[11.5px] leading-[1.45]">
      {message}
    </p>
  ) : null;

const fieldId = (path: string) => `preset-${path.replace(/[^a-z0-9]+/gi, "-")}`;

// ─── Colour ─────────────────────────────────────────────────────────────

const AccentField = ({ design, value, onChange, problem }: { design: DesignInfo; value: string | null | undefined; onChange: (v: string) => void; problem?: string }) => {
  const accent = design.accent!;
  const [draft, setDraft] = React.useState(value ?? "");
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value ?? "");
  }
  const ratio = accentContrast(design, value);
  const against = accentAgainst(design);
  const low = ratio !== null && ratio < MIN_ACCENT_CONTRAST;
  // A light page wants a darker accent, a dark one a lighter accent.
  const better = against && contrastRatio(against, "#FFFFFF") > contrastRatio(against, "#000000") ? "lighter" : "darker";
  const custom = isHex(value) && !accent.suggestions.some((s) => s.toUpperCase() === value.toUpperCase());
  return (
    <Section title="Colour">
      <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap items-center gap-2">
        {accent.suggestions.map((s) => {
          const on = isHex(value) && s.toUpperCase() === value.toUpperCase();
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={s.toUpperCase()}
              title={s.toUpperCase()}
              onClick={() => onChange(s.toUpperCase())}
              className={cn(
                "grid size-8 place-items-center rounded-full border transition-shadow",
                on ? "border-ink ring-ink/20 ring-2" : "border-line hover:ring-line hover:ring-2"
              )}
              style={{ background: s }}
            >
              {on ? (
                <CheckIcon className="size-4" style={{ color: contrastRatio(s, "#FFFFFF") >= contrastRatio(s, "#000000") ? "#FFFFFF" : "#000000" }} aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
        <span
          className={cn("border-line relative size-8 shrink-0 overflow-hidden rounded-full border", custom && "border-ink ring-ink/20 ring-2")}
          style={{ background: isHex(value) ? value : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
        >
          <input
            type="color"
            aria-label="Custom colour"
            value={isHex(value) ? value : accent.default}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
        <input
          id={fieldId("accent")}
          aria-label="Accent colour as hex"
          aria-invalid={!!problem}
          aria-describedby={problem ? `${fieldId("accent")}-problem` : undefined}
          value={draft}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => {
            const raw = e.target.value.trim();
            const v = raw.startsWith("#") ? raw : `#${raw}`;
            setDraft(e.target.value);
            onChange(isHex(v) ? v.toUpperCase() : raw);
          }}
          className={cn(ui.control, "w-[96px] font-mono uppercase")}
        />
      </div>
      <Problem id={`${fieldId("accent")}-problem`} message={problem} />
      {low ? (
        <Notice tone="caution" tag="Contrast">
          This colour is hard to see on this design ({ratio.toFixed(1)}:1). Try a {better} one, or one of the suggestions.
        </Notice>
      ) : null}
      {accent.note ? <p className={cn(ui.note, "m-0")}>{accent.note}</p> : null}
    </Section>
  );
};

// ─── Options ────────────────────────────────────────────────────────────

const ImageOption = ({
  option,
  value,
  url,
  onUpload,
  onClear,
  problem,
}: {
  option: DesignOption;
  value: unknown;
  url: string | null;
  onUpload: (file: File) => Promise<void>;
  onClear: () => void;
  problem?: string;
}) => {
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const id = fieldId(`options.${option.key}`);
  return (
    <div className="min-w-0">
      <span className={ui.label} id={`${id}-label`}>
        {option.label}
      </span>
      <div className="flex items-center gap-2">
        <span className="border-line bg-sunken grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- an upload shown back as it is
            <img src={url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-ink-3 text-[10.5px]">{value ? "Uploaded" : "None"}</span>
          )}
        </span>
        <Button size="sm" variant="secondary" disabled={busy} aria-describedby={`${id}-label`} onClick={() => input.current?.click()}>
          {busy ? <Busy on /> : <ImagePlusIcon />} {value ? "Replace" : "Upload"}
        </Button>
        {value ? (
          <Button size="sm" variant="ghost" aria-label={`Remove ${option.label.toLowerCase()}`} onClick={onClear}>
            <Trash2Icon />
          </Button>
        ) : null}
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          aria-label={`${option.label} file`}
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            try {
              await onUpload(f);
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      {option.hint ? <p className={cn(ui.note, "m-0 mt-1")}>{option.hint}</p> : null}
      <Problem id={`${id}-problem`} message={problem} />
    </div>
  );
};

const OptionField = ({
  option,
  value,
  onChange,
  problem,
  image,
}: {
  option: DesignOption;
  value: unknown;
  onChange: (v: unknown) => void;
  problem?: string;
  image: { url: string | null; upload: (f: File) => Promise<void> };
}) => {
  const kind = optionKind(option);
  const id = fieldId(`options.${option.key}`);
  const described = problem ? `${id}-problem` : option.hint ? `${id}-hint` : undefined;
  if (kind === "image")
    return <ImageOption option={option} value={value} url={image.url} onUpload={image.upload} onClear={() => onChange(null)} problem={problem} />;
  if (kind === "toggle")
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="text-ink block text-[13px] font-medium">
            {option.label}
          </label>
          {option.hint ? (
            <p id={`${id}-hint`} className={cn(ui.note, "m-0")}>
              {option.hint}
            </p>
          ) : null}
        </div>
        <Switch id={id} checked={value === true} onCheckedChange={(on) => onChange(on)} aria-describedby={described} />
      </div>
    );
  const text = typeof value === "string" ? value : "";
  const count = option.maxLength ? (
    <span className={cn("font-mono text-[10.5px] tabular-nums", text.length > option.maxLength ? "text-refuse" : "text-ink-3")}>
      {text.length}/{option.maxLength}
    </span>
  ) : null;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={ui.label}>
          {option.label}
        </label>
        {count}
      </div>
      {kind === "choice" ? (
        <NativeSelect id={id} size="sm" value={text} aria-invalid={!!problem} aria-describedby={described} onChange={(e) => onChange(e.target.value)}>
          {choicesOf(option).map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      ) : kind === "textarea" ? (
        <Textarea id={id} rows={3} value={text} aria-invalid={!!problem} aria-describedby={described} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id} value={text} aria-invalid={!!problem} aria-describedby={described} onChange={(e) => onChange(e.target.value)} className="input-sm" />
      )}
      {option.hint && !problem ? (
        <p id={`${id}-hint`} className={cn(ui.note, "m-0 mt-1")}>
          {option.hint}
        </p>
      ) : null}
      <Problem id={`${id}-problem`} message={problem} />
    </div>
  );
};

// ─── Fields ─────────────────────────────────────────────────────────────

const SOURCES: { value: BindingSource; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "text", label: "Fixed text" },
  { value: "field", label: "Sign-up question" },
  { value: "hidden", label: "Hide" },
];

const BindingRow = ({
  slot,
  binding,
  fields,
  onChange,
  problem,
}: {
  slot: DesignSlot;
  binding: Binding;
  fields: QuestionField[];
  onChange: (b: Binding) => void;
  problem?: string;
}) => {
  const label = slotLabel(slot);
  const id = fieldId(`bindings.${slot.key}`);
  const autoNote = slot.auto ? `Automatic: ${slot.auto}.` : "Automatic: hidden, as we have nothing to fill it with.";
  return (
    <li className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`${id}-source`} className="text-ink min-w-0 truncate text-[13px] font-medium">
          {label}
        </label>
        <NativeSelect
          id={`${id}-source`}
          size="sm"
          className="w-[168px] shrink-0"
          value={binding.source}
          onChange={(e) => {
            const source = e.target.value as BindingSource;
            onChange(source === "field" ? { source, value: fields[0]?.key ?? null } : source === "text" ? { source, value: "" } : { source });
          }}
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value} disabled={s.value === "field" && !fields.length}>
              {s.value === "field" && !fields.length ? "Sign-up question (none yet)" : s.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {binding.source === "text" ? (
        <Input
          aria-label={`${label} text`}
          className="input-sm"
          value={binding.value ?? ""}
          maxLength={MAX_FIXED_TEXT + 20}
          aria-invalid={!!problem}
          onChange={(e) => onChange({ source: "text", value: e.target.value })}
        />
      ) : binding.source === "field" ? (
        <NativeSelect
          aria-label={`${label} question`}
          size="sm"
          value={binding.value ?? ""}
          aria-invalid={!!problem}
          onChange={(e) => onChange({ source: "field", value: e.target.value })}
        >
          <option value="">Pick a question</option>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </NativeSelect>
      ) : binding.source === "auto" ? (
        <p className={cn(ui.note, "m-0")}>{autoNote}</p>
      ) : (
        <p className={cn(ui.note, "m-0")}>Not shown.</p>
      )}
      <Problem id={`${id}-problem`} message={problem} />
    </li>
  );
};

/** Where each optional field of the design comes from. */
export const BindingsEditor = ({
  design,
  choice,
  fields,
  onChange,
  problems,
}: {
  design: DesignInfo;
  choice: PresetChoice;
  fields: QuestionField[];
  onChange: (key: string, b: Binding) => void;
  problems: Map<string, string>;
}) => {
  const slots = bindableSlots(design);
  if (!slots.length) return null;
  return (
    <Section title="Fields">
      <p className={cn(ui.note, "-mt-1.5 m-0")}>Where each optional field comes from. A field with nothing to show is left off, never printed empty.</p>
      <ul aria-label="Fields" className="divide-line-soft m-0 list-none divide-y p-0">
        {slots.map((slot) => (
          <BindingRow
            key={slot.key}
            slot={slot}
            binding={bindingOf(choice, slot.key)}
            fields={fields}
            onChange={(b) => onChange(slot.key, b)}
            problem={problems.get(`bindings.${slot.key}`)}
          />
        ))}
      </ul>
    </Section>
  );
};

// ─── The panel ──────────────────────────────────────────────────────────

export const OptionsPanel = ({
  design,
  choice,
  onChange,
  problems,
  fields,
  imageUrl,
  onUpload,
  photoHint,
}: {
  design: DesignInfo;
  choice: PresetChoice;
  onChange: Patch;
  problems: Map<string, string>;
  fields: QuestionField[];
  /** An uploaded picture's address, by the key an option holds. */
  imageUrl: (key: string) => string | null;
  /** Upload a picture for an option; the key it answers is what the option saves. */
  onUpload: (file: File) => Promise<{ key: string; url: string } | null>;
  /** Said above the settings on a photo badge when the form asks for no photo. */
  photoHint?: React.ReactNode;
}) => {
  const setOption = (key: string, v: unknown) => onChange((c) => ({ ...c, options: { ...c.options, [key]: v } }));
  const groups = OPTION_GROUPS.map((g) => ({ ...g, options: design.options.filter((o) => optionGroup(o) === g.key) })).filter((g) => g.options.length);
  return (
    <FigurePanel role="region" aria-label="Settings" className="p-0">
      <div className="px-4 pt-4 pb-3.5">
        <CardLabel>Settings</CardLabel>
        <p className="text-ink m-0 mt-1.5 text-[14px] font-semibold">{design.name}</p>
        {photoHint ? <div className="mt-3">{photoHint}</div> : null}
      </div>
      {design.accent ? (
        <AccentField design={design} value={choice.accent} onChange={(v) => onChange((c) => ({ ...c, accent: v }))} problem={problems.get("accent")} />
      ) : null}
      {groups.map((g) => (
        <Section key={g.key} title={g.title}>
          {g.options.map((o) => {
            const v = choice.options[o.key];
            return (
              <OptionField
                key={o.key}
                option={o}
                value={v}
                onChange={(next) => setOption(o.key, next)}
                problem={problems.get(`options.${o.key}`)}
                image={{
                  url: typeof v === "string" && v ? imageUrl(v) : null,
                  upload: async (f) => {
                    const res = await onUpload(f);
                    if (res) setOption(o.key, res.key);
                  },
                }}
              />
            );
          })}
        </Section>
      ))}
      <BindingsEditor
        design={design}
        choice={choice}
        fields={fields}
        problems={problems}
        onChange={(key, b) => onChange((c) => ({ ...c, bindings: { ...c.bindings, [key]: b } }))}
      />
    </FigurePanel>
  );
};
