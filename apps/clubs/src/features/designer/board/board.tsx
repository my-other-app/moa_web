"use client";

import { DOC_FONTS, LayerV2, LayoutV2, type TextLayerV2, fontsFromApi } from "@moa/layout";
import { z } from "zod";
import { Button, CardLabel, FigurePanel, Notice, cn, toast } from "@moa/ui";
import { AlertTriangleIcon, CheckCircle2Icon, ScanEyeIcon } from "lucide-react";
import * as React from "react";

import { fitImage, isPicture } from "@/lib/images";

import { previewBoard, uploadLayoutImage } from "../api";
import type { DesignerConfig } from "../config";
import { useResetLayout, useSaveArtwork, useSaveBoard } from "../queries";
import { AUDIENCES, type Audience, type BoardDesign, type BoardKind, type DesignScope } from "../schemas";
import { PreviewDialog, ResetDialog } from "../components/dialogs";
import { DesignBar, Provenance, SaveBar, type SaveState } from "../components/shell";
import { DocumentPanel } from "./document-panel";
import { boardColors, boardContext, boardValues, checkLayout, imageLinkOf, makeRenderer, readLayout } from "./engine";
import { type ColorContext, resolveColorV2 } from "./fields";
import { type Alignment, type OrderMove, align, distribute, reorder } from "./geometry";
import { useHistory } from "./history";
import { BoardInspector, type InspectorContext } from "./inspector";
import { BoardLayers } from "./layers-panel";
import { type NewLayer, copiesOf, newLayer, patchLayer, patchLayers } from "./model";
import { BoardStage, type SelectMode } from "./stage";
import { TextEditor } from "./text-editor";
import { ArrangeButtons, BoardToolbar, nextZoom } from "./toolbar";

/**
 * The board: a design as layers on a canvas, every one of them movable and
 * changeable -- the stage in the middle, the layers and the selected
 * layer's properties (or the document's, with nothing picked) beside it,
 * and the save bar under it. Saving writes layout v2, which replaces any
 * ready design saved before.
 */

const errorCopy = (err: unknown) => (err instanceof Error && err.message ? err.message : "Something went wrong.");

/** Layers copied on this board, for pasting here or on another audience's board. */
let clipboard: LayerV2[] = [];
const CLIP_MARK = "moa-layers:";

/** Text and fields where keys belong to the person typing. */
const typingIn = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]');
};

export interface BoardProps {
  config: DesignerConfig;
  kind: BoardKind;
  scope: DesignScope;
  audience: Audience;
  design: BoardDesign;
  /** The layout to open on: what is saved (converted), or a starter's copy. */
  initial: LayoutV2;
  /** A starter picked in the gallery, by name: the board opens unsaved on it. */
  starterName: string | null;
  picker: React.ReactNode;
  onGallery?: () => void;
  onSaved: () => void;
  onDiscard: () => void;
  onReset: () => Promise<void>;
  dirtyRef: React.MutableRefObject<boolean>;
}

export const Board = ({ config, kind, scope, audience, design, initial, starterName, picker, onGallery, onSaved, onDiscard, onReset, dirtyRef }: BoardProps) => {
  const save = useSaveBoard(scope, kind, audience);
  const reset = useResetLayout(scope, kind, audience);
  const artwork = useSaveArtwork(scope, kind, audience);
  const history = useHistory<LayoutV2>(initial);
  const layout = history.value;
  const { layers, canvas } = layout;
  // What the board opened on, to tell an edit from none. A starter opened and not touched is "not saved yet", not an edit.
  const [savedJson, setSavedJson] = React.useState(() => JSON.stringify(initial));
  const [version, setVersion] = React.useState(design.version);
  const [fromStarter, setFromStarter] = React.useState(design.fromStarter || !!starterName);
  // The starter the board opened on, until it is saved as this design.
  const [startedFrom, setStartedFrom] = React.useState(starterName);
  const [sel, setSel] = React.useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = React.useState<string | null>(null);
  const [zoomChoice, setZoomChoice] = React.useState<number | "fit">("fit");
  const [room, setRoom] = React.useState({ w: 900, h: 620 });
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const [dialog, setDialog] = React.useState<"preview" | "reset" | null>(null);
  const [previewImage, setPreviewImage] = React.useState<Blob | null>(null);
  const [previewBusy, setPreviewBusy] = React.useState<string | null>(null);
  const viewport = React.useRef<HTMLDivElement>(null);
  const svgInput = React.useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(layout) !== savedJson;
  React.useEffect(() => {
    dirtyRef.current = dirty;
    return () => {
      dirtyRef.current = false;
    };
  }, [dirty, dirtyRef]);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ─── What the stage draws with ─────────────────────────────────────────

  const fonts = React.useMemo(() => (design.fonts.length ? fontsFromApi(design.fonts) : [...DOC_FONTS]), [design.fonts]);
  const samples = React.useMemo(() => boardValues(design), [design]);
  const ctx = React.useMemo(() => boardContext(design, config.sampleQr, urls), [design, config.sampleQr, urls]);
  const colors: ColorContext = React.useMemo(() => {
    const c = boardColors(design);
    // An accent left unset paints black, as the builder paints it.
    return { accent: layout.vars.accent ?? "#000000", primary: c.primary, secondary: c.secondary, ticketType: c.ticketType };
  }, [layout.vars.accent, design]);
  const renderer = React.useMemo(
    () => makeRenderer({ page: layout.page, canvas: layout.canvas, vars: layout.vars }, samples, ctx, kind),
    [layout.page, layout.canvas, layout.vars, samples, ctx, kind]
  );

  // ─── Zoom ──────────────────────────────────────────────────────────────

  React.useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => el.clientWidth && setRoom({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = Math.max(0.05, Math.min(2, (room.w - 64) / canvas.width, (room.h - 64) / canvas.height));
  const zoom = zoomChoice === "fit" ? fit : zoomChoice;
  const setZoom = (z: number | "fit") => setZoomChoice(z === "fit" ? "fit" : Math.max(0.05, Math.min(4, z)));

  // ─── Selection ─────────────────────────────────────────────────────────

  const byId = React.useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);
  // What is picked and still there: an undo can take a picked layer away.
  const selected = React.useMemo(() => new Set([...sel].filter((id) => byId.has(id))), [sel, byId]);
  const selectedLayers = React.useMemo(() => layers.filter((l) => selected.has(l.id)), [layers, selected]);
  const single = selectedLayers.length === 1 ? selectedLayers[0]! : null;

  const select = React.useCallback((ids: string[], mode: SelectMode | "toggle" = "replace") => {
    setSel((cur) => {
      if (mode === "replace") return new Set(ids);
      const next = new Set(cur);
      for (const id of ids) {
        if (mode === "toggle" && next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  // Said to a screen reader as the selection changes (a new layer is picked, so adding one is said too).
  const n = selectedLayers.length;
  const said = n === 0 ? "Nothing selected" : n === 1 ? `${selectedLayers[0]!.name} selected` : `${n} layers selected`;

  // ─── Changes ───────────────────────────────────────────────────────────

  const update = history.set;
  const pinnedQr = (l: LayerV2) => l.kind === "qr" && config.qrRequired;
  const hasQr = layers.some((l) => l.kind === "qr");

  const remove = () => {
    const ids = new Set(selectedLayers.filter((l) => !pinnedQr(l)).map((l) => l.id));
    if (!ids.size) return;
    update((l) => ({ ...l, layers: l.layers.filter((x) => !ids.has(x.id)) }));
    setSel(new Set());
    setEditing(null);
  };

  /** New layers above what they came from (pasted ones on top), and picked. */
  const insert = (fresh: LayerV2[], after?: string[]) => {
    if (!fresh.length) return;
    update((cur) => {
      if (!after) return { ...cur, layers: [...cur.layers, ...fresh] };
      const next = [...cur.layers];
      fresh.forEach((f, i) => {
        const at = next.findIndex((x) => x.id === after[i]);
        next.splice(at < 0 ? next.length : at + 1, 0, f);
      });
      return { ...cur, layers: next };
    });
    setSel(new Set(fresh.map((f) => f.id)));
  };

  /** Copies of these layers; a QR only when the design has none yet, since it holds one. */
  const copyable = (src: readonly LayerV2[]) => {
    let qr = hasQr;
    return src.filter((l) => {
      if (l.kind !== "qr") return true;
      if (qr) return false;
      qr = true;
      return true;
    });
  };
  const duplicate = () => {
    const src = copyable(selectedLayers);
    insert(copiesOf(src, layout), src.map((l) => l.id));
  };
  const paste = (src: LayerV2[]) => insert(copiesOf(copyable(src), layout));

  const add = (spec: NewLayer) => {
    if (spec.kind === "qr" && hasQr) return;
    const l = newLayer(spec, layout);
    insert([l]);
  };

  const addSvg = async (file: File) => {
    const markup = await file.text();
    if (!/<svg[\s>]/i.test(markup)) {
      toast.error("That file is not an SVG");
      return;
    }
    add({ kind: "svg", markup, name: file.name.replace(/\.svg$/i, "").slice(0, 80) || "Artwork" });
  };

  const moveTo = (pos: Map<string, { x: number; y: number }>) => update((l) => patchLayers(l, pos));
  const doAlign = (how: Alignment) => moveTo(align(selectedLayers, how, canvas));
  const doDistribute = (axis: "x" | "y") => moveTo(distribute(selectedLayers, axis));
  const doOrder = (move: OrderMove) => update((l) => ({ ...l, layers: reorder(l.layers, selected, move) }));
  const nudge = (dx: number, dy: number) =>
    update(
      (l) => patchLayers(l, new Map(selectedLayers.filter((x) => !x.locked).map((x) => [x.id, { x: x.x + dx, y: x.y + dy }]))),
      "nudge"
    );
  const toggleAll = (field: "locked" | "hidden") => {
    const targets = selectedLayers.filter((l) => !(field === "hidden" && pinnedQr(l)));
    if (!targets.length) return;
    const to = !targets.every((l) => l[field]);
    update((l) => patchLayers(l, new Map(targets.map((x) => [x.id, { [field]: to }]))));
  };

  // ─── Pictures ──────────────────────────────────────────────────────────

  const upload = async (picked: File) => {
    let file: File;
    try {
      file = await fitImage(picked, "image");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That image is too big to send");
      return null;
    }
    try {
      const res = await uploadLayoutImage(scope, kind, file, "image");
      setUrls((u) => ({ ...u, [res.key]: res.url }));
      return res;
    } catch (err) {
      toast.error(errorCopy(err));
      return null;
    }
  };

  /** A picture dropped on the stage: into the picked image layer, or as a new image layer. */
  const onDropFile = async (file: File) => {
    if (/\.svg$/i.test(file.name) || file.type === "image/svg+xml") return addSvg(file);
    if (!isPicture(file)) return;
    const res = await upload(file);
    if (!res) return;
    if (single?.kind === "image" && single.source === "upload") return update((l) => patchLayer(l, single.id, { imageKey: res.key }));
    const l = newLayer({ kind: "image", source: "upload" }, layout);
    insert([{ ...l, imageKey: res.key } as LayerV2]);
  };

  // ─── Keys, copy and paste ──────────────────────────────────────────────

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingIn(e.target) || editing) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const act = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (mod && k === "z") return act(e.shiftKey ? history.redo : history.undo);
      if (mod && k === "y") return act(history.redo);
      if (mod && (k === "=" || k === "+")) return act(() => setZoom(nextZoom(zoom, 1)));
      if (mod && k === "-") return act(() => setZoom(nextZoom(zoom, -1)));
      if (mod && k === "0") return act(() => setZoom(1));
      if (e.shiftKey && e.code === "Digit1") return act(() => setZoom("fit"));
      if (mod && k === "a") return act(() => setSel(new Set(layers.filter((l) => !l.hidden && !l.locked).map((l) => l.id))));
      if (e.key === "Escape") return act(() => setSel(new Set()));
      if (!selectedLayers.length) return;
      if (e.key === "Delete" || e.key === "Backspace") return act(remove);
      if (mod && k === "d") return act(duplicate);
      if (mod && e.shiftKey && k === "l") return act(() => toggleAll("locked"));
      if (mod && e.shiftKey && k === "h") return act(() => toggleAll("hidden"));
      if (mod && (e.key === "]" || e.key === "}")) return act(() => doOrder(e.shiftKey ? "front" : "forward"));
      if (mod && (e.key === "[" || e.key === "{")) return act(() => doOrder(e.shiftKey ? "back" : "backward"));
      if (e.key === "Enter" && single?.kind === "text" && !single.locked) return act(() => setEditing(single.id));
      const step = e.shiftKey ? 10 : 1;
      const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
      if (delta) return act(() => nudge(delta[0], delta[1]));
    };
    const onCopy = (e: ClipboardEvent, cut = false) => {
      if (typingIn(e.target) || editing || !selectedLayers.length) return;
      clipboard = structuredClone(selectedLayers);
      e.clipboardData?.setData("text/plain", CLIP_MARK + JSON.stringify(clipboard));
      e.preventDefault();
      if (cut) remove();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (typingIn(e.target) || editing) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const file = e.clipboardData?.files?.[0];
      if (file && isPicture(file)) {
        e.preventDefault();
        void onDropFile(file);
        return;
      }
      if (/^\s*<svg[\s>]/i.test(text)) {
        e.preventDefault();
        add({ kind: "svg", markup: text.trim() });
        return;
      }
      let src = clipboard;
      if (text.startsWith(CLIP_MARK)) {
        try {
          src = z.array(LayerV2).parse(JSON.parse(text.slice(CLIP_MARK.length))) as LayerV2[];
        } catch {
          src = clipboard;
        }
      }
      if (!src.length) return;
      e.preventDefault();
      paste(src);
    };
    const copy = (e: ClipboardEvent) => onCopy(e);
    const cut = (e: ClipboardEvent) => onCopy(e, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("copy", copy);
    window.addEventListener("cut", cut);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("copy", copy);
      window.removeEventListener("cut", cut);
      window.removeEventListener("paste", onPaste);
    };
  });

  // ─── Checks, save, preview, reset ──────────────────────────────────────

  const check = React.useMemo(() => checkLayout(layout, kind, { fonts }), [layout, kind, fonts]);
  const flagged = React.useMemo(() => new Set(check.byLayer.keys()), [check]);

  const scopeName = AUDIENCES.find((a) => a.value === audience)?.label ?? "Everyone";
  const Noun = config.noun[0]!.toUpperCase() + config.noun.slice(1);
  const subject = scope.kind === "club" ? `Your club's ${config.noun} template` : `${Noun} for ${scopeName.toLowerCase()}`;

  /** The layout as it goes out: parsed, so every default is there. Null, with the reason shown, when something must be fixed. */
  const ready = (what: string) => {
    if (check.errors) {
      toast.warning(`${check.errors} to fix ${what}`, { description: check.first ?? undefined });
      if (check.firstLayer) setSel(new Set([check.firstLayer]));
      return null;
    }
    const parsed = LayoutV2.safeParse(layout);
    if (!parsed.success) {
      toast.warning(`Fix this ${what}`, { description: parsed.error.issues[0]?.message });
      return null;
    }
    return parsed.data;
  };

  const doSave = async () => {
    const body = ready("before saving");
    if (!body) return;
    try {
      const res = await save.mutateAsync(body);
      let next = body;
      try {
        next = readLayout(res.layout);
      } catch {
        // The server answered without the layout; what was sent is what it holds.
      }
      setSavedJson(JSON.stringify(next));
      history.replace(next);
      setVersion(res.version);
      setFromStarter(false);
      setStartedFrom(null);
      dirtyRef.current = false;
      const note = res.warnings[0]?.message;
      toast.success(`${subject} saved`, { description: note ? `Version ${res.version}. Worth a look: ${note}` : `Version ${res.version}. ${config.savedNote}` });
      onSaved();
    } catch (err) {
      toast.error(errorCopy(err));
    }
  };

  const preview = async (ticketId?: string) => {
    const body = ready("before the preview");
    if (!body) return;
    setPreviewBusy(ticketId ?? "sample");
    try {
      setPreviewImage(await previewBoard(scope, kind, audience, body, ticketId ?? null));
    } catch (err) {
      toast.error(errorCopy(err));
    } finally {
      setPreviewBusy(null);
    }
  };

  const issued = `${Noun}s already issued keep the design they were made with.`;
  const resetCopy =
    scope.kind === "club"
      ? { title: `Go back to the built-in ${config.noun}?`, body: `Your club's ${config.noun} template is removed and new events start from the built-in design. Events that saved their own keep theirs. ${issued}`, confirm: "Use the built-in design", done: "Back to the built-in design" }
      : audience === "event_default"
        ? { title: "Use your club's template again?", body: `This event's own ${config.noun} is removed and it follows your club's template again. ${issued}`, confirm: "Use the club template", done: "Back to your club's template" }
        : { title: `Reset ${scopeName}?`, body: `Their own copy is removed and they get the event's design again. ${issued}`, confirm: "Reset", done: `${scopeName} follow the event's design again` };
  const doReset = async () => {
    try {
      await reset.mutateAsync();
      toast.success(resetCopy.done);
      dirtyRef.current = false;
      setDialog(null);
      await onReset();
    } catch (err) {
      toast.error(errorCopy(err));
    }
  };

  const saving = save.isPending;
  const saveState: SaveState = saving ? "saving" : dirty ? (save.isError ? "error" : "dirty") : fromStarter ? "starter" : design.isOwn ? "saved" : "clean";
  const saveDetail = {
    saving: subject,
    error: `${errorCopy(save.error)} Your changes are still here; try again.`,
    dirty: check.errors ? `${subject} · ${check.errors} to fix before it can be saved` : subject,
    starter: `${subject} is not saved yet`,
    saved: `${subject} · version ${version}. ${config.savedNote}`,
    clean: scope.kind === "club" ? "The built-in design; nothing of your own to save yet" : audience === "event_default" ? "Following your club's template" : "Following the event's design",
  }[saveState];

  // ─── Panels ────────────────────────────────────────────────────────────

  const inspectorCtx: InspectorContext = {
    colors,
    fonts,
    tokens: design.tokens,
    samples,
    groups: config.tokenGroups,
    guestPhoto: config.guestPhoto,
    preprint: kind === "badge",
    qrHolds: kind === "certificate" ? "the link that proves the certificate is real" : "the guest's ticket code, which the gate scans",
    imageUrl: (l) => imageLinkOf(ctx, l),
    onUpload: upload,
    onSignature:
      scope.kind === "event"
        ? async (field, file) => {
            try {
              await artwork.mutateAsync({ field, file });
              toast.success(file ? "Signature saved" : "Signature removed", { description: "It is saved with this event's design already." });
            } catch (err) {
              toast.error(errorCopy(err));
            }
          }
        : undefined,
  };

  const editor = (l: TextLayerV2, frame: React.CSSProperties) => (
    <TextEditor
      layer={l}
      frame={frame}
      zoom={zoom}
      color={resolveColorV2(l.color, colors)}
      onChange={(text) => update((cur) => patchLayer(cur, l.id, { text, spans: null }), `text-${l.id}`)}
      onDone={() => {
        setEditing(null);
        history.seal();
      }}
      tokens={design.tokens}
      samples={samples}
      groups={config.tokenGroups}
    />
  );

  const [dropping, setDropping] = React.useState(false);
  const starterText = "the default design";

  return (
    <>
      <DesignBar
        left={picker}
        actions={
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setDialog("preview")}>
              <ScanEyeIcon /> Preview as issued
            </Button>
          </div>
        }
      />
      {(design.convertedFrom === "v1" || design.convertedFrom === "preset") && !dirty && !startedFrom ? (
        <Notice tone="accent" tag="Converted">
          This design was made before every part could be edited. It opens here with each part as its own layer; nothing changes until you save.
        </Notice>
      ) : null}
      {startedFrom ? (
        <Notice tone="accent" tag="Copy">
          A copy of the {startedFrom} design. Nothing changes until you save; saving makes it{" "}
          {scope.kind === "club" ? `your club's ${config.noun} template` : audience === "event_default" ? `this event's ${config.noun}` : `the ${config.noun} for ${scopeName.toLowerCase()}`}.
        </Notice>
      ) : (
      <Provenance
        scope={scope}
        audience={audience}
        scopeName={scopeName}
        config={config}
        isOwn={design.isOwn}
        fromStarter={fromStarter}
        version={version}
        dirty={dirty}
        onReset={() => setDialog("reset")}
        onLayouts={() => onGallery?.()}
        starterText={starterText}
        layoutsLabel={onGallery ? "Choose a design" : undefined}
      />
      )}

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <FigurePanel role="region" aria-label="Stage" className="overflow-hidden p-0 lg:sticky lg:top-2">
          <BoardToolbar
            onAdd={add}
            onPickSvg={() => svgInput.current?.click()}
            canAddQr={!hasQr}
            guestPhoto={config.guestPhoto}
            hasLogo={!!design.brand.logoUrl}
            selection={selectedLayers.length}
            onAlign={doAlign}
            onDistribute={doDistribute}
            onOrder={doOrder}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.undo}
            onRedo={history.redo}
            zoom={zoom}
            fit={fit}
            onZoom={setZoom}
            right={
              check.errors ? (
                <Button
                  size="sm"
                  variant="secondary"
                  danger
                  onClick={() => check.firstLayer && setSel(new Set([check.firstLayer]))}
                >
                  <AlertTriangleIcon /> {check.errors} to fix
                </Button>
              ) : (
                <span className="text-admit inline-flex items-center gap-1.5 text-[12.5px] font-medium">
                  <CheckCircle2Icon className="size-4" aria-hidden="true" /> Ready to print
                </span>
              )
            }
          />
          <input
            ref={svgInput}
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void addSvg(f);
            }}
          />
          <div
            ref={viewport}
            tabIndex={0}
            role="group"
            aria-roledescription="canvas"
            aria-label={`Canvas, ${layers.length} layers. Arrow keys move the selection, shift for 10 pixels. Enter writes in a text layer.`}
            className={cn(
              "relative h-[min(72vh,800px)] min-h-[380px] overflow-auto outline-none",
              "bg-[repeating-conic-gradient(var(--sunken)_0_25%,var(--surface)_0_50%)] bg-[length:22px_22px]",
              "focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:ring-inset",
              dropping && "ring-brand ring-2 ring-inset"
            )}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropping(false);
              const f = e.dataTransfer.files[0];
              if (f) void onDropFile(f);
            }}
          >
            <div className="grid min-h-full min-w-full place-items-center p-8" style={{ width: canvas.width * zoom + 64 }}>
              <BoardStage
                layout={layout}
                renderer={renderer}
                zoom={zoom}
                selected={selected}
                onSelect={select}
                onChange={update}
                onSettle={history.seal}
                editing={editing}
                onEdit={(id) => {
                  setEditing(id);
                  if (!id) history.seal();
                }}
                editor={editor}
                onZoom={(k) => setZoom(zoom * k)}
                flagged={flagged}
              />
            </div>
          </div>
          <p role="status" aria-live="polite" className="sr-only">
            {said}
          </p>
        </FigurePanel>

        <div className="flex min-w-0 flex-col gap-3.5">
          <BoardLayers
            layers={layers}
            selected={selected}
            onSelect={(ids, mode) => select(ids, mode)}
            onPatch={(id, p) => update((l) => patchLayer(l, id, p))}
            flagged={flagged}
            pinnedQr={config.qrRequired}
          />
          {single ? (
            <BoardInspector
              key={single.id}
              layer={single}
              onPatch={(p, group) => update((l) => patchLayer(l, single.id, p), group)}
              onClose={() => setSel(new Set())}
              onDuplicate={duplicate}
              onRemove={remove}
              canRemove={!pinnedQr(single)}
              canDuplicate={single.kind !== "qr" || !hasQr}
              problems={check.byLayer.get(single.id) ?? []}
              ctx={inspectorCtx}
            />
          ) : selectedLayers.length > 1 ? (
            <FigurePanel role="region" aria-label="Selection" className="flex flex-col gap-3 p-4">
              <CardLabel>{selectedLayers.length} layers</CardLabel>
              <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">Drag any of them to move them together. Line them up or spread them out:</p>
              <div className="flex flex-wrap items-center gap-1">
                <ArrangeButtons count={selectedLayers.length} onAlign={doAlign} onDistribute={doDistribute} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={duplicate}>
                  Duplicate
                </Button>
                <Button size="sm" variant="secondary" onClick={() => toggleAll("locked")}>
                  {selectedLayers.every((l) => l.locked) ? "Unlock" : "Lock"}
                </Button>
                <Button size="sm" variant="secondary" danger onClick={remove}>
                  Delete
                </Button>
              </div>
            </FigurePanel>
          ) : (
            <DocumentPanel layout={layout} kind={kind} colors={colors} suggestions={[...new Set([design.brand.primary, design.brand.secondary].map((c) => c.toUpperCase()))]} onChange={update} />
          )}
          {check.general.length ? (
            <Notice tone="refuse" tag="Fix">
              {check.general.join(" ")}
            </Notice>
          ) : null}
          {check.warnings.length ? (
            <Notice tone="caution" tag="Check">
              {check.warnings.slice(0, 3).join(" ")}
            </Notice>
          ) : null}
          <BoardShortcuts />
        </div>
      </div>

      <SaveBar state={saveState} detail={saveDetail} onDiscard={onDiscard} onSave={() => void doSave()} />

      <PreviewDialog
        open={dialog === "preview"}
        onClose={() => {
          setDialog(null);
          setPreviewImage(null);
        }}
        config={config}
        eventId={scope.kind === "event" ? scope.eventId : null}
        image={previewImage}
        busy={previewBusy}
        onPick={preview}
        onBack={() => setPreviewImage(null)}
      />
      <ResetDialog
        open={dialog === "reset"}
        onClose={() => setDialog(null)}
        title={resetCopy.title}
        body={resetCopy.body}
        confirm={resetCopy.confirm}
        busy={reset.isPending}
        onConfirm={() => void doReset()}
      />
    </>
  );
};

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="border-line bg-sunken text-ink-2 rounded-[6px] border px-1.5 py-0.5 font-mono text-[10.5px]">{children}</kbd>
);

/** The keys the board answers to, as a footnote under the panels. */
export const BoardShortcuts = () => (
  <p className="text-ink-3 m-0 px-1 text-[11.5px] leading-[1.9]">
    <Kbd>⇧</Kbd>-click or drag a box to pick several · <Kbd>↑↓←→</Kbd> nudge, <Kbd>⇧</Kbd> ×10 · <Kbd>⇧</Kbd> while resizing keeps the shape · hold <Kbd>⌥</Kbd> to
    move without snapping · double-click text to write · <Kbd>⌘C</Kbd> <Kbd>⌘V</Kbd> <Kbd>⌘D</Kbd> copy, paste, duplicate · <Kbd>⌘Z</Kbd> undo · <Kbd>⌘]</Kbd>{" "}
    <Kbd>⌘[</Kbd> order · <Kbd>⇧⌘L</Kbd> lock · <Kbd>⇧⌘H</Kbd> hide · <Kbd>⌘±</Kbd> zoom
  </p>
);
