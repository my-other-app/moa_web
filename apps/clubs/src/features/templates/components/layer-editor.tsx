"use client";

import * as React from "react";
import { Redo2Icon, Undo2Icon } from "lucide-react";
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
  type Canvas,
  type Layer,
} from "../layers";
import { useHistory } from "../use-history";
import { CanvasPanel } from "./canvas-panel";
import { LayerCanvas } from "./layer-canvas";
import { LayerInspector, LayersList } from "./layer-inspector";

/**
 * The design workspace.
 *
 * The canvas is the work, so it takes the room; everything else is a rail
 * beside it. The earlier version had this the other way round -- a column of
 * settings with the artwork shrunk into a corner of it -- which is a form
 * with a thumbnail, not a place to lay a ticket out.
 *
 * The two modes matter as much as the layout. "Edit layout" shows the tokens
 * where they sit; "Sample preview" swaps in the values an attendee would get,
 * which is the only way to see whether a long name still fits before anyone
 * receives one.
 */
const ZOOMS = [25, 50, 75, 100, 150] as const;

interface DesignState {
  layers: Layer[];
  canvas: Canvas;
  bgColor: string;
}

export function LayerEditor({
  kind,
  artworkUrl,
  canvas,
  layers,
  bgColor,
  palette,
  onLayersChange,
  onCanvasChange,
  onBgColorChange,
  onPickArtwork,
  onRemoveArtwork,
}: {
  kind: "ticket" | "certificate";
  artworkUrl: string | null;
  canvas: Canvas;
  layers: Layer[];
  bgColor: string;
  palette: ReadonlyArray<{ label: string; value: string }>;
  onLayersChange: (layers: Layer[]) => void;
  onCanvasChange: (canvas: Canvas) => void;
  onBgColorChange: (color: string) => void;
  onPickArtwork: (file: File) => void;
  onRemoveArtwork: () => void;
}) {
  const tokens = kind === "ticket" ? TICKET_TOKENS : CERTIFICATE_TOKENS;
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState<number | "fit">("fit");
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");

  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const hasQr = layers.some((l) => l.type === "qr");

  /*
   * Undo spans layers, canvas size and background together, because they are
   * one design: resizing the canvas and then undoing only the layers would
   * leave a state the club never had.
   */
  const applyState = React.useCallback(
    (next: DesignState) => {
      onLayersChange(next.layers);
      onCanvasChange(next.canvas);
      onBgColorChange(next.bgColor);
    },
    [onLayersChange, onCanvasChange, onBgColorChange]
  );
  const history = useHistory<DesignState>({ layers, canvas, bgColor }, applyState);

  const setLayers = (next: Layer[], coalesce?: string) =>
    history.commit({ layers: next, canvas, bgColor }, coalesce ? { coalesce } : undefined);

  /*
   * The artwork's natural size is measured once it loads and stored, because
   * every coordinate is expressed against it. Without this the editor would
   * place layers in display pixels and the PDF would put them somewhere else.
   *
   * Committed without history: it is a measurement, not an edit, and undoing
   * back to "the size before we knew the size" is not a state worth having.
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

  /* Fit measures the space actually available, so it survives a resized
     window or a collapsed sidebar rather than assuming a width. */
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [available, setAvailable] = React.useState(0);
  React.useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fitScale = React.useMemo(() => {
    const width = canvas.width || 1000;
    if (!available || !width) return 0.5;
    // Minus the stage's own padding, and never magnified past 1:1 -- a small
    // badge blown up to fill the screen is harder to place things on, not
    // easier.
    return Math.min(1, Math.max(0.05, (available - 48) / width));
  }, [available, canvas.width]);

  const scale = zoom === "fit" ? fitScale : zoom / 100;

  function patch(id: string, changes: Partial<Layer>, coalesce?: string) {
    setLayers(
      layers.map((l) => (l.id === id ? { ...l, ...changes } : l)),
      coalesce
    );
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
    setLayers(next);
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
    setLayers(next);
    setSelectedId(copy.id);
  }

  function remove(id: string) {
    setLayers(layers.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function add(type: Layer["type"]) {
    const layer = newLayer(type, canvas);
    setLayers([...layers, layer]);
    setSelectedId(layer.id);
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
   * Keyboard, as the reference has it: arrows nudge, shift makes the step
   * bigger, and the three shortcuts anyone who has used a design tool will
   * try before looking for a button.
   */
  function onKeyDown(event: React.KeyboardEvent) {
    if (mode === "preview") return;
    const meta = event.metaKey || event.ctrlKey;

    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) history.redo();
      else history.undo();
      return;
    }
    if (meta && event.key.toLowerCase() === "d") {
      event.preventDefault();
      if (selected) duplicate(selected.id);
      return;
    }

    if (!selected || selected.locked) return;

    if (event.key === "Backspace" || event.key === "Delete") {
      // Not while typing in the inspector, which sits inside this handler's
      // subtree -- otherwise clearing a text field deletes the layer.
      const tag = (event.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      event.preventDefault();
      remove(selected.id);
      return;
    }

    const step = event.shiftKey ? NUDGE_FAST : NUDGE;
    const moves: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = moves[event.key];
    if (!move) return;

    // Only once a layer is selected, so arrow keys still scroll the page the
    // rest of the time.
    event.preventDefault();
    patch(
      selected.id,
      clampToCanvas({ x: selected.x + move.x, y: selected.y + move.y }, canvas),
      `nudge:${selected.id}`
    );
  }

  return (
    <div className="space-y-3" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "edit" | "preview")}>
          <TabsList>
            <TabsTrigger value="edit">Edit layout</TabsTrigger>
            <TabsTrigger value="preview">Sample preview</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-[11px] tracking-[0.08em] uppercase">
            Zoom
          </span>
          <Select
            value={String(zoom)}
            onValueChange={(v) => setZoom(v === "fit" ? "fit" : Number(v))}
          >
            <SelectTrigger size="sm" aria-label="Zoom" className="w-[7.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fit">Fit ({Math.round(fitScale * 100)}%)</SelectItem>
              {ZOOMS.map((z) => (
                <SelectItem key={z} value={String(z)}>
                  {z}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            className={pressable}
            disabled={!history.canUndo}
            onClick={history.undo}
          >
            <Undo2Icon /> Undo
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className={pressable}
            disabled={!history.canRedo}
            onClick={history.redo}
          >
            <Redo2Icon /> Redo
          </Button>
        </div>

        <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
          {layers.length} layer{layers.length === 1 ? "" : "s"} ·{" "}
          {canvas.width || 0} × {canvas.height || 0}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div ref={stageRef} className="min-w-0">
          <LayerCanvas
            artworkUrl={artworkUrl}
            canvas={canvas}
            layers={layers}
            bgColor={bgColor}
            scale={scale}
            selectedId={selectedId}
            preview={mode === "preview"}
            tokens={tokens}
            onSelect={setSelectedId}
            onMove={(id, next) => patch(id, next, `drag:${id}`)}
          />
        </div>

        <aside className="min-w-0 space-y-5">
          {mode === "preview" ? (
            <InlineAlert tone="info" title="Sample preview">
              The layout is unchanged. Tokens are shown with placeholder values,
              and text is shrunk exactly as the renderer shrinks it, so a long
              name looks here the way it will on the document.
            </InlineAlert>
          ) : (
            <>
              {!artworkUrl && !layers.length ? (
                <InlineAlert tone="info" title="Nothing on the canvas yet">
                  Upload your design and place fields on it, or start from one
                  of the layouts below.
                </InlineAlert>
              ) : null}

              <LayersList
                layers={layers}
                selectedId={selectedId}
                hasQr={hasQr}
                onSelect={setSelectedId}
                onAdd={add}
                onDelete={remove}
                onPatch={patch}
                onReorder={reorder}
                onDuplicate={duplicate}
              />

              {selected ? (
                <div className="border-t pt-4">
                  <LayerInspector
                    layer={selected}
                    tokens={tokens}
                    canvas={canvas}
                    palette={palette}
                    onChange={(changes) => patch(selected.id, changes)}
                    onCentre={centre}
                  />
                </div>
              ) : null}

              <CanvasPanel
                kind={kind}
                canvas={canvas}
                layers={layers}
                artworkUrl={artworkUrl}
                bgColor={bgColor}
                onCanvasChange={(next) =>
                  history.commit({ layers, canvas: next, bgColor })
                }
                onBgColorChange={(next) =>
                  history.commit({ layers, canvas, bgColor: next }, {
                    coalesce: "bg",
                  })
                }
                onPickArtwork={onPickArtwork}
                onRemoveArtwork={onRemoveArtwork}
                onApplyStarter={(next) => {
                  setLayers(next);
                  setSelectedId(next[0]?.id ?? null);
                }}
              />

              <ShortcutLegend />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * The shortcuts, written down.
 *
 * Every one of these is discoverable only by trying it, and a club that does
 * not know about undo will rebuild a layer by hand instead.
 */
function ShortcutLegend() {
  const rows: ReadonlyArray<[string, string]> = [
    ["↑ ↓ ← →", "nudge 1px"],
    ["⇧ + arrow", "nudge 10px"],
    ["⌘Z / ⇧⌘Z", "undo / redo"],
    ["⌘D", "duplicate"],
    ["⌫", "delete"],
    ["hold ⌥", "drag without snapping"],
  ];
  return (
    <div className="border-t pt-4">
      <p className="text-muted-foreground mb-2 text-[11px] tracking-[0.08em] uppercase">
        Shortcuts
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {rows.map(([keys, what]) => (
          <React.Fragment key={keys}>
            <dt>
              <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">
                {keys}
              </kbd>
            </dt>
            <dd className="text-muted-foreground self-center text-[11px]">{what}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}
