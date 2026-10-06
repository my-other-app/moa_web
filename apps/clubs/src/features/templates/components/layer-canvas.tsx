"use client";

import * as React from "react";
import { cn } from "@moa/ui";

import {
  clampToCanvas,
  toArtwork,
  withSampleValues,
  type Canvas,
  type Layer,
  type TokenSpec,
} from "../layers";

/**
 * The artwork with its layers on top.
 *
 * The stage is always the artwork's own pixel size and is scaled with a CSS
 * transform, so every coordinate stored is an artwork pixel and the preview
 * matches the PDF at any zoom. Dragging converts the screen delta back
 * through the same scale -- the one place that conversion happens.
 *
 * Checkerboard behind it, because template artwork is usually a PNG with
 * transparency and a white backdrop hides exactly the mistakes a club needs
 * to see.
 */
const CHECKS =
  "repeating-conic-gradient(rgb(0 0 0 / 0.06) 0% 25%, transparent 0% 50%) 50% / 16px 16px";

export function LayerCanvas({
  artworkUrl,
  canvas,
  layers,
  scale,
  selectedId,
  preview,
  tokens,
  onSelect,
  onMove,
}: {
  artworkUrl: string | null;
  canvas: Canvas;
  layers: readonly Layer[];
  scale: number;
  selectedId: string | null;
  /** Preview swaps tokens for sample values and disables dragging. */
  preview: boolean;
  tokens: readonly TokenSpec[];
  onSelect: (id: string | null) => void;
  onMove: (id: string, next: { x: number; y: number }) => void;
}) {
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState<{ x: number; y: number } | null>(null);

  const width = canvas.width || 1000;
  const height = canvas.height || 600;

  function startDrag(event: React.PointerEvent, layer: Layer) {
    if (preview) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(layer.id);
    setDragging(layer.id);

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = layer.x;
    const originY = layer.y;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const move = (e: PointerEvent) => {
      const next = clampToCanvas(
        {
          x: originX + toArtwork(e.clientX - startX, scale),
          y: originY + toArtwork(e.clientY - startY, scale),
        },
        canvas
      );
      setHint(next);
      onMove(layer.id, next);
    };
    const end = () => {
      setDragging(null);
      setHint(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }

  return (
    <div
      /*
       * Centred both ways with a floor on the height, so a small artwork at
       * 25% sits in the middle of the stage rather than pinned to a corner of
       * a tall empty field -- which is what it looked like before.
       */
      className="relative grid min-h-[26rem] w-full place-items-center overflow-auto rounded-xl border p-6"
      style={{ background: CHECKS }}
      onPointerDown={() => !preview && onSelect(null)}
    >
      <div
        className="origin-top-left"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          className="relative overflow-hidden bg-neutral-900/40"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            backgroundImage: artworkUrl ? `url(${artworkUrl})` : undefined,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
          }}
        >
          {layers.map((layer) => {
            const selected = layer.id === selectedId;
            const common = {
              onPointerDown: (e: React.PointerEvent) => startDrag(e, layer),
              className: cn(
                "absolute",
                !preview && "cursor-move",
                // The outline is drawn at 1/scale so it stays a hairline
                // rather than growing into a thick band when zoomed in.
                selected && !preview && "outline-dashed",
                dragging === layer.id && "opacity-80"
              ),
              style: {
                left: layer.x,
                top: layer.y,
                outlineColor: selected ? "#17a58f" : "transparent",
                outlineWidth: selected && !preview ? Math.max(1, 2 / scale) : 0,
                outlineOffset: 2 / scale,
              } as React.CSSProperties,
            };

            if (layer.type === "qr") {
              const size = layer.width ?? 160;
              return (
                <div
                  key={layer.id}
                  {...common}
                  style={{ ...common.style, width: size, height: size }}
                >
                  {/* A real QR is only generated at render time; the editor
                      shows a stand-in so the footprint is accurate. */}
                  <div
                    className="grid size-full place-items-center rounded-sm bg-white text-[10px] font-semibold text-neutral-700"
                    style={{
                      backgroundImage: preview
                        ? "repeating-conic-gradient(#111 0% 25%, #fff 0% 50%)"
                        : undefined,
                      backgroundSize: preview ? `${size / 8}px ${size / 8}px` : undefined,
                    }}
                  >
                    {preview ? "" : "QR"}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={layer.id}
                {...common}
                style={{
                  ...common.style,
                  width: layer.width ?? undefined,
                  fontSize: layer.font_size,
                  lineHeight: `${layer.font_size + layer.line_spacing}px`,
                  color: layer.color,
                  textAlign: layer.align,
                  fontWeight: layer.bold ? 700 : 400,
                  maxHeight: (layer.font_size + layer.line_spacing) * layer.max_lines,
                  overflow: "hidden",
                  whiteSpace: "pre-wrap",
                }}
              >
                {preview ? withSampleValues(layer.text, tokens) : layer.text}
              </div>
            );
          })}
        </div>
      </div>

      {/* Live coordinates while dragging, as in the reference. Without it a
          club cannot tell what it is about to save. */}
      {hint ? (
        <div className="bg-foreground text-background pointer-events-none absolute bottom-3 left-3 rounded-md px-2 py-1 font-mono text-xs">
          X:{hint.x} Y:{hint.y}
        </div>
      ) : null}
    </div>
  );
}
