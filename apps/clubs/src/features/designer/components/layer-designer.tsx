"use client";

import {
  canvasForPage,
  type ColorRef,
  layoutProblems,
  minQrSize,
  newLayerId,
  renderTicketTemplate,
  resolveColor,
  type TicketArea,
  type TicketLayer,
  TicketLayoutFields,
  ticketArea,
} from "@moa/layout";
import {
  Button,
  EmptyState,
  FigurePanel,
  IconButton,
  NativeSelect,
  Notice,
  Segmented,
  Skeleton,
  cn,
  toast,
} from "@moa/ui";
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon, Redo2Icon, RotateCcwIcon, Undo2Icon } from "lucide-react";
import * as React from "react";

import { previewLayout, uploadLayoutImage } from "../api";
import { DESIGNERS, designSamples, type DesignerConfig } from "../config";
import { useLayout, useResetLayout, useSaveLayout } from "../queries";
import { AUDIENCES, type Audience, type DesignKind, type DesignScope, type LayerDesign } from "../schemas";
import { detectTicketArea } from "./detect-area";
import { GuideDialog, LayoutsDialog, LeaveDialog, PreviewDialog, ResetDialog, type StageLook } from "./dialogs";
import { type Layout, layoutLayer, scaleLayer, useLayoutHistory, useTicketFonts } from "./kit";
import { CanvasPanel, Inspector, type InspectorContext, LayersPanel } from "./panels";
import { AudiencePicker, DesignActions, DesignBar, Provenance, SaveBar, type SaveState, Shortcuts } from "./shell";
import { AREA_ID, TicketStage } from "./stage";

const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;

const errorCopy = (err: unknown) => (err instanceof Error && err.message ? err.message : "Something went wrong.");

/** The editor's frame while its design loads: the same bar, a stage and two panels in waiting. */
const EditorSkeleton = ({ bar }: { bar: React.ReactNode }) => (
  <>
    {bar}
    <Skeleton className="h-[50px] rounded-xl" />
    <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Skeleton className="h-[min(calc(70vh+53px),813px)] min-h-[413px] rounded-2xl" />
      <div className="flex flex-col gap-3.5">
        <Skeleton className="h-[260px] rounded-2xl" />
        <Skeleton className="h-[360px] rounded-2xl" />
      </div>
    </div>
  </>
);

/**
 * The layer designer -- tickets and certificates alike. A template uploaded
 * from Figma (or a starter layout) with text, QR, image and shape layers on
 * top, every text layer a template of tokens, on a page of a known physical
 * size. Designs are per event, with an optional copy per audience.
 *
 * `dirtyRef` is the page's: it asks before switching kind, and learns about
 * unsaved work from the editor through it.
 */
export const LayerDesignerPage = ({
  scope,
  kind,
  dirtyRef,
}: {
  scope: DesignScope;
  kind: DesignKind;
  dirtyRef: React.MutableRefObject<boolean>;
}) => {
  const config = DESIGNERS[kind];
  // The club's designer has no event: the hook stays quiet for 0.
  const eventId = scope.kind === "event" ? scope.eventId : 0;
  const [audience, setAudience] = React.useState<Audience>("event_default");
  const [pending, setPending] = React.useState<Audience | null>(null);
  const [nonce, setNonce] = React.useState(0);
  const design = useLayout(scope, kind, audience);

  const changeScope = (next: Audience) => {
    if (next === audience) return;
    if (dirtyRef.current) setPending(next);
    else setAudience(next);
  };
  const picker = scope.kind === "event" ? <AudiencePicker value={audience} onChange={changeScope} /> : null;
  const leave = (
    <LeaveDialog
      open={pending !== null}
      what={config.noun}
      onStay={() => setPending(null)}
      onLeave={() => {
        dirtyRef.current = false;
        if (pending) setAudience(pending);
        setPending(null);
      }}
    />
  );

  if (design.isError) {
    return (
      <>
        <DesignBar left={picker} actions={<DesignActions disabled />} />
        <EmptyState
          tone="muted"
          title="Could not load this design"
          description={errorCopy(design.error)}
          action={
            <Button variant="secondary" onClick={() => void design.refetch()}>
              <RotateCcwIcon /> Try again
            </Button>
          }
        />
        {leave}
      </>
    );
  }
  const d = design.data;
  return (
    <>
      {d ? (
        <Editor
          key={`${audience}-${nonce}`}
          config={config}
          scope={scope}
          eventId={eventId}
          design={d}
          audience={audience}
          picker={picker}
          onSaved={() => void design.refetch()}
          onDiscard={() => setNonce((n) => n + 1)}
          onReset={async () => {
            // The design reset to is a different one: open it fresh, history and all.
            await design.refetch();
            setNonce((n) => n + 1);
          }}
          dirtyRef={dirtyRef}
        />
      ) : (
        <EditorSkeleton bar={<DesignBar left={picker} actions={<DesignActions disabled />} />} />
      )}
      {leave}
    </>
  );
};

interface EditorProps {
  config: DesignerConfig;
  scope: DesignScope;
  eventId: number;
  design: LayerDesign;
  audience: Audience;
  /** Who the design is for -- an event's only; the club's templates are for everyone. */
  picker: React.ReactNode;
  onSaved: () => void;
  onDiscard: () => void;
  onReset: () => Promise<void>;
  dirtyRef: React.MutableRefObject<boolean>;
}

const Editor = ({ config, scope, eventId, design, audience, picker, onSaved, onDiscard, onReset, dirtyRef }: EditorProps) => {
  const save = useSaveLayout(scope, config.kind, audience);
  const reset = useResetLayout(scope, config.kind, audience);
  const initial = React.useMemo<Layout>(() => ({ canvas: design.canvas, layers: design.layers, page: design.page }), [design]);
  // What the server holds; updated on save so the editor need not remount -- a
  // remount would close a preview opened right after saving.
  const [savedJson, setSavedJson] = React.useState(() => JSON.stringify(initial));
  const [version, setVersion] = React.useState(design.version);
  const [fromStarter, setFromStarter] = React.useState(design.fromStarter);
  const history = useLayoutHistory(initial);
  const { layout, set, undo, redo, seal } = history;
  const [selected, setSelected] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const [zoomChoice, setZoomChoice] = React.useState<"fit" | number>("fit");
  const [fitWidth, setFitWidth] = React.useState(900);
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const [uploading, setUploading] = React.useState(false);
  const [finding, setFinding] = React.useState(false);
  const [dialog, setDialog] = React.useState<"guide" | "preview" | "reset" | "layouts" | null>(null);
  const [previewImage, setPreviewImage] = React.useState<Blob | null>(null);
  const fontsReady = useTicketFonts();
  const stageBox = React.useRef<HTMLDivElement>(null);

  const dirty = JSON.stringify(layout) !== savedJson;
  // The page asks before switching audience; it learns about unsaved work from here.
  React.useEffect(() => {
    dirtyRef.current = dirty;
    return () => {
      dirtyRef.current = false;
    };
  }, [dirty, dirtyRef]);
  const { canvas, layers, page } = layout;
  const scopeName = AUDIENCES.find((a) => a.value === audience)?.label ?? "Everyone";
  const Noun = config.noun[0]!.toUpperCase() + config.noun.slice(1);
  /** What is open, in words: "Ticket for speakers", "Your club's ticket template". */
  const subject = scope.kind === "club" ? `Your club's ${config.noun} template` : `${Noun} for ${scopeName.toLowerCase()}`;

  // Fit the canvas to the space it has.
  React.useLayoutEffect(() => {
    const el = stageBox.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFitWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The preview shows the ticket area alone, so it fits by that width.
  const shownWidth = mode === "preview" ? ticketArea(canvas).width : canvas.width;
  const fit = Math.max(0.05, Math.min(2, (fitWidth - 64) / shownWidth));
  const zoom = zoomChoice === "fit" ? fit : zoomChoice;

  // Leaving with unsaved work asks first.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const colors = React.useMemo(
    () => ({ primary: design.brand.primary, secondary: design.brand.secondary, ticketType: design.brand.primary }),
    [design.brand]
  );
  const resolve = React.useCallback((c: ColorRef) => resolveColor(c, colors), [colors]);
  // The server's samples are made by the renderer's own code; the catalogue fills any it does not know.
  const samples = React.useMemo(() => designSamples(design.sampleValues), [design.sampleValues]);

  const urlOf = React.useCallback(
    (key: string | null | undefined) => (key ? (urls[key] ?? design.imageUrls[key] ?? null) : null),
    [urls, design.imageUrls]
  );
  const templateUrl = canvas.templateKey
    ? (urlOf(canvas.templateKey) ?? (canvas.templateKey === design.canvas.templateKey ? (design.templateUrl ?? null) : null))
    : null;
  const imageUrl = React.useCallback(
    (l: Extract<TicketLayer, { kind: "image" }>) =>
      l.source === "org_logo" ? (design.brand.logoUrl ?? null) : l.source === "event_icon" ? (design.eventIconUrl ?? null) : urlOf(l.imageKey),
    [design, urlOf]
  );

  const problems = React.useMemo(() => {
    const byLayer = new Map<string, string[]>();
    const general: string[] = [];
    for (const p of layoutProblems(canvas, layers, page, { qrRequired: config.qrRequired })) {
      const idx = typeof p.path[1] === "number" ? p.path[1] : null;
      const l = idx !== null ? layers[idx] : undefined;
      if (l) byLayer.set(l.id, [...(byLayer.get(l.id) ?? []), p.message]);
      else general.push(p.message);
    }
    return { byLayer, general, count: general.length + [...byLayer.values()].reduce((n, m) => n + m.length, 0) };
  }, [canvas, layers, page, config.qrRequired]);
  const problemIds = React.useMemo(() => new Set(problems.byLayer.keys()), [problems]);

  const patch = React.useCallback(
    (id: string, p: Partial<TicketLayer>, group?: string) =>
      set((cur) => ({ ...cur, layers: cur.layers.map((l) => (l.id === id ? ({ ...l, ...p } as TicketLayer) : l)) }), group),
    [set]
  );
  const pinnedQr = (l: TicketLayer | undefined) => l?.kind === "qr" && config.qrRequired;
  const remove = (id: string) => {
    if (pinnedQr(layers.find((l) => l.id === id))) return;
    set((cur) => ({ ...cur, layers: cur.layers.filter((l) => l.id !== id) }));
    setSelected(null);
  };
  const duplicate = (id: string) => {
    const l = layers.find((x) => x.id === id);
    if (!l || l.kind === "qr") return;
    const copy = { ...l, id: newLayerId(l.kind), name: `${l.name} copy`.slice(0, 60), x: l.x + 20, y: l.y + 20, locked: false } as TicketLayer;
    set((cur) => {
      const i = cur.layers.findIndex((x) => x.id === id);
      return { ...cur, layers: [...cur.layers.slice(0, i + 1), copy, ...cur.layers.slice(i + 1)] };
    });
    setSelected(copy.id);
  };
  const move = (id: string, dir: -1 | 1) =>
    set((cur) => {
      const i = cur.layers.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.layers.length) return cur;
      const next = [...cur.layers];
      const a = next[i]!;
      next[i] = next[j]!;
      next[j] = a;
      return { ...cur, layers: next };
    });
  const add = (kind: TicketLayer["kind"]) => {
    const W = canvas.width;
    const H = canvas.height;
    const base = { id: newLayerId(kind), x: Math.round(W * 0.08), y: Math.round(H * 0.4), hidden: false, locked: false, preprinted: false };
    let layer: TicketLayer;
    if (kind === "text")
      layer = {
        ...base,
        kind,
        name: "Text",
        text: "{{attendee_name}}",
        width: Math.round(W * 0.4),
        size: Math.max(12, Math.round(H * 0.06)),
        font: "inter",
        weight: 500,
        color: "#141614",
        align: "left",
        maxLines: 1,
        lineSpacing: 0,
        letterSpacing: 0,
        fit: "shrink",
        opacity: 1,
      };
    else if (kind === "qr") {
      const size = Math.max(minQrSize(canvas, page), Math.round(Math.min(W, H) * 0.3));
      layer = { ...base, kind, id: "qr", name: "QR code", size, x: W - size - Math.round(W * 0.05), y: Math.round((H - size) / 2), quietZone: 2, dark: "#000000", light: "#FFFFFF" };
    } else if (kind === "image")
      layer = {
        ...base,
        kind,
        name: design.brand.logoUrl ? "Club logo" : "Image",
        y: Math.round(H * 0.06),
        width: Math.round(W * 0.16),
        height: Math.round(H * 0.16),
        source: design.brand.logoUrl ? "org_logo" : "upload",
        imageKey: null,
        fit: "contain",
        // Placed at the left margin, so it starts where the text does.
        align: "left",
        radius: 0,
        opacity: 1,
      };
    else if (kind === "agenda") {
      // One per design: a second press selects the one there is.
      const existing = layers.find((l) => l.kind === "agenda");
      if (existing) {
        setSelected(existing.id);
        setMode("edit");
        return;
      }
      layer = {
        ...base,
        kind,
        id: "agenda",
        name: "Run of show",
        x: Math.round(W * 0.08),
        y: Math.round(H * 0.3),
        width: Math.round(W * 0.84),
        height: Math.round(H * 0.6),
        font: "inter",
        size: Math.max(12, Math.round(H * 0.035)),
        color: "#141614",
        accent: "brand.primary",
        muted: "#5A5F5B",
        align: "left",
        rowGap: Math.round(H * 0.015),
        columns: 1,
        showSpeaker: true,
        showLocation: true,
        showDayHeadings: true,
        opacity: 1,
      };
    } else
      layer = { ...base, kind, name: "Shape", y: Math.round(H * 0.1), width: Math.round(W * 0.2), height: Math.round(H * 0.1), fill: "brand.primary", stroke: null, strokeWidth: 0, radius: 0, opacity: 1, path: null };
    set((cur) => ({ ...cur, layers: [...cur.layers, layer] }));
    setSelected(layer.id);
    setMode("edit");
  };

  const upload = async (file: File, purpose: "template" | "image") => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("That image is over 5 MB", { description: "Export it smaller and try again." });
      return null;
    }
    try {
      const res = await uploadLayoutImage(scope, config.kind, file, purpose);
      setUrls((u) => ({ ...u, [res.key]: res.url }));
      return res;
    } catch (err) {
      toast.error(errorCopy(err));
      return null;
    }
  };

  /**
   * A background picture never changes the ticket's size: it is cropped to fit.
   * A layout with photo slots (the Invitation's stub and body) takes it there,
   * with the scrim; any other layout gets one picture under everything.
   */
  const photoSlots = (ls: TicketLayer[]) =>
    ls.filter((l): l is Extract<TicketLayer, { kind: "image" }> => l.kind === "image" && l.source === "upload" && /-photo$/.test(l.id));
  /** The photo slots as the Canvas panel shows them: one row each, with the picture it holds. */
  const photos = React.useMemo(
    () => photoSlots(layers).map((l) => ({ id: l.id, name: l.name, url: l.imageKey && !l.hidden ? urlOf(l.imageKey) : null })),
    [layers, urlOf]
  );
  /** The largest slot is the body of the ticket: the scrim belongs to it. */
  const largestSlot = (ls: TicketLayer[]) => {
    const slots = photoSlots(ls);
    return slots.length ? slots.reduce((x, y) => (y.width * y.height > x.width * x.height ? y : x)).id : null;
  };
  /**
   * A background panel: a solid, opaque shape big enough to be a ticket's ground
   * and touching two or more canvas edges -- the Invitation's stub and body, a
   * design's own full-bleed rectangle. A picture goes on top of each, cropped
   * to it, so what sits above the panel (title box, QR tile, text) stays clear.
   */
  const isPanel = (l: TicketLayer, c: { width: number; height: number }): l is Extract<TicketLayer, { kind: "shape" }> => {
    if (l.kind !== "shape" || !l.fill || l.path || l.hidden || (l.opacity ?? 1) < 0.95) return false;
    if (l.width * l.height < 0.2 * c.width * c.height) return false;
    const edges = [l.x <= 1, l.y <= 1, l.x + l.width >= c.width - 1, l.y + l.height >= c.height - 1].filter(Boolean).length;
    return edges >= 2;
  };
  /**
   * Put a picture behind the ticket. With a slot named, only that panel takes
   * it; otherwise every slot does. A layout without slots gets them made above
   * its panels (and a scrim over the largest), or one picture under everything.
   */
  const setBackgroundPhoto = (key: string, slotId: string | null = null) => {
    set((cur) => {
      const slots = photoSlots(cur.layers);
      if (slots.length) {
        const targets = slotId ? slots.filter((l) => l.id === slotId) : slots;
        const body = largestSlot(cur.layers);
        const bodyShown =
          targets.some((t) => t.id === body) || cur.layers.some((l) => l.id === body && !l.hidden && (l as { imageKey?: string | null }).imageKey);
        return {
          ...cur,
          layers: cur.layers.map((l) =>
            targets.some((t) => t.id === l.id) ? { ...l, imageKey: key, hidden: false } : l.id === "scrim" ? { ...l, hidden: !bodyShown } : l
          ),
        };
      }
      const photo = (id: string, name: string, r: { x: number; y: number; width: number; height: number; radius: number }): TicketLayer => ({
        id,
        name,
        kind: "image",
        source: "upload",
        imageKey: key,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        fit: "cover",
        align: "center",
        radius: r.radius,
        opacity: 1,
        hidden: false,
        locked: false,
        preprinted: false,
      });
      const panels = cur.layers.filter((l) => isPanel(l, cur.canvas));
      if (panels.length) {
        // One photo slot above each panel, and a scrim over the largest so the type stays legible.
        const largest = panels.reduce((x, y) => (y.width * y.height > x.width * x.height ? y : x));
        const hasScrim = cur.layers.some((l) => l.id === "scrim");
        const next = cur.layers.flatMap((l) => {
          if (!panels.includes(l as (typeof panels)[number])) return [l];
          const p = l as (typeof panels)[number];
          const out: TicketLayer[] = [l, photo(`${p.id}-photo`, `${p.name.replace(/ colour$/i, "")} photo`, p)];
          if (p === largest && !hasScrim)
            out.push({
              id: "scrim",
              name: "Photo scrim",
              kind: "shape",
              x: p.x,
              y: p.y,
              width: p.width,
              height: p.height,
              fill: "#141614",
              stroke: null,
              strokeWidth: 0,
              radius: p.radius,
              opacity: 0.45,
              path: null,
              hidden: false,
              locked: false,
              preprinted: false,
            });
          return out;
        });
        return { ...cur, layers: next };
      }
      const r = ticketArea(cur.canvas);
      return { ...cur, layers: [photo("bg-photo", "Background photo", r), ...cur.layers.filter((l) => l.id !== "bg-photo")] };
    });
  };
  /** Take a picture out of one slot, or out of every slot and the plain background layer. */
  const removeBackgroundPhoto = (slotId: string | null = null) =>
    set((cur) => {
      const slots = photoSlots(cur.layers).filter((l) => !slotId || l.id === slotId);
      const body = largestSlot(cur.layers);
      const next = cur.layers
        .filter((l) => slotId || l.id !== "bg-photo")
        .map((l) => (slots.some((t) => t.id === l.id) ? { ...l, imageKey: null, hidden: true } : l));
      const bodyShown = next.some((l) => l.id === body && !l.hidden && (l as { imageKey?: string | null }).imageKey);
      return { ...cur, layers: next.map((l) => (l.id === "scrim" ? { ...l, hidden: !bodyShown } : l)) };
    });
  const uploadBackground = async (file: File, slotId: string | null = null) => {
    setUploading(true);
    const res = await upload(file, "image");
    setUploading(false);
    if (!res) return;
    setBackgroundPhoto(res.key, slotId);
    const slot = slotId ? layers.find((l) => l.id === slotId)?.name : null;
    toast.success(slot ? `${slot} set` : "Picture added", {
      description: slot
        ? `Cropped to that panel; the ${config.noun} keeps its size.`
        : `It fills the ${config.noun}, cropped to fit; the ${config.noun} keeps its size. Each panel can take its own picture from the Background section.`,
    });
  };

  // A picture dropped on the stage: into the selected image layer, else onto the panel under the cursor, else the whole background.
  const [dropping, setDropping] = React.useState(false);
  const canvasPoint = (e: React.DragEvent) => {
    const svg = stageBox.current?.querySelector("svg");
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  };
  const slotAt = (pt: { x: number; y: number } | null) => {
    if (!pt) return null;
    const hit = photoSlots(layers).find((l) => pt.x >= l.x && pt.x <= l.x + l.width && pt.y >= l.y && pt.y <= l.y + l.height);
    return hit?.id ?? null;
  };
  const [dropSlot, setDropSlot] = React.useState<string | null>(null);
  const onDropFile = async (file: File, slotId: string | null) => {
    if (!file.type.startsWith("image/")) return;
    const target = layers.find((l) => l.id === selected);
    if (target?.kind === "image" && target.source === "upload" && !/-photo$/.test(target.id)) {
      const res = await upload(file, "image");
      if (res) set((cur) => ({ ...cur, layers: cur.layers.map((l) => (l.id === target.id ? { ...l, imageKey: res.key } : l)) }));
      return;
    }
    await uploadBackground(file, slotId);
  };

  /** Where the layers actually are: the ticket's own extent, whatever the canvas around it. */
  const layerBounds = (ls: TicketLayer[]) => {
    const shown = ls.filter((l) => !l.hidden);
    if (!shown.length) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const l of shown) {
      const w = l.kind === "qr" ? l.size : l.width;
      const h = l.kind === "qr" ? l.size : l.kind === "text" ? l.size * 1.3 : l.height;
      x0 = Math.min(x0, l.x);
      y0 = Math.min(y0, l.y);
      x1 = Math.max(x1, l.x + w);
      y1 = Math.max(y1, l.y + h);
    }
    return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
  };
  /** How much of the canvas the layers cover, per axis -- under 90 % and the rest prints as bare background. */
  const coverage = React.useMemo(() => {
    const b = layerBounds(layers);
    if (!b) return null;
    return { w: Math.min(1, b.width / canvas.width), h: Math.min(1, b.height / canvas.height), bounds: b };
  }, [layers, canvas.width, canvas.height]);

  /**
   * Fit the layers into a canvas size: the ticket they form (their bounding
   * box, not the old canvas) is scaled uniformly to fill the new size from the
   * top-left, the QR never below the readable floor.
   */
  const resizeCanvas = (width: number, height: number, extra: Partial<Layout["canvas"]> = {}) =>
    set((cur) => {
      const from = layerBounds(cur.layers) ?? ticketArea(cur.canvas);
      const k = Math.min(width / from.width, height / from.height);
      const floor = minQrSize({ width, height, area: null }, cur.page);
      return {
        ...cur,
        canvas: { ...cur.canvas, width, height, area: null, ...extra },
        layers: cur.layers.map((l) => {
          const shifted = { ...l, x: l.x - from.x, y: l.y - from.y } as TicketLayer;
          const scaled = Math.abs(k - 1) > 0.001 ? scaleLayer(shifted, k) : shifted;
          return scaled.kind === "qr" && scaled.size < floor ? { ...scaled, size: floor } : scaled;
        }),
      };
    });
  /** The canvas shrinks to the layers: same pixels, no bare margin. */
  const cropCanvas = () =>
    set((cur) => {
      const b = layerBounds(cur.layers);
      if (!b) return cur;
      return {
        ...cur,
        canvas: { ...cur.canvas, width: Math.round(b.width), height: Math.round(b.height), area: null },
        layers: cur.layers.map((l) => ({ ...l, x: Math.round((l.x - b.x) * 10) / 10, y: Math.round((l.y - b.y) * 10) / 10 }) as TicketLayer),
      };
    });

  const uploadTemplate = async (file: File) => {
    setUploading(true);
    const res = await upload(file, "template");
    if (!res?.width || !res.height) {
      setUploading(false);
      return;
    }
    // The ticket inside the export, if the file carries an artboard around it.
    const area = await detectTicketArea(file, { width: res.width, height: res.height });
    setUploading(false);
    // The layout follows the ticket, not the file: what sat on the old ticket
    // rectangle lands on the new one, scaled so that all of it still fits.
    const from = ticketArea(canvas);
    const to = area ?? { x: 0, y: 0, width: res.width, height: res.height, radius: 0 };
    const k = Math.min(to.width / from.width, to.height / from.height);
    const scale = Math.abs(k - 1) > 0.001;
    const moved = Math.abs(to.x - from.x) > 0.5 || Math.abs(to.y - from.y) > 0.5;
    const next = { width: res.width, height: res.height, area };
    // Scaled with everything else, but never below what a phone can read.
    const floor = minQrSize(next, page);
    const width = res.width;
    const height = res.height;
    set((cur) => ({
      ...cur,
      canvas: { ...cur.canvas, width, height, templateKey: res.key, area },
      layers: cur.layers.map((l) => {
        const shifted = { ...l, x: l.x - from.x, y: l.y - from.y } as TicketLayer;
        const scaled = scale ? scaleLayer(shifted, k) : shifted;
        const placed = { ...scaled, x: Math.round((scaled.x + to.x) * 10) / 10, y: Math.round((scaled.y + to.y) * 10) / 10 } as TicketLayer;
        return placed.kind === "qr" && placed.size < floor ? { ...placed, size: floor } : placed;
      }),
    }));
    if (area) setSelected(AREA_ID);
    toast.success(`Template set · ${res.width} × ${res.height} px`, {
      description: area
        ? `The ${config.noun} was found at ${area.width} × ${area.height} inside the artboard — only that part prints. The layers were placed on it; check the frame, then their places.`
        : scale || moved
          ? `The layers were scaled ×${k.toFixed(2)} to match. Check their places, then save.`
          : "X and Y now read in this file’s pixels.",
    });
  };

  /** Re-run the ticket search on the template already uploaded. */
  const findArea = async () => {
    if (!templateUrl) return;
    setFinding(true);
    try {
      const blob = await fetch(templateUrl).then((r) => (r.ok ? r.blob() : Promise.reject(new Error("The template could not be read back."))));
      const area = await detectTicketArea(blob, { width: canvas.width, height: canvas.height });
      if (!area) {
        toast("No frame found around the ticket", {
          description: "The template looks like the ticket edge to edge. Drag a frame on the canvas if part of it should not print.",
        });
        return;
      }
      set((cur) => ({ ...cur, canvas: { ...cur.canvas, area } }));
      setSelected(AREA_ID);
      toast.success(`Ticket found · ${area.width} × ${area.height} px`, {
        description: "Only that rectangle prints. Drag its corner or edit the numbers if it is off.",
      });
    } catch (err) {
      toast.error(errorCopy(err));
    } finally {
      setFinding(false);
    }
  };

  /** The first thing wrong with the design, or null; selects the layer it is on. */
  const firstProblem = () => {
    const parsed = TicketLayoutFields.safeParse(layout);
    const message =
      problems.general[0] ?? [...problems.byLayer.values()][0]?.[0] ?? (parsed.success ? null : parsed.error.issues[0]?.message) ?? null;
    if (message) {
      const first = [...problems.byLayer.keys()][0];
      if (first) setSelected(first);
    }
    return message;
  };

  const doSave = async () => {
    const wrong = firstProblem();
    if (wrong) {
      toast.warning(`${problems.count || "Something"} to fix before saving`, { description: wrong });
      return;
    }
    const parsed = TicketLayoutFields.safeParse(layout);
    if (!parsed.success) return;
    try {
      const res = await save.mutateAsync(parsed.data);
      toast.success(`${subject} saved`, { description: `Version ${res.version}. ${config.savedNote}` });
      const next = { canvas: res.canvas, layers: res.layers, page: res.page };
      setSavedJson(JSON.stringify(next));
      set(next);
      setVersion(res.version);
      setFromStarter(false);
      dirtyRef.current = false;
      onSaved();
    } catch (err) {
      toast.error(errorCopy(err));
    }
  };

  const [previewBusy, setPreviewBusy] = React.useState<string | null>(null);
  const preview = async (ticketId?: string) => {
    const wrong = firstProblem();
    if (wrong) {
      toast.warning("Fix the flagged layers first", { description: wrong });
      return;
    }
    const parsed = TicketLayoutFields.safeParse(layout);
    if (!parsed.success) return;
    setPreviewBusy(ticketId ?? "sample");
    try {
      setPreviewImage(await previewLayout(scope, config.kind, audience, parsed.data, ticketId ?? null));
    } catch (err) {
      toast.error(errorCopy(err));
    } finally {
      setPreviewBusy(null);
    }
  };

  /** What a reset removes, and what the design falls back to, in each place it can happen. */
  const issued = `${Noun}s already issued keep the design they were made with.`;
  const resetCopy =
    scope.kind === "club"
      ? {
          title: `Go back to the built-in ${config.noun}?`,
          body: `Your club's ${config.noun} template is removed and new events start from the built-in layout. Events that saved their own keep theirs. ${issued}`,
          confirm: "Use the built-in layout",
          done: "Back to the built-in layout",
        }
      : audience === "event_default"
        ? {
            title: "Use your club's template again?",
            body: `This event's own ${config.noun} is removed and it follows your club's template again. ${issued}`,
            confirm: "Use the club template",
            done: "Back to your club's template",
          }
        : {
            title: `Reset ${scopeName}?`,
            body: `Their own copy is removed and they get the event's design again. ${issued}`,
            confirm: "Reset",
            done: `${scopeName} follow the event's design again`,
          };

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

  // Keyboard: nudge, delete, duplicate, undo/redo, deselect -- never while typing.
  const selectedLayer = layers.find((l) => l.id === selected) ?? null;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]') || t.closest('[role="dialog"]'))) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mode !== "edit") return;
      if (e.key === "Escape") setSelected(null);
      const step = e.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (selected === AREA_ID && canvas.area) {
        if (delta) {
          e.preventDefault();
          const a = canvas.area;
          const area: TicketArea = {
            ...a,
            x: Math.min(canvas.width - a.width, Math.max(0, a.x + delta[0]!)),
            y: Math.min(canvas.height - a.height, Math.max(0, a.y + delta[1]!)),
          };
          set((cur) => ({ ...cur, canvas: { ...cur.canvas, area } }), "nudge-area");
        }
        return;
      }
      if (!selectedLayer) return;
      if ((e.key === "Delete" || e.key === "Backspace") && !pinnedQr(selectedLayer)) {
        e.preventDefault();
        remove(selectedLayer.id);
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate(selectedLayer.id);
      }
      if (delta && !selectedLayer.locked) {
        e.preventDefault();
        patch(selectedLayer.id, { x: selectedLayer.x + delta[0]!, y: selectedLayer.y + delta[1]! }, `nudge-${selectedLayer.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const inspectorCtx: InspectorContext = {
    resolve,
    tokens: design.tokens,
    samples,
    rendered: (l) => {
      const text = renderTicketTemplate(l.text, samples);
      return { text, truncated: fontsReady ? layoutLayer(l, text).truncated : false };
    },
    canvas,
    page,
    config,
    onUploadImage: (f) => upload(f, "image"),
    imageUrl,
    disabled: false,
  };
  const qr = layers.find((l) => l.kind === "qr");
  const saving = save.isPending;

  // Whether the design is saved, said in one place that never scrolls away.
  const saveState: SaveState = saving
    ? "saving"
    : dirty
      ? save.isError
        ? "error"
        : "dirty"
      : fromStarter
        ? "starter"
        : design.isOwn
          ? "saved"
          : "clean";
  const saveDetail = {
    saving: subject,
    error: `${errorCopy(save.error)} Your changes are still here; try again.`,
    dirty: problems.count ? `${subject} · ${problems.count} to fix before it can be saved` : subject,
    starter: `${subject} is a starter layout until you save it`,
    saved: `${subject} · version ${version}. ${config.savedNote}`,
    clean:
      scope.kind === "club"
        ? "The built-in layout; nothing of your own to save yet"
        : audience === "event_default"
          ? "Following your club's template"
          : "Following the event's design",
  }[saveState];

  const look: StageLook = {
    colors,
    values: samples,
    qrValue: config.sampleQr,
    imageUrl,
    fontsReady,
    agenda: design.agenda,
    timezone: design.timezone,
  };
  const firstBad = [...problems.byLayer.keys()][0] ?? null;
  const dropLabel = (() => {
    const sel = layers.find((l) => l.id === selected);
    if (sel?.kind === "image" && sel.source === "upload" && !/-photo$/.test(sel.id)) return "Drop to set this image";
    const slot = dropSlot ? layers.find((l) => l.id === dropSlot) : null;
    return slot ? `Drop to set the ${slot.name.toLowerCase()}` : photos.length ? "Drop to set every panel’s picture" : "Drop to use as the background picture";
  })();

  return (
    <>
      <DesignBar
        left={picker}
        actions={<DesignActions onGuide={() => setDialog("guide")} onLayouts={() => setDialog("layouts")} onPreview={() => setDialog("preview")} />}
      />
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
        onLayouts={() => setDialog("layouts")}
      />

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <FigurePanel role="region" aria-label="Stage" className="overflow-hidden p-0 lg:sticky lg:top-2">
          <div className="border-line-soft flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
            <Segmented
              label="View"
              value={mode}
              onChange={setMode}
              options={[
                { value: "edit", label: "Edit layout" },
                { value: "preview", label: "With sample data" },
              ]}
            />
            <NativeSelect
              size="sm"
              aria-label="Zoom"
              value={String(zoomChoice)}
              onChange={(e) => setZoomChoice(e.target.value === "fit" ? "fit" : Number(e.target.value))}
              className="w-[118px]"
            >
              <option value="fit">Fit · {Math.round(fit * 100)}%</option>
              {ZOOMS.map((z) => (
                <option key={z} value={z}>
                  {z * 100}%
                </option>
              ))}
            </NativeSelect>
            <span className="bg-line mx-0.5 h-5 w-px" aria-hidden="true" />
            <IconButton label="Undo (⌘Z)" disabled={!history.canUndo} onClick={undo}>
              <Undo2Icon />
            </IconButton>
            <IconButton label="Redo (⇧⌘Z)" disabled={!history.canRedo} onClick={redo}>
              <Redo2Icon />
            </IconButton>
            <span className="flex-1" />
            {!fontsReady ? (
              <span className="text-ink-3 inline-flex items-center gap-1.5 text-[12px]">
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> Loading fonts
              </span>
            ) : null}
            {problems.count ? (
              <Button
                size="sm"
                variant="secondary"
                danger
                onClick={() => {
                  setMode("edit");
                  setSelected(firstBad);
                }}
              >
                <AlertTriangleIcon /> {problems.count} to fix
              </Button>
            ) : (
              <span className="text-admit inline-flex items-center gap-1.5 text-[12.5px] font-medium">
                <CheckCircle2Icon className="size-4" aria-hidden="true" /> Ready to print
              </span>
            )}
          </div>
          <div
            ref={stageBox}
            className={cn(
              "relative h-[min(70vh,760px)] min-h-[360px] overflow-auto bg-[repeating-conic-gradient(var(--sunken)_0_25%,var(--surface)_0_50%)] bg-[length:22px_22px]",
              dropping && "ring-brand ring-2 ring-inset"
            )}
            onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              setDropping(true);
              setDropSlot(slotAt(canvasPoint(e)));
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropping(false);
              const f = e.dataTransfer.files[0];
              if (f) void onDropFile(f, slotAt(canvasPoint(e)));
            }}
          >
            {dropping ? (
              <div className="bg-brand/10 pointer-events-none absolute inset-0 z-10 grid place-items-center">
                <span className="border-brand-line bg-surface text-ink shadow-floating rounded-[var(--radius-md)] border px-3 py-2 text-[13px] font-medium">
                  {dropLabel}
                </span>
              </div>
            ) : null}
            <div className="grid min-h-full min-w-full place-items-center p-8" style={{ width: shownWidth * zoom + 64 }}>
              <TicketStage
                layout={layout}
                mode={mode}
                zoom={zoom}
                selected={selected}
                onSelect={setSelected}
                onChange={(next, group) => set(next, group)}
                onSettle={seal}
                colors={colors}
                values={samples}
                qrValue={config.sampleQr}
                templateUrl={templateUrl}
                imageUrl={imageUrl}
                fontsReady={fontsReady}
                problemIds={problemIds}
                agenda={design.agenda}
                timezone={design.timezone}
              />
            </div>
          </div>
        </FigurePanel>

        <div className="flex min-w-0 flex-col gap-3.5">
          <LayersPanel
            agendaAllowed={config.kind === "agenda"}
            layers={layers}
            selected={selected}
            onSelect={setSelected}
            onPatch={(id, p) => patch(id, p)}
            onMove={move}
            onDuplicate={duplicate}
            onRemove={remove}
            onAdd={add}
            problems={problems.byLayer}
            disabled={false}
            qrRequired={config.qrRequired}
          />
          {selectedLayer ? (
            <Inspector
              key={selectedLayer.id}
              layer={selectedLayer}
              onPatch={(p, group) => patch(selectedLayer.id, p, group)}
              onClose={() => setSelected(null)}
              problems={problems.byLayer.get(selectedLayer.id) ?? []}
              ctx={inspectorCtx}
            />
          ) : (
            <CanvasPanel
              config={config}
              layout={layout}
              templateUrl={templateUrl}
              uploading={uploading}
              disabled={false}
              qrSize={qr?.kind === "qr" ? qr.size : null}
              onCanvas={(p) => set((cur) => ({ ...cur, canvas: { ...cur.canvas, ...p } }), `canvas-${Object.keys(p).join("-")}`)}
              onUploadTemplate={uploadTemplate}
              onRemoveTemplate={() => {
                const fitted = canvasForPage(page, config.dpi);
                const back = page.heightMm ? fitted : { width: 1560, height: 690 };
                resizeCanvas(back.width, back.height, { templateKey: null });
                toast.success(`Back to ${back.width} × ${back.height}`, { description: `The layers were scaled to fit the ${config.noun} again.` });
              }}
              onResize={(w, h) => resizeCanvas(w, h)}
              onFill={() => resizeCanvas(canvas.width, canvas.height)}
              onCrop={cropCanvas}
              coverage={coverage ? { w: coverage.w, h: coverage.h } : null}
              photos={photos}
              onUploadBackground={uploadBackground}
              onRemoveBackground={removeBackgroundPhoto}
              onPage={(p) => set((cur) => ({ ...cur, page: p }), "page")}
              onFindArea={findArea}
              finding={finding}
              areaSelected={selected === AREA_ID}
            />
          )}
          {problems.general.length ? (
            <Notice tone="refuse" tag="Fix">
              {problems.general.join(" ")}
            </Notice>
          ) : null}
          <Shortcuts />
        </div>
      </div>

      <SaveBar state={saveState} detail={saveDetail} onDiscard={onDiscard} onSave={doSave} />

      <GuideDialog open={dialog === "guide"} onClose={() => setDialog(null)} config={config} page={page} />
      <PreviewDialog
        open={dialog === "preview"}
        onClose={() => {
          setDialog(null);
          setPreviewImage(null);
        }}
        config={config}
        eventId={scope.kind === "event" ? eventId : null}
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
      <LayoutsDialog
        open={dialog === "layouts"}
        onClose={() => setDialog(null)}
        config={config}
        page={page}
        look={look}
        onPick={(name) => {
          set(config.starter(name, { seats: false, page }));
          setSelected(null);
          setMode("edit");
          setDialog(null);
          toast.success(`${config.starters[name]?.label ?? "The"} layout is on the stage`, { description: "Not what you wanted? Undo brings the last design back." });
        }}
      />
    </>
  );
};
