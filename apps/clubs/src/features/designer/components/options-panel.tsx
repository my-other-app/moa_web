"use client";

import { Button, CardLabel, FigurePanel, Input, NativeSelect, Notice, Switch, Textarea, cn } from "@moa/ui";
import { CheckIcon, ImagePlusIcon, Trash2Icon } from "lucide-react";
import * as React from "react";

import { IMAGE_ACCEPT } from "@/lib/images";

import type { Artwork, ArtworkField } from "../api";
import {
  accentAgainst,
  accentContrast,
  bindingOf,
  choicesOf,
  contrastRatio,
  isHex,
  MAX_FIXED_TEXT,
  minContrastOf,
  OPTION_GROUPS,
  optionGroup,
  optionKind,
  type QuestionField,
  sentence,
  type Slot,
  slotLabel,
} from "../presets";
import type { Binding, BindingSource, DesignInfo, DesignOption, PresetChoice } from "../schemas";
import { Busy, Section } from "./fields";
import { ui } from "./kit";

/**
 * A ready design's settings, one short section each: its colour, its
 * wording, who signs it, its pictures, how it prints, and where each
 * optional field comes from. Every change is a new draft the preview
 * follows; nothing is saved from here -- except a picture, which is the
 * design's artwork and is stored when it is uploaded.
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
  const against = accentAgainst(design)[0];
  const low = ratio !== null && ratio < minContrastOf(design);
  // A light page wants a darker accent, a dark one a lighter accent.
  const better = against && contrastRatio(against, "#FFFFFF") > contrastRatio(against, "#000000") ? "lighter" : "darker";
  const same = (a: string, b: string | null | undefined) => isHex(b) && a.toUpperCase() === b.toUpperCase();
  const custom = isHex(value) && !accent.suggestions.some((s) => same(s, value));
  return (
    <Section title="Colour">
      <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap items-center gap-2">
        {accent.suggestions.map((s) => {
          const on = same(s, value);
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
            value={isHex(value) ? value.toLowerCase() : accent.default.toLowerCase()}
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

/** The design's lines in the club's own words: one field a line, empty for the wording above. */
const LinesField = ({ option, value, onChange, problems }: { option: DesignOption; value: unknown; onChange: (v: unknown) => void; problems: Map<string, string> }) => {
  const lines = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const max = option.maxLength ?? 200;
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
      <legend className={cn(ui.label, "mb-0")}>Your own words</legend>
      <p className={cn(ui.note, "-mt-1 m-0")}>Leave a line empty to keep the wording above.</p>
      {(option.slots ?? []).map((slot) => {
        const id = fieldId(`options.${option.key}.${slot}`);
        const problem = problems.get(`options.${option.key}.${slot}`);
        const text = typeof lines[slot] === "string" ? (lines[slot] as string) : "";
        return (
          <div key={slot} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={id} className="text-ink-2 mb-1 block text-[12px] font-medium">
                {slotLabel({ key: slot })}
              </label>
              {text ? <span className={cn("font-mono text-[10.5px] tabular-nums", text.length > max ? "text-refuse" : "text-ink-3")}>{text.length}/{max}</span> : null}
            </div>
            <Textarea
              id={id}
              rows={slot === "statement" ? 3 : 1}
              value={text}
              aria-invalid={!!problem}
              onChange={(e) => onChange({ ...lines, [slot]: e.target.value })}
            />
            <Problem id={`${id}-problem`} message={problem} />
          </div>
        );
      })}
    </fieldset>
  );
};

const OptionField = ({ option, value, onChange, problem }: { option: DesignOption; value: unknown; onChange: (v: unknown) => void; problem?: string }) => {
  const kind = optionKind(option);
  const id = fieldId(`options.${option.key}`);
  const described = problem ? `${id}-problem` : option.hint ? `${id}-hint` : undefined;
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

// ─── Pictures ───────────────────────────────────────────────────────────

/** The pictures a certificate can carry, by the field its design prints them in. */
const PICTURES: { token: string; field: ArtworkField; label: string; hint: string }[] = [
  { token: "logo_src", field: "logo", label: "Logo", hint: "Your club's logo unless you upload another." },
  { token: "signature_src", field: "signature_1", label: "Signature", hint: "A scan on a plain or clear background. Without one the line is left to sign by hand." },
  { token: "second_signature_src", field: "signature_2", label: "Second signature", hint: "For the second signatory." },
];

export interface ArtworkProps {
  urls: Artwork | undefined;
  /** Which picture is uploading now. */
  busy: ArtworkField | null;
  onSave: (field: ArtworkField, file: File | null) => void;
}

const Picture = ({ label, hint, url, busy, onPick, onRemove }: { label: string; hint: string; url: string | null; busy: boolean; onPick: (f: File) => void; onRemove: () => void }) => {
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <div className="min-w-0">
      <span className={ui.label}>{label}</span>
      <div className="flex items-center gap-2">
        <span className="border-line bg-sunken grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- an upload shown back as it is
            <img src={url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-ink-3 text-[10.5px]">None</span>
          )}
        </span>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Busy on /> : <ImagePlusIcon />} {url ? "Replace" : "Upload"}
          <span className="sr-only"> {label.toLowerCase()}</span>
        </Button>
        {url ? (
          <Button size="sm" variant="ghost" disabled={busy} aria-label={`Remove the ${label.toLowerCase()}`} onClick={onRemove}>
            <Trash2Icon />
          </Button>
        ) : null}
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          aria-label={`${label} file`}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onPick(f);
          }}
        />
      </div>
      <p className={cn(ui.note, "m-0 mt-1")}>{hint}</p>
    </div>
  );
};

/** A certificate's logo and signatures: the event's artwork, stored as soon as it is uploaded. */
const PicturesSection = ({ design, artwork, clubScope }: { design: DesignInfo; artwork: ArtworkProps | null; clubScope: boolean }) => {
  const tokens = new Set(design.tokens.map((t) => t.key));
  const shown = PICTURES.filter((p) => tokens.has(p.token));
  if (!shown.length) return null;
  return (
    <Section title="Pictures">
      {clubScope || !artwork ? (
        <p className={cn(ui.note, "m-0")}>Your club&apos;s logo is used. Signatures are uploaded on each event&apos;s certificate design.</p>
      ) : (
        <>
          {shown.map((p) => (
            <Picture
              key={p.field}
              label={p.label}
              hint={p.hint}
              url={artwork.urls?.[p.field] ?? null}
              busy={artwork.busy === p.field}
              onPick={(f) => artwork.onSave(p.field, f)}
              onRemove={() => artwork.onSave(p.field, null)}
            />
          ))}
          <p className={cn(ui.note, "m-0")}>Pictures are saved for this event as soon as they upload.</p>
        </>
      )}
    </Section>
  );
};

// ─── Fields ─────────────────────────────────────────────────────────────

const SOURCES: { value: BindingSource; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "text", label: "Fixed text" },
  { value: "field", label: "Sign-up question" },
  { value: "hidden", label: "Hide" },
];

const BindingRow = ({ slot, binding, fields, onChange, problem }: { slot: Slot; binding: Binding; fields: QuestionField[]; onChange: (b: Binding) => void; problem?: string }) => {
  const id = fieldId(`bindings.${slot.key}`);
  // A picture can only be left as it is or hidden.
  const sources = slot.image ? SOURCES.filter((s) => s.value === "auto" || s.value === "hidden") : SOURCES;
  return (
    <li className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`${id}-source`} className="text-ink min-w-0 truncate text-[13px] font-medium">
          {slot.label}
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
          {sources.map((s) => (
            <option key={s.value} value={s.value} disabled={s.value === "field" && !fields.length}>
              {s.value === "field" && !fields.length ? "Sign-up question (none yet)" : s.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {binding.source === "text" ? (
        <Input
          aria-label={`${slot.label} text`}
          className="input-sm"
          value={binding.value ?? ""}
          maxLength={MAX_FIXED_TEXT + 20}
          aria-invalid={!!problem}
          onChange={(e) => onChange({ source: "text", value: e.target.value })}
        />
      ) : binding.source === "field" ? (
        <NativeSelect aria-label={`${slot.label} question`} size="sm" value={binding.value ?? ""} aria-invalid={!!problem} onChange={(e) => onChange({ source: "field", value: e.target.value })}>
          <option value="">Pick a question</option>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </NativeSelect>
      ) : binding.source === "auto" ? (
        <p className={cn(ui.note, "m-0")}>{slot.auto ? sentence(slot.auto) : "Left off: there is nothing to fill it with."}</p>
      ) : (
        <p className={cn(ui.note, "m-0")}>Not shown.</p>
      )}
      <Problem id={`${id}-problem`} message={problem} />
    </li>
  );
};

/** Where each optional field of the design comes from. */
export const BindingsEditor = ({
  slots,
  choice,
  fields,
  onChange,
  problems,
}: {
  slots: Slot[];
  choice: PresetChoice;
  fields: QuestionField[];
  onChange: (key: string, b: Binding) => void;
  problems: Map<string, string>;
}) =>
  slots.length ? (
    <Section title="Fields">
      <p className={cn(ui.note, "m-0 -mt-1.5")}>Where each optional field comes from. A field with nothing to show is left off, never printed empty.</p>
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
  ) : null;

// ─── The panel ──────────────────────────────────────────────────────────

export const OptionsPanel = ({
  design,
  choice,
  onChange,
  problems,
  fields,
  slots,
  artwork,
  clubScope,
  photoHint,
}: {
  design: DesignInfo;
  choice: PresetChoice;
  onChange: Patch;
  problems: Map<string, string>;
  fields: QuestionField[];
  /** The optional fields the club can bind. */
  slots: Slot[];
  /** A certificate's pictures, on an event; null elsewhere. */
  artwork: ArtworkProps | null;
  clubScope: boolean;
  /** Said above the settings on a photo badge when the form asks for no photo. */
  photoHint?: React.ReactNode;
}) => {
  const setOption = (key: string, v: unknown) => onChange((c) => ({ ...c, options: { ...c.options, [key]: v } }));
  // Pictures are the design's artwork (below), never an option.
  const groups = OPTION_GROUPS.map((g) => ({ ...g, options: design.options.filter((o) => optionKind(o) !== "image" && optionGroup(o) === g.key) })).filter(
    (g) => g.options.length
  );
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
          {g.options.map((o) =>
            optionKind(o) === "lines" ? (
              <LinesField key={o.key} option={o} value={choice.options[o.key]} onChange={(next) => setOption(o.key, next)} problems={problems} />
            ) : (
              <OptionField key={o.key} option={o} value={choice.options[o.key]} onChange={(next) => setOption(o.key, next)} problem={problems.get(`options.${o.key}`)} />
            )
          )}
        </Section>
      ))}
      {design.kind === "certificate" ? <PicturesSection design={design} artwork={artwork} clubScope={clubScope} /> : null}
      <BindingsEditor
        slots={slots}
        choice={choice}
        fields={fields}
        problems={problems}
        onChange={(key, b) => onChange((c) => ({ ...c, bindings: { ...c.bindings, [key]: b } }))}
      />
    </FigurePanel>
  );
};
