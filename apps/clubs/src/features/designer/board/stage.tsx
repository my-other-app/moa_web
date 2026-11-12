"use client";

import type { LayerV2, LayoutV2, TextLayerV2 } from "@moa/layout";
import { cn } from "@moa/ui";
import * as React from "react";

import { type DocRenderer, ensureDocFonts, fitLayers } from "./engine";
import {
  type Box,
  type Guide,
  HANDLES,
  type Handle,
  type Point,
  type Rect,
  boundsOf,
  hitTest,
  marqueeHits,
  rectFrom,
  resizeBox,
  resizeGroup,
  rotationTo,
  round2,
  snapLines,
  snapMove,
  unionOf,
} from "./geometry";

/**
 * The board's stage: the design as the builder draws it, scaled, with the
 * interaction layer on top.
 *
 * The design is the same DOM `buildHtml` makes for the PDF, in a shadow root
 * so neither the dashboard's styles nor the design's leak into the other.
 * It is patched, not rebuilt: when the layout changes, only the layers whose
 * HTML changed are replaced, and while a layer is dragged, resized or
 * turned, only that layer's box style (and its outline's) is written, once
 * a frame -- React does not render during a gesture at all. The gesture is
 * committed to the layout, one undo step, when the pointer is let go.
 *
 * Picking is arithmetic on the layer boxes (geometry.ts), not the DOM's
 * hit-testing, so a click lands on what is drawn on top even where a layer
 * is transparent, and locked layers let clicks through to what is below.
 */

export type SelectMode = "replace" | "toggle" | "add";

/** Snap within this many screen pixels. */
const SNAP_PX = 6;
/** A press that moves less than this is a click, not a drag. */
const CLICK_PX = 3;

type Gesture =
  | { type: "move"; ids: string[]; start: Point; origin: Map<string, Box>; union: Rect; snap: ReturnType<typeof snapLines>; moved: boolean; clicked: string | null; additive: boolean }
  | { type: "resize"; ids: string[]; handle: Handle; start: Point; origin: Map<string, Box>; snap: ReturnType<typeof snapLines> }
  | { type: "rotate"; id: string; origin: Box }
  | { type: "marquee"; start: Point; additive: boolean; base: string[] };

/** Where each layer goes when a gesture ends, by id. */
type Placement = Map<string, Partial<Pick<LayerV2, "x" | "y" | "width" | "height" | "rotation">>>;

const px = (n: number) => `${round2(n)}px`;

/** The outline box of a layer on screen. */
const outlineStyle = (b: Box, zoom: number): React.CSSProperties => ({
  left: b.x * zoom,
  top: b.y * zoom,
  width: b.width * zoom,
  height: b.height * zoom,
  transform: b.rotation ? `rotate(${b.rotation}deg)` : undefined,
});

const HANDLE_POS: Record<Handle, string> = {
  nw: "left-0 top-0 cursor-nwse-resize",
  n: "left-1/2 top-0 cursor-ns-resize",
  ne: "left-full top-0 cursor-nesw-resize",
  e: "left-full top-1/2 cursor-ew-resize",
  se: "left-full top-full cursor-nwse-resize",
  s: "left-1/2 top-full cursor-ns-resize",
  sw: "left-0 top-full cursor-nesw-resize",
  w: "left-0 top-1/2 cursor-ew-resize",
};

const HANDLE_LABEL: Record<Handle, string> = {
  nw: "top left",
  n: "top",
  ne: "top right",
  e: "right",
  se: "bottom right",
  s: "bottom",
  sw: "bottom left",
  w: "left",
};

export interface StageProps {
  layout: LayoutV2;
  renderer: DocRenderer;
  zoom: number;
  selected: ReadonlySet<string>;
  onSelect: (ids: string[], mode: SelectMode) => void;
  /** One gesture's result, applied to the layout. */
  onChange: (update: (l: LayoutV2) => LayoutV2, group?: string) => void;
  /** The gesture is over: the next change is its own undo step. */
  onSettle: () => void;
  /** The text layer being written in, if one is. */
  editing: string | null;
  onEdit: (id: string | null) => void;
  /** The in-place editor for that layer, drawn over it in screen pixels. */
  editor?: (layer: TextLayerV2, frame: React.CSSProperties) => React.ReactNode;
  /** Pinch or ctrl-wheel: zoom by a factor. */
  onZoom?: (factor: number) => void;
  /** Ids the checks flagged, outlined in red. */
  flagged?: ReadonlySet<string>;
  className?: string;
}

export const BoardStage = ({ layout, renderer, zoom, selected, onSelect, onChange, onSettle, editing, onEdit, editor, onZoom, flagged, className }: StageProps) => {
  const { canvas, layers } = layout;
  const frame = React.useRef<HTMLDivElement>(null);
  const host = React.useRef<HTMLDivElement>(null);
  const overlay = React.useRef<HTMLDivElement>(null);
  const guides = React.useRef<HTMLDivElement>(null);
  const marquee = React.useRef<HTMLDivElement>(null);
  const gesture = React.useRef<Gesture | null>(null);
  const pending = React.useRef<Placement | null>(null);
  const raf = React.useRef(0);
  const [hover, setHover] = React.useState<string | null>(null);

  // ─── The design's DOM ──────────────────────────────────────────────────

  const doc = useDocDom(host, layout, renderer);

  // ─── Coordinates ───────────────────────────────────────────────────────

  const toCanvas = React.useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const r = frame.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
    },
    [zoom]
  );

  const byId = React.useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);
  const selectedLayers = React.useMemo(() => layers.filter((l) => selected.has(l.id)), [layers, selected]);
  const group = selectedLayers.length > 1 ? unionOf(selectedLayers) : null;
  const single = selectedLayers.length === 1 ? selectedLayers[0]! : null;
  const canTransform = selectedLayers.length > 0 && selectedLayers.every((l) => !l.locked);

  // ─── Writing a gesture straight to the DOM ─────────────────────────────

  const paint = React.useCallback(() => {
    raf.current = 0;
    const place = pending.current;
    if (!place) return;
    for (const [id, p] of place) {
      const l = byId.get(id);
      if (!l) continue;
      const b = { ...l, ...p } as Box;
      const el = doc.element(id);
      if (el) {
        el.style.left = px(b.x);
        el.style.top = px(b.y);
        el.style.width = px(b.width);
        el.style.height = px(b.height);
        el.style.transform = `rotate(${b.rotation ?? 0}deg)`;
      }
      const o = overlay.current?.querySelector<HTMLElement>(`[data-outline="${id}"]`);
      if (o) Object.assign(o.style, { left: px(b.x * zoom), top: px(b.y * zoom), width: px(b.width * zoom), height: px(b.height * zoom), transform: b.rotation ? `rotate(${b.rotation}deg)` : "" });
    }
    // The group box follows the union of what moved.
    const g = overlay.current?.querySelector<HTMLElement>('[data-outline="__group"]');
    if (g) {
      const u = unionOf(selectedLayers.map((l) => ({ ...l, ...(place.get(l.id) ?? {}) }) as Box));
      if (u) Object.assign(g.style, { left: px(u.x * zoom), top: px(u.y * zoom), width: px(u.width * zoom), height: px(u.height * zoom) });
    }
  }, [byId, doc, zoom, selectedLayers]);

  const schedule = (place: Placement) => {
    pending.current = place;
    if (!raf.current) raf.current = requestAnimationFrame(paint);
  };

  const showGuides = (list: Guide[]) => {
    const el = guides.current;
    if (!el) return;
    el.replaceChildren(
      ...list.map((g) => {
        const line = document.createElement("div");
        line.dataset.guide = g.axis;
        line.className = "bg-brand pointer-events-none absolute";
        Object.assign(
          line.style,
          g.axis === "x"
            ? { left: px(g.at * zoom), top: px(g.from * zoom), width: "1px", height: px((g.to - g.from) * zoom) }
            : { top: px(g.at * zoom), left: px(g.from * zoom), height: "1px", width: px((g.to - g.from) * zoom) }
        );
        return line;
      })
    );
  };

  React.useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const commit = (place: Placement, groupKey: string) => {
    if (!place.size) return;
    onChange(
      (cur) => ({
        ...cur,
        layers: cur.layers.map((l) => {
          const p = place.get(l.id);
          return p ? ({ ...l, ...p } as LayerV2) : l;
        }),
      }),
      groupKey
    );
    onSettle();
  };

  // ─── Pointer ───────────────────────────────────────────────────────────

  const others = (ids: string[]) => layers.filter((l) => !ids.includes(l.id));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // The text being written in keeps its own pointer.
    if (target.closest("[data-editor]")) return;
    if (editing) onEdit(null);
    // The canvas takes the keys from here on: a field left half-typed in the panel commits on blur.
    e.currentTarget.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true });
    const p = toCanvas(e);
    const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle as Handle | "rotate" | undefined;
    if (handle && canTransform) {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (handle === "rotate" && single) {
        gesture.current = { type: "rotate", id: single.id, origin: { ...single } };
      } else if (handle !== "rotate") {
        const ids = selectedLayers.map((l) => l.id);
        gesture.current = {
          type: "resize",
          ids,
          handle,
          start: p,
          origin: new Map(selectedLayers.map((l) => [l.id, { ...l }])),
          snap: snapLines(canvas, others(ids)),
        };
      }
      return;
    }

    const hit = hitTest(layers, p);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (!hit) {
      if (!additive) onSelect([], "replace");
      gesture.current = { type: "marquee", start: p, additive, base: additive ? [...selected] : [] };
      return;
    }
    e.preventDefault();
    let ids: string[];
    if (additive) {
      onSelect([hit.id], "toggle");
      ids = selected.has(hit.id) ? [...selected].filter((id) => id !== hit.id) : [...selected, hit.id];
    } else if (selected.has(hit.id)) {
      ids = [...selected];
    } else {
      onSelect([hit.id], "replace");
      ids = [hit.id];
    }
    const moving = ids.map((id) => byId.get(id)).filter((l): l is LayerV2 => !!l && !l.locked);
    const union = unionOf(moving);
    if (!union) return;
    gesture.current = {
      type: "move",
      ids: moving.map((l) => l.id),
      start: p,
      origin: new Map(moving.map((l) => [l.id, { ...l }])),
      union,
      snap: snapLines(canvas, others(moving.map((l) => l.id))),
      moved: false,
      clicked: !additive && selected.has(hit.id) && selected.size > 1 ? hit.id : null,
      additive,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const p = toCanvas(e);
    if (!g) {
      if (e.buttons) return;
      const h = hitTest(layers, p);
      const id = h?.id ?? null;
      if (id !== hover) setHover(id);
      return;
    }
    const threshold = SNAP_PX / zoom;
    const snapping = !e.altKey;
    if (g.type === "move") {
      const delta = { x: p.x - g.start.x, y: p.y - g.start.y };
      if (!g.moved && Math.hypot(delta.x, delta.y) * zoom < CLICK_PX) return;
      g.moved = true;
      const snapped = snapping ? snapMove(g.union, delta, g.snap, canvas, threshold) : { delta, guides: [] };
      showGuides(snapped.guides);
      const place: Placement = new Map();
      for (const [id, o] of g.origin) place.set(id, { x: round2(o.x + snapped.delta.x), y: round2(o.y + snapped.delta.y) });
      schedule(place);
    } else if (g.type === "resize") {
      const delta = { x: p.x - g.start.x, y: p.y - g.start.y };
      const place: Placement = new Map();
      if (g.ids.length === 1) {
        const o = g.origin.get(g.ids[0]!)!;
        // A QR code stays square.
        const keepRatio = e.shiftKey || byId.get(o.id)?.kind === "qr";
        place.set(o.id, resizeBox(o, g.handle, delta, { keepRatio, snap: snapping && !keepRatio ? { lines: g.snap.lines, threshold } : undefined }));
      } else {
        for (const [id, r] of resizeGroup([...g.origin.values()], g.handle, delta, e.shiftKey)) place.set(id, r);
      }
      schedule(place);
    } else if (g.type === "rotate") {
      schedule(new Map([[g.id, { rotation: rotationTo(g.origin, p, e.shiftKey ? 15 : undefined) }]]));
    } else {
      const r = rectFrom(g.start, p);
      const m = marquee.current;
      if (m) Object.assign(m.style, { display: "block", left: px(r.x * zoom), top: px(r.y * zoom), width: px(r.width * zoom), height: px(r.height * zoom) });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    showGuides([]);
    if (!g) return;
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
    const place = pending.current;
    pending.current = null;
    if (g.type === "marquee") {
      if (marquee.current) marquee.current.style.display = "none";
      const r = rectFrom(g.start, toCanvas(e));
      if (r.width * zoom < CLICK_PX && r.height * zoom < CLICK_PX) return;
      const hits = marqueeHits(layers, r).map((l) => l.id);
      onSelect([...new Set([...g.base, ...hits])], "replace");
      return;
    }
    if (g.type === "move" && !g.moved) {
      // A click on one of several selected layers picks it alone.
      if (g.clicked) onSelect([g.clicked], "replace");
      return;
    }
    if (place) commit(place, g.type);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const hit = hitTest(layers, toCanvas(e));
    if (hit?.kind === "text") {
      onSelect([hit.id], "replace");
      onEdit(hit.id);
    }
  };

  // Pinch and ctrl-wheel zoom the canvas, not the page: a passive React listener could not stop the page's own zoom.
  const root = React.useRef<HTMLDivElement>(null);
  const zoomBy = React.useRef(onZoom);
  React.useEffect(() => {
    zoomBy.current = onZoom;
  });
  React.useEffect(() => {
    const el = root.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!zoomBy.current || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomBy.current(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  // The layer being written in is drawn by the editor, not twice.
  React.useEffect(() => {
    const el = editing ? doc.element(editing) : null;
    if (!el) return;
    el.style.visibility = "hidden";
    return () => {
      el.style.visibility = "";
    };
  }, [editing, doc, layers]);

  const editingLayer = editing ? byId.get(editing) : undefined;
  const W = canvas.width * zoom;
  const H = canvas.height * zoom;

  return (
    <div
      ref={root}
      className={cn("relative touch-none select-none", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => !gesture.current && hover && setHover(null)}
      onDoubleClick={onDoubleClick}
      data-testid="board-stage"
    >
      <div ref={frame} className="shadow-floating relative bg-white" style={{ width: W, height: H }}>
        <div
          ref={host}
          data-doc=""
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0"
          style={{ width: canvas.width, height: canvas.height, transform: `scale(${zoom})`, transformOrigin: "0 0" }}
        />
        <div ref={overlay} className="pointer-events-none absolute inset-0">
          {hover && !selected.has(hover) && byId.get(hover) ? (
            <div data-hover={hover} className="border-brand/60 absolute border" style={outlineStyle(byId.get(hover)!, zoom)} />
          ) : null}
          {flagged
            ? layers
                .filter((l) => flagged.has(l.id) && !l.hidden)
                .map((l) => <div key={`f-${l.id}`} className="border-refuse absolute border border-dashed" style={outlineStyle(l, zoom)} />)
            : null}
          {selectedLayers.map((l) => (
            <div
              key={l.id}
              data-outline={l.id}
              className={cn("absolute border", l.locked ? "border-caution border-dashed" : "border-brand")}
              style={outlineStyle(l, zoom)}
            >
              {single && single.id === l.id && canTransform && !editing ? <Handles rotate /> : null}
            </div>
          ))}
          {group ? (
            <div data-outline="__group" className="border-brand absolute border border-dashed" style={outlineStyle({ id: "__group", ...group }, zoom)}>
              {canTransform ? <Handles /> : null}
            </div>
          ) : null}
          <div ref={guides} />
          <div ref={marquee} data-marquee="" className="border-brand bg-brand/10 absolute hidden border" />
        </div>
        {editingLayer?.kind === "text" && editor ? editor(editingLayer, { ...outlineStyle(editingLayer, zoom), position: "absolute" }) : null}
      </div>
    </div>
  );
};

/** The eight resize handles, and the turn handle above the top edge for one layer. */
const Handles = ({ rotate }: { rotate?: boolean }) => (
  <>
    {HANDLES.map((h) => (
      <span
        key={h}
        data-handle={h}
        aria-label={`Resize from the ${HANDLE_LABEL[h]}`}
        className={cn("border-brand pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border bg-white", HANDLE_POS[h])}
      />
    ))}
    {rotate ? (
      <>
        <span className="bg-brand pointer-events-none absolute top-[-18px] left-1/2 h-[18px] w-px" aria-hidden="true" />
        <span
          data-handle="rotate"
          aria-label="Rotate"
          className="border-brand pointer-events-auto absolute top-[-24px] left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border bg-white"
        />
      </>
    ) : null}
  </>
);

// ─── The design's DOM, patched layer by layer ──────────────────────────────

interface DocDom {
  /** The drawn element of one layer, if it is drawn. */
  element: (id: string) => HTMLElement | null;
}

/**
 * Keeps the design's DOM in a shadow root under `host` in step with the
 * layout: styles and the root once per look, then per layer only what
 * changed. A layer's HTML is cached against the layer object itself, so a
 * layout that changed one layer rebuilds one layer.
 */
function useDocDom(host: React.RefObject<HTMLElement | null>, layout: LayoutV2, renderer: DocRenderer): DocDom {
  const state = React.useRef<{
    root: HTMLElement | null;
    styleKey: unknown;
    cache: WeakMap<object, string>;
    cacheKey: unknown;
    drawn: Map<string, { html: string; el: HTMLElement }>;
  }>({ root: null, styleKey: null, cache: new WeakMap(), cacheKey: null, drawn: new Map() });

  React.useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const s = state.current;
    const shadow = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    ensureDocFonts();

    // The page's styles and root: rebuilt when the look changes (canvas, accent, values).
    if (s.styleKey !== renderer.key || !s.root) {
      const style = document.createElement("style");
      style.textContent = `:host{all:initial;display:block}${renderer.styles}`;
      const root = renderer.root();
      shadow.replaceChildren(style, root);
      s.root = root;
      s.styleKey = renderer.key;
      s.drawn = new Map();
    }
    if (s.cacheKey !== renderer.key) {
      s.cache = new WeakMap();
      s.cacheKey = renderer.key;
    }
    const root = s.root!;

    const seen = new Set<string>();
    const changed: { el: HTMLElement; layer: LayerV2 }[] = [];
    let before: Element | null = root.firstElementChild;
    for (const layer of layout.layers) {
      let html = s.cache.get(layer);
      if (html === undefined) {
        html = renderer.layer(layer);
        s.cache.set(layer, html);
      }
      const prev = s.drawn.get(layer.id);
      if (!html) {
        // Hidden, or left out by showIf.
        if (prev) {
          prev.el.remove();
          s.drawn.delete(layer.id);
        }
        continue;
      }
      seen.add(layer.id);
      let node = prev?.el ?? null;
      if (!prev || prev.html !== html) {
        const fresh = renderer.parse(html);
        if (!fresh) continue;
        if (node) node.replaceWith(fresh);
        node = fresh;
        s.drawn.set(layer.id, { html, el: fresh });
        changed.push({ el: fresh, layer });
      }
      // Paint order: put it where it belongs, moving only what is out of place.
      if (node !== before) root.insertBefore(node!, before);
      before = node!.nextElementSibling;
    }
    for (const [id, d] of s.drawn) {
      if (!seen.has(id)) {
        d.el.remove();
        s.drawn.delete(id);
      }
    }
    // Long text fits once the fonts it uses are in.
    if (changed.length) fitLayers(changed);
  }, [host, layout.layers, renderer]);

  return React.useMemo<DocDom>(
    () => ({
      element: (id) => state.current.drawn.get(id)?.el ?? null,
    }),
    []
  );
}

/**
 * A design drawn small and still, by the same DOM patcher: the gallery's
 * picture of the design in use.
 */
export const DocThumb = ({ layout, renderer, width, height, className }: { layout: LayoutV2; renderer: DocRenderer; width: number; height: number; className?: string }) => {
  const host = React.useRef<HTMLSpanElement>(null);
  useDocDom(host, layout, renderer);
  const { width: W, height: H } = layout.canvas;
  const k = Math.min(width / W, height / H);
  return (
    <span aria-hidden="true" className={className}>
      <span className="relative block overflow-hidden bg-white" style={{ width: Math.round(W * k), height: Math.round(H * k) }}>
        <span ref={host} className="absolute top-0 left-0 block" style={{ width: W, height: H, transform: `scale(${k})`, transformOrigin: "0 0" }} />
      </span>
    </span>
  );
};
