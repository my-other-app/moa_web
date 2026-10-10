"use client";

import * as React from "react";
import {
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  LockIcon,
  LockOpenIcon,
  PlusIcon,
  QrCodeIcon,
  SquareIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Textarea,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import {
  centreOnCanvas,
  effectiveWeight,
  layerLabel,
  layerTypeLabel,
  withSampleValues,
  type Canvas,
  type Layer,
  type TokenSpec,
} from "../layers";
import { FONTS } from "../schemas";

/**
 * The layer list and the inspector for whichever layer is selected.
 *
 * Both halves exist because a canvas alone cannot express precision: dragging
 * gets a layer roughly where it belongs, and the numeric fields put it exactly
 * there. Clubs reproducing a designer's spec need the second.
 *
 * Every control here maps to a property the PDF renderer reads. Offering one
 * it ignores is worse than not offering it -- the club moves a slider, the
 * preview changes, and the document that reaches the attendee does not.
 */

const WEIGHTS = [
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Extrabold" },
] as const;

const TYPE_ICONS: Record<Layer["type"], React.ComponentType<{ className?: string }>> = {
  text: TypeIcon,
  qr: QrCodeIcon,
  image: ImageIcon,
  shape: SquareIcon,
};

/** Order in the array is paint order, so the last layer is the top one. */
export function LayersList({
  layers,
  selectedId,
  hasQr,
  onSelect,
  onAdd,
  onDelete,
  onPatch,
  onReorder,
  onDuplicate,
}: {
  layers: readonly Layer[];
  selectedId: string | null;
  hasQr: boolean;
  onSelect: (id: string) => void;
  onAdd: (type: Layer["type"]) => void;
  onDelete: (id: string) => void;
  onPatch: (id: string, changes: Partial<Layer>) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  onDuplicate: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.08em] uppercase">Layers</p>
        <div className="flex flex-wrap gap-1.5">
          <Button size="xs" variant="outline" className={pressable} onClick={() => onAdd("text")}>
            <PlusIcon /> Text
          </Button>
          <Button size="xs" variant="outline" className={pressable} onClick={() => onAdd("image")}>
            <PlusIcon /> Image
          </Button>
          <Button size="xs" variant="outline" className={pressable} onClick={() => onAdd("shape")}>
            <PlusIcon /> Shape
          </Button>
          <Button
            size="xs"
            variant="outline"
            className={pressable}
            // One QR per template: the renderer encodes a single ticket, so a
            // second would be an identical duplicate rather than a new code.
            disabled={hasQr}
            title={hasQr ? "A template can only carry one QR code" : undefined}
            onClick={() => onAdd("qr")}
          >
            <QrCodeIcon /> QR
          </Button>
        </div>
      </div>

      {layers.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-xs">
          No layers yet. Add a text layer and drag it onto your artwork.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {/*
           * Listed top layer first, matching how every design tool shows a
           * layer stack -- the array itself stays in paint order, because
           * that is the order the renderer walks.
           */}
          {layers
            .map((layer, index) => ({ layer, index }))
            .reverse()
            .map(({ layer, index }) => {
              const Icon = TYPE_ICONS[layer.type];
              return (
                <li key={layer.id}>
                  <div
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-2 transition-colors",
                      layer.id === selectedId
                        ? "bg-accent ring-brand/40 ring-1"
                        : "hover:bg-accent/60",
                      layer.hidden && "opacity-60"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(layer.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <Icon className="text-muted-foreground size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-xs font-medium",
                            layer.hidden && "line-through"
                          )}
                        >
                          {layerLabel(layer)}
                        </span>
                        <span className="text-muted-foreground block text-[11px]">
                          {layerTypeLabel(layer.type)}
                        </span>
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center">
                      <IconToggle
                        label={`Move ${layerLabel(layer)} up`}
                        disabled={index === layers.length - 1}
                        onClick={() => onReorder(layer.id, 1)}
                      >
                        <ChevronUpIcon className="size-3.5" />
                      </IconToggle>
                      <IconToggle
                        label={`Move ${layerLabel(layer)} down`}
                        disabled={index === 0}
                        onClick={() => onReorder(layer.id, -1)}
                      >
                        <ChevronDownIcon className="size-3.5" />
                      </IconToggle>
                      <IconToggle
                        label={
                          layer.hidden
                            ? `Show ${layerLabel(layer)}`
                            : `Hide ${layerLabel(layer)}`
                        }
                        active={layer.hidden}
                        onClick={() => onPatch(layer.id, { hidden: !layer.hidden })}
                      >
                        {layer.hidden ? (
                          <EyeOffIcon className="size-3.5" />
                        ) : (
                          <EyeIcon className="size-3.5" />
                        )}
                      </IconToggle>
                      <IconToggle
                        label={
                          layer.locked
                            ? `Unlock ${layerLabel(layer)}`
                            : `Lock ${layerLabel(layer)}`
                        }
                        active={layer.locked}
                        onClick={() => onPatch(layer.id, { locked: !layer.locked })}
                      >
                        {layer.locked ? (
                          <LockIcon className="size-3.5" />
                        ) : (
                          <LockOpenIcon className="size-3.5" />
                        )}
                      </IconToggle>
                      <IconToggle
                        label={`Duplicate ${layerLabel(layer)}`}
                        onClick={() => onDuplicate(layer.id)}
                      >
                        <CopyIcon className="size-3.5" />
                      </IconToggle>
                      <IconToggle
                        label={`Delete ${layerLabel(layer)}`}
                        destructive
                        onClick={() => onDelete(layer.id)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </IconToggle>
                    </div>
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

function IconToggle({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
  destructive = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "text-muted-foreground rounded p-1 transition-colors disabled:opacity-30",
        destructive ? "hover:text-destructive" : "hover:text-foreground",
        active && "text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/**
 * A segmented control.
 *
 * Align and overflow were dropdowns, which hides two of three options behind
 * a click in a panel where every other control shows its state. These are
 * small, fixed sets -- showing them costs one row and saves the click.
 */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px] tracking-wide uppercase">{label}</Label>
      <div
        role="radiogroup"
        aria-label={label}
        className="bg-muted/60 grid gap-1 rounded-lg p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "truncate rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              value === option.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px] tracking-wide uppercase">{label}</Label>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  placeholder,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          // An empty box means "unset" for the optional fields, and the
          // caller decides whether that is allowed. Parsing it as NaN would
          // wipe the value the moment someone clears it to retype.
          if (raw === "") {
            onChange(null);
            return;
          }
          const next = Number(raw);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="h-9 tabular-nums"
      />
    </Field>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-[11px] tracking-wide uppercase">{label}</Label>
        <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-brand h-9 w-full cursor-pointer"
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const shown = value ?? fallback;
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(shown) ? shown : fallback}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} picker`}
          className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input
          value={shown}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} hex`}
          className="h-9 font-mono text-xs uppercase"
        />
      </div>
    </Field>
  );
}

export function LayerInspector({
  layer,
  tokens,
  canvas,
  palette,
  onChange,
  onCentre,
}: {
  layer: Layer | null;
  tokens: readonly TokenSpec[];
  canvas: Canvas;
  /** The template's own colours, offered as one-click swatches. */
  palette: ReadonlyArray<{ label: string; value: string }>;
  onChange: (patch: Partial<Layer>) => void;
  onCentre: (axis: "x" | "y") => void;
}) {
  if (!layer) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-xs">
        Select a layer to edit it, or drag one on the artwork.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.08em] uppercase">Inspector</p>
        <span className="text-muted-foreground text-[11px]">
          {layerTypeLabel(layer.type)}
        </span>
      </div>

      <Field label="Layer name">
        <Input
          value={layer.name ?? ""}
          placeholder={layerLabel(layer)}
          onChange={(e) => onChange({ name: e.target.value || null })}
          className="h-9"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <NumberField label="X" value={layer.x} min={0} onChange={(x) => onChange({ x: x ?? 0 })} />
        <NumberField label="Y" value={layer.y} min={0} onChange={(y) => onChange({ y: y ?? 0 })} />
      </div>

      <div className="flex items-center gap-1.5">
        {/*
          * Centring by eye on someone else's artwork is guesswork, and these
          * are the two alignments a club actually asks for. Disabled when the
          * layer has no measured box to centre -- an auto-width text layer
          * has none, and guessing one would move it somewhere unasked.
          */}
        <Button
          size="xs"
          variant="outline"
          className={pressable}
          disabled={!centreOnCanvas(layer, canvas, "x")}
          onClick={() => onCentre("x")}
        >
          <AlignCenterVerticalIcon /> Centre across
        </Button>
        <Button
          size="xs"
          variant="outline"
          className={pressable}
          disabled={!centreOnCanvas(layer, canvas, "y")}
          onClick={() => onCentre("y")}
        >
          <AlignCenterHorizontalIcon /> Centre down
        </Button>
      </div>

      <p className="text-muted-foreground text-[11px]">
        {/* Said out loud, because an undiscoverable shortcut is no shortcut. */}
        Arrow keys nudge by 1px, with shift by 10px.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={layer.type === "qr" ? "Size" : "Width"}
          value={layer.width}
          min={1}
          placeholder={layer.type === "text" ? "Auto" : undefined}
          onChange={(width) => onChange({ width })}
        />
        {layer.type === "image" || layer.type === "shape" ? (
          <NumberField
            label="Height"
            value={layer.height}
            min={1}
            onChange={(height) => onChange({ height })}
          />
        ) : null}
      </div>

      <RangeField
        label="Opacity"
        value={layer.opacity}
        min={0}
        max={100}
        suffix="%"
        onChange={(opacity) => onChange({ opacity })}
      />

      <Separator />

      {layer.type === "text" ? (
        <TextLayerFields
          layer={layer}
          tokens={tokens}
          palette={palette}
          onChange={onChange}
        />
      ) : null}

      {layer.type === "image" ? (
        <Field label="Image URL">
          <Input
            value={layer.image_url ?? ""}
            placeholder="https://…"
            onChange={(e) => onChange({ image_url: e.target.value || null })}
            className="h-9 font-mono text-xs"
          />
        </Field>
      ) : null}

      {layer.type === "shape" ? (
        <>
          <ColorField
            label="Fill"
            value={layer.fill}
            fallback="#ffffff"
            onChange={(fill) => onChange({ fill })}
          />
          <NumberField
            label="Corner radius"
            value={layer.radius}
            min={0}
            max={400}
            onChange={(radius) => onChange({ radius: radius ?? 0 })}
          />
        </>
      ) : null}

      {layer.type === "qr" ? (
        <p className="text-muted-foreground text-xs">
          {/* Said plainly, because a club will otherwise look for the field. */}
          The code itself is generated when the document is issued — there is
          nothing to set here but its size and position.
        </p>
      ) : null}
    </div>
  );
}

function TextLayerFields({
  layer,
  tokens,
  palette,
  onChange,
}: {
  layer: Layer;
  tokens: readonly TokenSpec[];
  palette: ReadonlyArray<{ label: string; value: string }>;
  onChange: (patch: Partial<Layer>) => void;
}) {
  return (
    <>
      <Field label="Text">
        <Textarea
          rows={2}
          value={layer.text}
          onChange={(e) => onChange({ text: e.target.value })}
          className="resize-y font-mono text-xs"
        />
      </Field>

      {layer.text.includes("{{") ? (
        <div className="bg-muted/50 flex items-baseline gap-2 rounded-lg px-3 py-2">
          {/* The field holds a token; this is the string an attendee gets.
              Without it a club only finds out what fits after issuing one. */}
          <span className="text-muted-foreground shrink-0 text-[10px] tracking-[0.08em] uppercase">
            Sample
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {withSampleValues(layer.text, tokens) || "—"}
          </span>
        </div>
      ) : null}

      <Field label="Insert a token">
        <Select
          value=""
          onValueChange={(token) => onChange({ text: `${layer.text}{{${token}}}` })}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Add a value…" />
          </SelectTrigger>
          <SelectContent>
            {tokens.map((spec) => (
              <SelectItem key={spec.token} value={spec.token}>
                <span className="flex flex-col">
                  <span>{spec.label}</span>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {`{{${spec.token}}}`}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Font">
        <Select
          // Empty string is not a usable Select value, so "inherit" stands in
          // for "no override" and is translated back on the way out.
          value={layer.font ?? "inherit"}
          onValueChange={(font) => onChange({ font: font === "inherit" ? null : font })}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inherit">Template font</SelectItem>
            {FONTS.map((font) => (
              <SelectItem key={font} value={font}>
                {font}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Font size"
          value={layer.font_size}
          min={1}
          max={400}
          onChange={(font_size) => onChange({ font_size: font_size ?? 24 })}
        />
        <Field label="Weight">
          <Select
            value={String(effectiveWeight(layer))}
            // Written to `weight`, and `bold` is cleared so the two cannot
            // disagree -- the renderer prefers weight, and a config carrying
            // both would read as bold in any older client.
            onValueChange={(value) =>
              onChange({ weight: Number(value), bold: Number(value) >= 600 })
            }
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEIGHTS.map((weight) => (
                <SelectItem key={weight.value} value={String(weight.value)}>
                  {weight.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Letter spacing"
          value={layer.letter_spacing}
          min={-20}
          max={100}
          onChange={(letter_spacing) => onChange({ letter_spacing: letter_spacing ?? 0 })}
        />
        <NumberField
          label="Line spacing"
          value={layer.line_spacing}
          min={-20}
          max={200}
          onChange={(line_spacing) => onChange({ line_spacing: line_spacing ?? 0 })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Max lines"
          value={layer.max_lines}
          min={1}
          max={20}
          onChange={(max_lines) => onChange({ max_lines: max_lines ?? 1 })}
        />
        <Segmented
          label="Align"
          value={layer.align}
          options={[
            { value: "left" as const, label: "Left" },
            { value: "center" as const, label: "Centre" },
            { value: "right" as const, label: "Right" },
          ]}
          onChange={(align) => onChange({ align })}
        />
      </div>

      <Segmented
        label="When it does not fit"
        value={layer.overflow}
        options={[
          { value: "shrink" as const, label: "Shrink to fit" },
          { value: "clip" as const, label: "Cut it off" },
        ]}
        onChange={(overflow) => onChange({ overflow })}
      />
      {layer.overflow === "shrink" && !layer.width ? (
        <p className="text-muted-foreground -mt-1 text-[11px]">
          {/* Shrinking needs a box to shrink into, and width is optional. */}
          Set a box width — without one there is nothing to fit the text to.
        </p>
      ) : null}

      <ColorField
        label="Font colour"
        value={layer.color}
        fallback="#ffffff"
        onChange={(color) => onChange({ color })}
      />

      {palette.length ? (
        <div className="flex flex-wrap gap-1.5">
          {/* The template's own colours, one click away. Retyping a hex to
              match the club's accent is how a design ends up almost on
              brand. */}
          {palette.map((swatch) => (
            <button
              key={swatch.label}
              type="button"
              onClick={() => onChange({ color: swatch.value })}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                layer.color.toLowerCase() === swatch.value.toLowerCase()
                  ? "border-brand/60 bg-accent"
                  : "hover:bg-accent/60"
              )}
            >
              <span
                className="size-2.5 shrink-0 rounded-full border"
                style={{ background: swatch.value }}
              />
              {swatch.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
