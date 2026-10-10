"use client";

import * as React from "react";
import { ImageUpIcon, Trash2Icon } from "lucide-react";
import {
  Button,
  InlineAlert,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import {
  CERTIFICATE_TOKENS,
  NUDGE,
  NUDGE_FAST,
  TICKET_TOKENS,
  centreOnCanvas,
  clampToCanvas,
  duplicateLayer,
  newLayer,
  withSampleValues,
  type Canvas,
  type Layer,
} from "../layers";
import { LayerCanvas } from "./layer-canvas";
import { LayerInspector, LayersList } from "./layer-inspector";

/**
 * Place content on your own artwork.
 *
 * The existing controls restyle the built-in layout, which is the right tool
 * for a club that wants the default ticket in its colours. This is for the
 * club that has artwork from a designer: upload it, drop the values on it,
 * and preview with sample data before anyone receives one.
 *
 * The two modes coexist. A template with no layers renders exactly as it
 * always has, so turning this on is a choice rather than a migration.
 */
const ZOOMS = [25, 50, 75, 100] as const;

export function LayerEditor({
  kind,
  artworkUrl,
  canvas,
  layers,
  onLayersChange,
  onCanvasChange,
  onPickArtwork,
  onRemoveArtwork,
}: {
  kind: "ticket" | "certificate";
  artworkUrl: string | null;
  canvas: Canvas;
  layers: Layer[];
  onLayersChange: (layers: Layer[]) => void;
  onCanvasChange: (canvas: Canvas) => void;
  onPickArtwork: (file: File) => void;
  onRemoveArtwork: () => void;
}) {
  const tokens = kind === "ticket" ? TICKET_TOKENS : CERTIFICATE_TOKENS;
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState<number>(50);
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const hasQr = layers.some((l) => l.type === "qr");

  /*
   * The artwork's natural size is measured once it loads and stored, because
   * every coordinate is expressed against it. Without this the editor would
   * place layers in display pixels and the PDF would put them somewhere else.
   */
  React.useEffect(() => {
    if (!artworkUrl) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        onCanvasChange({ width: img.naturalWidth, height: img.naturalHeight });
      }
    };
    img.src = artworkUrl;
    // onCanvasChange is stable from the caller; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworkUrl]);

  function patch(id: string, changes: Partial<Layer>) {
    onLayersChange(layers.map((l) => (l.id === id ? { ...l, ...changes } : l)));
  }

  /**
   * Move a layer one step through the paint order.
   *
   * Array order is paint order, so this is what "bring forward" means: the
   * only way to put a logo over a background band rather than under it.
   */
  function reorder(id: string, direction: -1 | 1) {
    const from = layers.findIndex((l) => l.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= layers.length) return;
    const moving = layers[from];
    const displaced = layers[to];
    if (!moving || !displaced) return;
    const next = [...layers];
    next[from] = displaced;
    next[to] = moving;
    onLayersChange(next);
  }

  function duplicate(id: string) {
    const index = layers.findIndex((l) => l.id === id);
    const original = layers[index];
    if (!original) return;
    const copy = duplicateLayer(original, canvas);
    // Inserted directly above the original rather than at the end, so a
    // duplicate does not jump to the front of the paint order.
    const next = [...layers];
    next.splice(index + 1, 0, copy);
    onLayersChange(next);
    setSelectedId(copy.id);
  }

  function centre(axis: "x" | "y") {
    if (!selected) return;
    const change = centreOnCanvas(selected, canvas, axis);
    // Null means there is nothing to centre against -- an auto-width text
    // layer has no measured box, and guessing one would move it somewhere
    // the organiser did not ask for.
    if (change) patch(selected.id, change);
  }

  /**
   * Arrow keys nudge the selected layer; shift makes it a bigger step.
   *
   * Dragging cannot place a layer to the pixel at 50% zoom, and the numeric
   * fields mean leaving the canvas to type. This is how every design tool
   * closes that gap.
   */
  function onKeyDown(event: React.KeyboardEvent) {
    if (mode === "preview" || !selected || selected.locked) return;

    const step = event.shiftKey ? NUDGE_FAST : NUDGE;
    const moves: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = moves[event.key];
    if (!move) return;

    // Only once a layer is selected, so arrow keys still scroll the page
    // the rest of the time.
    event.preventDefault();
    patch(
      selected.id,
      clampToCanvas(
        { x: selected.x + move.x, y: selected.y + move.y },
        canvas
      )
    );
  }

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "edit" | "preview")}>
          <TabsList>
            <TabsTrigger value="edit">Edit layout</TabsTrigger>
            <TabsTrigger value="preview">Sample preview</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Select value={String(zoom)} onValueChange={(v) => setZoom(Number(v))}>
            <SelectTrigger size="sm" aria-label="Zoom" className="w-[5.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ZOOMS.map((z) => (
                <SelectItem key={z} value={String(z)}>
                  {z}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
          <Button
            size="sm"
            variant="outline"
            className={pressable}
            onClick={() => fileRef.current?.click()}
          >
            <ImageUpIcon /> {artworkUrl ? "Replace" : "Upload"} artwork
          </Button>
          {artworkUrl ? (
            <Button
              size="sm"
              variant="ghost"
              className={cn("text-destructive hover:text-destructive", pressable)}
              onClick={onRemoveArtwork}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <LayerCanvas
          artworkUrl={artworkUrl}
          canvas={canvas}
          layers={layers}
          scale={zoom / 100}
          selectedId={selectedId}
          preview={mode === "preview"}
          tokens={tokens}
          onSelect={setSelectedId}
          onMove={(id, next) => patch(id, next)}
        />

        <div className="space-y-5">
          {mode === "preview" ? (
            <>
              <InlineAlert tone="info" title="Sample preview">
                The layout is unchanged. Tokens are shown with placeholder
                values so the result is easier to check before you save.
              </InlineAlert>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold tracking-[0.08em] uppercase">
                  Preview data
                </p>
                {tokens.map((spec) => (
                  <div
                    key={spec.token}
                    className="bg-muted/40 flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">
                        {spec.label}
                      </span>
                      <span className="text-muted-foreground block font-mono text-[11px]">
                        {`{{${spec.token}}}`}
                      </span>
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {spec.sample}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {!artworkUrl ? (
                <InlineAlert tone="warning" title="No artwork yet">
                  Layers are placed on an image. Upload your design first —
                  without one the stage is only a blank area at the size the
                  renderer will use.
                </InlineAlert>
              ) : null}

              <LayersList
                layers={layers}
                selectedId={selectedId}
                hasQr={hasQr}
                onSelect={setSelectedId}
                onAdd={(type) => {
                  const layer = newLayer(type, canvas);
                  onLayersChange([...layers, layer]);
                  setSelectedId(layer.id);
                }}
                onDelete={(id) => {
                  onLayersChange(layers.filter((l) => l.id !== id));
                  if (selectedId === id) setSelectedId(null);
                }}
                onPatch={patch}
                onReorder={reorder}
                onDuplicate={duplicate}
              />

              <LayerInspector
                layer={selected}
                tokens={tokens}
                canvas={canvas}
                onChange={(changes) => selected && patch(selected.id, changes)}
                onCentre={centre}
              />

              {selected?.type === "text" && selected.text.includes("{{") ? (
                <p className="text-muted-foreground text-xs">
                  Renders as:{" "}
                  <span className="text-foreground font-medium">
                    {withSampleValues(selected.text, tokens)}
                  </span>
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
