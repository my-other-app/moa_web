"use client";

import * as React from "react";
import { ImageUpIcon, Trash2Icon } from "lucide-react";
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

import {
  matchPreset,
  presetsFor,
  startersFor,
  type CanvasPreset,
} from "../design-presets";
import type { Canvas, Layer } from "../layers";

/**
 * The artwork itself: how big it is, what is behind it, and what to start
 * from.
 *
 * A club with a design from Figma uploads it and the size follows the image.
 * A club without one had nothing but a blank area at whatever size the
 * renderer happened to use, which is the hardest possible place to begin --
 * hence the sizes and the starting layouts.
 */
export function CanvasPanel({
  kind,
  canvas,
  layers,
  artworkUrl,
  bgColor,
  onCanvasChange,
  onBgColorChange,
  onPickArtwork,
  onRemoveArtwork,
  onApplyStarter,
}: {
  kind: "ticket" | "certificate";
  canvas: Canvas;
  layers: readonly Layer[];
  artworkUrl: string | null;
  bgColor: string;
  onCanvasChange: (canvas: Canvas) => void;
  onBgColorChange: (color: string) => void;
  onPickArtwork: (file: File) => void;
  onRemoveArtwork: () => void;
  onApplyStarter: (layers: Layer[]) => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const preset = matchPreset(canvas);
  const presets = presetsFor(kind);
  const starters = startersFor(kind);

  return (
    <section className="space-y-4 border-t pt-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold tracking-[0.12em] uppercase">Canvas</p>
        <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
          {canvas.width || 0} × {canvas.height || 0} px
        </span>
      </div>

      <Field label="Size">
        <Select
          value={preset?.id ?? "custom"}
          onValueChange={(id) => {
            const chosen = presets.find((p: CanvasPreset) => p.id === id);
            if (chosen) onCanvasChange({ width: chosen.width, height: chosen.height });
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Choose a size" />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
            {/* Shown only when nothing matches, because it is a state the
                canvas can be in, not a size anyone can pick. */}
            {preset ? null : <SelectItem value="custom">Custom</SelectItem>}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <PixelField
          label="Width"
          value={canvas.width}
          onChange={(width) => onCanvasChange({ ...canvas, width })}
        />
        <PixelField
          label="Height"
          value={canvas.height}
          onChange={(height) => onCanvasChange({ ...canvas, height })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[11px] tracking-wide uppercase">Background</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(bgColor) ? bgColor : "#121212"}
            onChange={(e) => onBgColorChange(e.target.value)}
            aria-label="Background colour picker"
            className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
          />
          <Input
            value={bgColor}
            onChange={(e) => onBgColorChange(e.target.value)}
            aria-label="Background colour hex"
            className="h-9 font-mono text-xs uppercase"
          />
        </div>
        <p className="text-muted-foreground text-[11px]">
          {/* Said plainly: artwork wins, so a club that uploads a design does
              not go looking for why the colour did nothing. */}
          Shows through wherever there is no artwork.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-[11px] tracking-wide uppercase">Artwork</Label>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPickArtwork(file);
            // Cleared so choosing the same file twice still fires a change.
            e.target.value = "";
          }}
        />
        {artworkUrl ? (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- a remote
                URL shown at thumbnail size; optimisation buys nothing. */}
            <img
              src={artworkUrl}
              alt=""
              className="h-12 w-20 shrink-0 rounded border object-cover"
            />
            <Button
              size="xs"
              variant="outline"
              className={pressable}
              onClick={() => fileRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className={cn("text-destructive hover:text-destructive", pressable)}
              onClick={onRemoveArtwork}
            >
              <Trash2Icon /> Remove
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className={cn("w-full", pressable)}
            onClick={() => fileRef.current?.click()}
          >
            <ImageUpIcon /> Upload artwork
          </Button>
        )}
      </div>

      {starters.length ? (
        <div className="space-y-2">
          <Label className="text-[11px] tracking-wide uppercase">
            Start from a layout
          </Label>
          <div className="grid gap-2">
            {starters.map((starter) => (
              <button
                key={starter.id}
                type="button"
                onClick={() => onApplyStarter(starter.build(canvas))}
                className={cn(
                  "hover:border-brand/50 hover:bg-accent/50 rounded-lg border p-2.5 text-left transition-colors",
                  pressable
                )}
              >
                <span className="block text-xs font-semibold">{starter.label}</span>
                <span className="text-muted-foreground block text-[11px]">
                  {starter.description}
                </span>
              </button>
            ))}
          </div>
          {layers.length ? (
            <p className="text-muted-foreground text-[11px]">
              {/* Warned before, not apologised for after: this is one undo
                  away, but a club should know before it happens. */}
              Replaces the {layers.length} layer{layers.length === 1 ? "" : "s"}{" "}
              you have now. Undo brings them back.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
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

function PixelField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          type="number"
          min={1}
          value={value || ""}
          onChange={(e) => {
            const next = Number(e.target.value);
            // Zero would collapse the stage and divide by zero in the fit
            // calculation, so an empty box simply does not commit.
            if (Number.isFinite(next) && next > 0) onChange(Math.round(next));
          }}
          className="h-9 pr-8 tabular-nums"
        />
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px]">
          px
        </span>
      </div>
    </Field>
  );
}
