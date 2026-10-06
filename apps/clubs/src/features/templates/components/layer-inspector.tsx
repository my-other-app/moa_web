"use client";

import * as React from "react";
import { PlusIcon, QrCodeIcon, Trash2Icon, TypeIcon } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { layerLabel, type Layer, type TokenSpec } from "../layers";

/**
 * The layer list and the inspector for whichever layer is selected.
 *
 * Both halves exist because a canvas alone cannot express precision: dragging
 * gets a layer roughly where it belongs, and the numeric fields put it exactly
 * there. Clubs reproducing a designer's spec need the second.
 */
export function LayersList({
  layers,
  selectedId,
  hasQr,
  onSelect,
  onAdd,
  onDelete,
}: {
  layers: readonly Layer[];
  selectedId: string | null;
  hasQr: boolean;
  onSelect: (id: string) => void;
  onAdd: (type: Layer["type"]) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.08em] uppercase">Layers</p>
        <div className="flex gap-1.5">
          <Button size="xs" variant="outline" className={pressable} onClick={() => onAdd("text")}>
            <PlusIcon /> Text
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
          {layers.map((layer) => (
            <li key={layer.id}>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors",
                  layer.id === selectedId ? "bg-accent ring-brand/40 ring-1" : "hover:bg-accent/60"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(layer.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {layer.type === "qr" ? (
                    <QrCodeIcon className="text-muted-foreground size-3.5 shrink-0" />
                  ) : (
                    <TypeIcon className="text-muted-foreground size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {layerLabel(layer)}
                    </span>
                    <span className="text-muted-foreground block text-[11px]">
                      {layer.type === "qr" ? "QR layer" : "Text layer"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${layerLabel(layer)}`}
                  onClick={() => onDelete(layer.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const next = Number(e.target.value);
          // An empty input parses as NaN, which would wipe the layer's
          // position the moment someone clears the box to retype it.
          if (Number.isFinite(next)) onChange(next);
        }}
        className="h-9 tabular-nums"
      />
    </Field>
  );
}

export function LayerInspector({
  layer,
  tokens,
  onChange,
}: {
  layer: Layer | null;
  tokens: readonly TokenSpec[];
  onChange: (patch: Partial<Layer>) => void;
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
      <p className="text-xs font-semibold tracking-[0.08em] uppercase">Inspector</p>

      <div className="grid grid-cols-2 gap-3">
        <NumberField label="X" value={layer.x} min={0} onChange={(x) => onChange({ x })} />
        <NumberField label="Y" value={layer.y} min={0} onChange={(y) => onChange({ y })} />
      </div>

      {layer.type === "text" ? (
        <>
          <Field label="Text / token">
            <Input
              value={layer.text}
              onChange={(e) => onChange({ text: e.target.value })}
              className="h-9 font-mono text-xs"
            />
          </Field>

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

          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Font size"
              value={layer.font_size}
              min={1}
              max={400}
              onChange={(font_size) => onChange({ font_size })}
            />
            <NumberField
              label="Max lines"
              value={layer.max_lines}
              min={1}
              max={20}
              onChange={(max_lines) => onChange({ max_lines })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Line spacing"
              value={layer.line_spacing}
              min={-20}
              max={200}
              onChange={(line_spacing) => onChange({ line_spacing })}
            />
            <Field label="Align">
              <Select
                value={layer.align}
                onValueChange={(align) => onChange({ align: align as Layer["align"] })}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Font colour">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(layer.color) ? layer.color : "#ffffff"}
                onChange={(e) => onChange({ color: e.target.value })}
                aria-label="Font colour picker"
                className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <Input
                value={layer.color}
                onChange={(e) => onChange({ color: e.target.value })}
                aria-label="Font colour hex"
                className="h-9 font-mono text-xs uppercase"
              />
            </div>
          </Field>
        </>
      ) : (
        <NumberField
          label="Size (px)"
          value={layer.width ?? 160}
          min={32}
          max={1200}
          onChange={(width) => onChange({ width })}
        />
      )}
    </div>
  );
}
