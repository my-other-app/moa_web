"use client";

import { type ColorV2, type FillV2, type FontFamilyV2, type GradientStop } from "@moa/layout";
import { Button, IconButton, NativeSelect, Popover, PopoverContent, PopoverTrigger, cn } from "@moa/ui";
import { CheckIcon, ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react";
import * as React from "react";

import { NumberField } from "../components/fields";
import { ui } from "../components/kit";

/**
 * The board's own fields: a colour that may follow the accent or the brand,
 * a fill (solid or a gradient with its stops), and the font picker that
 * shows every face in itself. The plain ones (numbers, selects, sections)
 * are the canvas editor's, shared.
 */

// ─── Colour ─────────────────────────────────────────────────────────────

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX8 = /^#[0-9a-f]{8}$/i;

/** Where a colour comes from: a fixed value, the document's accent, the brand, the ticket type. */
export const COLOR_SOURCES = [
  { value: "fixed", label: "Fixed colour" },
  { value: "var:accent", label: "Accent" },
  { value: "brand.primary", label: "Club primary" },
  { value: "brand.secondary", label: "Club secondary" },
  { value: "ticket_type", label: "Ticket type colour" },
] as const;
type Source = (typeof COLOR_SOURCES)[number]["value"] | "none";

/** What a colour reference paints in the editor: the accent, the club's colours, a sample ticket type. */
export interface ColorContext {
  accent: string;
  primary: string;
  secondary: string;
}

export const resolveColorV2 = (c: ColorV2, ctx: ColorContext): string => {
  if (c === "var:accent") return ctx.accent;
  if (c === "brand.primary" || c === "ticket_type") return ctx.primary;
  if (c === "brand.secondary") return ctx.secondary;
  return c;
};

/** The swatch's paint: the colour, or a hatch for none. */
const swatch = (shown: string | null) => shown ?? "repeating-linear-gradient(45deg,var(--line) 0 4px,var(--surface) 4px 8px)";

export const ColorFieldV2 = ({
  id,
  label: text,
  value,
  onChange,
  ctx,
  allowNone,
  refs = true,
  compact,
}: {
  id: string;
  label: string;
  value: ColorV2 | null;
  onChange: (v: ColorV2 | null) => void;
  ctx: ColorContext;
  allowNone?: boolean;
  /** Offer the accent and the brand; off for colours that must stay fixed. */
  refs?: boolean;
  /** No label above: the label is read by assistive tech only. */
  compact?: boolean;
}) => {
  const source: Source = value === null ? "none" : HEX6.test(value) || HEX8.test(value) ? "fixed" : (value as Source);
  const fixed = source === "fixed" ? value : null;
  const shown = value ? resolveColorV2(value, ctx) : null;
  const [draft, setDraft] = React.useState(fixed ?? "");
  const [seen, setSeen] = React.useState(fixed);
  if (fixed !== seen) {
    setSeen(fixed);
    setDraft(fixed ?? "");
  }
  const sources: { value: Source; label: string }[] = [
    ...(refs ? COLOR_SOURCES : COLOR_SOURCES.slice(0, 1)),
    ...(allowNone ? [{ value: "none" as Source, label: "None" }] : []),
  ];
  const pick = (next: Source) => {
    if (next === "none") onChange(null);
    else if (next === "fixed") onChange(shown && (HEX6.test(shown) || HEX8.test(shown)) ? shown.toUpperCase() : "#000000");
    else onChange(next);
  };
  const choosing = sources.length > 1;
  return (
    <div className="min-w-0">
      {compact ? null : (
        <label htmlFor={id} className={ui.label}>
          {text}
        </label>
      )}
      <div className="flex items-center gap-1.5">
        <span className="border-line relative size-8 shrink-0 overflow-hidden rounded-[var(--radius-md)] border" style={{ background: swatch(shown) }}>
          <input
            type="color"
            aria-label={`${text} picker`}
            value={shown && HEX6.test(shown.slice(0, 7)) ? shown.slice(0, 7) : "#000000"}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
        {choosing ? (
          <NativeSelect
            id={id}
            aria-label={compact ? text : undefined}
            size="sm"
            value={source}
            onChange={(e) => pick(e.target.value as Source)}
            className="min-w-0 flex-1"
          >
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
            aria-label={choosing || compact ? `${text} hex` : undefined}
            value={draft}
            spellCheck={false}
            maxLength={9}
            onChange={(e) => {
              setDraft(e.target.value);
              const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
              if (HEX6.test(v) || HEX8.test(v)) onChange(v.toUpperCase());
            }}
            onBlur={() => setDraft(fixed ?? "")}
            className={cn(ui.control, "font-mono uppercase", choosing ? "w-[104px] shrink-0" : "min-w-0 flex-1")}
          />
        ) : null}
      </div>
    </div>
  );
};

// ─── Fill ───────────────────────────────────────────────────────────────

type FillType = "none" | FillV2["type"];
const FILL_TYPES: { value: FillType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "solid", label: "Solid" },
  { value: "linear", label: "Linear gradient" },
  { value: "radial", label: "Radial gradient" },
];

const stopsOf = (f: FillV2 | null, ctx: ColorContext): GradientStop[] => {
  if (f && f.type !== "solid") return f.stops;
  const base = f?.type === "solid" ? f.color : "var:accent";
  return [
    { offset: 0, color: base },
    { offset: 1, color: resolveColorV2(base, ctx) === "#FFFFFF" ? "#000000" : "#FFFFFF" },
  ];
};

/** The fill drawn in the editor: what the builder would paint, for the preview strip. */
export const cssFill = (f: FillV2 | null, ctx: ColorContext): string | undefined => {
  if (!f) return undefined;
  if (f.type === "solid") return resolveColorV2(f.color, ctx);
  const stops = f.stops.map((s) => `${resolveColorV2(s.color, ctx)} ${round(s.offset * 100)}%`).join(", ");
  return f.type === "linear" ? `linear-gradient(${f.angle}deg, ${stops})` : `radial-gradient(circle at ${round(f.cx * 100)}% ${round(f.cy * 100)}%, ${stops})`;
};
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * A fill: none, one colour, or a gradient. A gradient lists its stops, two
 * to six, each a colour and where it sits; a linear one has an angle, a
 * radial one a centre.
 */
export const FillField = ({
  id,
  label: text,
  value,
  onChange,
  ctx,
  allowNone = true,
}: {
  id: string;
  label: string;
  value: FillV2 | null;
  onChange: (v: FillV2 | null) => void;
  ctx: ColorContext;
  allowNone?: boolean;
}) => {
  const type: FillType = value?.type ?? "none";
  const setType = (t: FillType) => {
    if (t === type) return;
    if (t === "none") return onChange(null);
    if (t === "solid") return onChange({ type: "solid", color: value?.type === "solid" ? value.color : (stopsOf(value, ctx)[0]?.color ?? "#000000") });
    const stops = stopsOf(value, ctx);
    onChange(t === "linear" ? { type: "linear", angle: value?.type === "linear" ? value.angle : 90, stops } : { type: "radial", cx: 0.5, cy: 0.5, stops });
  };
  const setStops = (stops: GradientStop[]) => value && value.type !== "solid" && onChange({ ...value, stops });
  return (
    <div className="flex flex-col gap-2.5">
      <div className="min-w-0">
        <label htmlFor={id} className={ui.label}>
          {text}
        </label>
        <NativeSelect id={id} size="sm" value={type} onChange={(e) => setType(e.target.value as FillType)}>
          {FILL_TYPES.filter((t) => allowNone || t.value !== "none").map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {value?.type === "solid" ? <ColorFieldV2 id={`${id}-color`} label={`${text} colour`} value={value.color} onChange={(c) => c && onChange({ ...value, color: c })} ctx={ctx} compact /> : null}
      {value && value.type !== "solid" ? (
        <>
          <span aria-hidden="true" className="border-line h-5 rounded-[var(--radius-md)] border" style={{ background: cssFill(value, ctx) }} />
          <div className="grid grid-cols-2 gap-2.5">
            {value.type === "linear" ? (
              <NumberField id={`${id}-angle`} label="Angle" value={value.angle} min={-360} max={360} suffix="°" onChange={(angle) => onChange({ ...value, angle })} />
            ) : (
              <>
                <NumberField id={`${id}-cx`} label="Centre across" value={round(value.cx * 100)} min={0} max={100} suffix="%" onChange={(v) => onChange({ ...value, cx: v / 100 })} />
                <NumberField id={`${id}-cy`} label="Centre down" value={round(value.cy * 100)} min={0} max={100} suffix="%" onChange={(v) => onChange({ ...value, cy: v / 100 })} />
              </>
            )}
          </div>
          <ol aria-label={`${text} stops`} className="m-0 flex list-none flex-col gap-2 p-0">
            {value.stops.map((s, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_76px_auto] items-end gap-1.5">
                <ColorFieldV2
                  id={`${id}-stop-${i}`}
                  label={`Stop ${i + 1} colour`}
                  value={s.color}
                  onChange={(c) => c && setStops(value.stops.map((x, j) => (j === i ? { ...x, color: c } : x)))}
                  ctx={ctx}
                  compact
                />
                <NumberField
                  id={`${id}-stop-${i}-at`}
                  label={`Stop ${i + 1} at`}
                  value={round(s.offset * 100)}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={(v) => setStops(value.stops.map((x, j) => (j === i ? { ...x, offset: v / 100 } : x)))}
                />
                <IconButton
                  label={`Remove stop ${i + 1}`}
                  size="sm"
                  variant="quiet"
                  disabled={value.stops.length <= 2}
                  onClick={() => setStops(value.stops.filter((_, j) => j !== i))}
                >
                  <Trash2Icon />
                </IconButton>
              </li>
            ))}
          </ol>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            className="self-start"
            disabled={value.stops.length >= 6}
            onClick={() => {
              const last = value.stops.at(-1)!;
              const prev = value.stops.at(-2) ?? last;
              setStops([...value.stops.slice(0, -1), { ...prev, offset: round((prev.offset + last.offset) / 2) }, last]);
            }}
          >
            <PlusIcon /> Add a stop
          </Button>
        </>
      ) : null}
    </div>
  );
};

// ─── Fonts ──────────────────────────────────────────────────────────────

export const WEIGHT_NAME: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black",
};
export const weightLabel = (w: number) => `${WEIGHT_NAME[w] ?? w} · ${w}`;

/** A face the family has that is nearest the one asked for: same style if it has any, then the nearest weight. */
export const nearestFace = (font: FontFamilyV2, weight: number, style: "normal" | "italic"): { weight: number; style: "normal" | "italic" } => {
  const inStyle = style === "italic" ? font.italic : font.normal;
  const s: "normal" | "italic" = inStyle.length ? style : font.normal.length ? "normal" : "italic";
  const ws = s === "italic" ? font.italic : font.normal;
  const w = [...ws].sort((a, b) => Math.abs(a - weight) - Math.abs(b - weight) || a - b)[0] ?? 400;
  return { weight: w, style: s };
};

/**
 * Pick a family from the list, each one shown in itself. A search narrows
 * the list; arrows move, Enter picks, Escape closes.
 */
export const FontPicker = ({
  id,
  value,
  fonts,
  onChange,
  sample = "Asha Rao",
}: {
  id: string;
  value: string;
  fonts: readonly FontFamilyV2[];
  onChange: (family: string) => void;
  sample?: string;
}) => {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listId = `${id}-list`;
  const shown = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? fonts.filter((f) => f.family.toLowerCase().includes(s)) : [...fonts];
  }, [fonts, q]);
  const choose = (family: string) => {
    onChange(family);
    setOpen(false);
    setQ("");
  };
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={ui.label}>
        Font
      </label>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setActive(Math.max(0, fonts.findIndex((f) => f.family === value)));
        }}
      >
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(ui.control, "flex w-full items-center justify-between gap-2 text-left")}
          >
            <span className="truncate" style={{ fontFamily: `'${value}'` }}>
              {value}
            </span>
            <ChevronDownIcon className="text-ink-3 size-4 shrink-0" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[300px] p-2">
          <input
            autoFocus
            aria-label="Search fonts"
            aria-controls={listId}
            aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            placeholder="Search fonts"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(shown.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter" && shown[active]) {
                e.preventDefault();
                choose(shown[active].family);
              }
            }}
            className={cn(ui.control, "mb-2 w-full")}
          />
          <ul id={listId} role="listbox" aria-label="Fonts" className="scroll-thin m-0 max-h-[300px] list-none overflow-y-auto p-0">
            {shown.map((f, i) => (
              <li
                key={f.family}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={f.family === value}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(f.family)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-md)] px-2 py-1.5", i === active && "bg-sunken")}
              >
                <span className="min-w-0">
                  <span className="text-ink block truncate text-[16px] leading-tight" style={{ fontFamily: `'${f.family}'`, fontWeight: f.normal[0] ?? f.italic[0], fontStyle: f.normal.length ? "normal" : "italic" }}>
                    {sample}
                  </span>
                  <span className="text-ink-3 block truncate text-[11px]">{f.family}</span>
                </span>
                {f.family === value ? <CheckIcon className="text-brand size-4 shrink-0" aria-hidden="true" /> : null}
              </li>
            ))}
            {!shown.length ? <li className="text-ink-3 px-2 py-3 text-center text-[12px]">No font matches.</li> : null}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
};
