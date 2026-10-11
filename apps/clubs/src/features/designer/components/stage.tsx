"use client";

import {
  type AgendaEntry,
  agendaWeights,
  areaIsWholeCanvas,
  cssFontFamily,
  type LaidOutAgenda,
  type LaidOutText,
  lineX,
  renderTicketTemplate,
  resolveColor,
  SHAPE_PATH_BOX,
  type TicketArea,
  type TicketLayer,
  ticketArea,
} from "@moa/layout";
import * as React from "react";

import { boxOf, type Layout, layoutAgendaLayer, layoutLayer, textStyle, useQrPath } from "./kit";

export interface StageColors {
  primary: string;
  secondary: string;
  ticketType: string;
}

interface StageProps {
  layout: Layout;
  mode: "edit" | "preview";
  zoom: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: (l: Layout) => Layout, group: string) => void;
  onSettle: () => void;
  colors: StageColors;
  values: Record<string, string>;
  qrValue: string;
  templateUrl: string | null;
  imageUrl: (l: Extract<TicketLayer, { kind: "image" }>) => string | null;
  fontsReady: boolean;
  problemIds: Set<string>;
  /** The run of show an agenda layer draws, and the zone its times read in. */
  agenda?: AgendaEntry[];
  timezone?: string;
}

type Drag = {
  id: string;
  mode: "move" | "se" | "e";
  sx: number;
  sy: number;
  start: TicketLayer;
  aspect: number;
};

type AreaDrag = { mode: "move" | "se"; sx: number; sy: number; start: TicketArea };

const SNAP_PX = 6;

/** The selection id of the ticket area frame -- it is selected like a layer, but is not one. */
export const AREA_ID = "__area__";

const QrView = ({ l, value, preview }: { l: Extract<TicketLayer, { kind: "qr" }>; value: string; preview: boolean }) => {
  const qr = useQrPath(value);
  const light = l.light === "transparent" ? null : l.light;
  if (!qr)
    return <rect x={l.x} y={l.y} width={l.size} height={l.size} fill={light ?? "#FFFFFF"} stroke="#8C918C" strokeDasharray="6 6" />;
  const cell = l.size / (qr.count + l.quietZone * 2);
  return (
    <g opacity={preview ? 1 : 0.92}>
      {light ? <rect x={l.x} y={l.y} width={l.size} height={l.size} fill={light} /> : null}
      <path
        d={qr.d}
        fill={l.dark}
        transform={`translate(${l.x + l.quietZone * cell} ${l.y + l.quietZone * cell}) scale(${cell})`}
        shapeRendering="crispEdges"
      />
    </g>
  );
};

/**
 * The ticket, drawn in SVG at canvas scale and zoomed as a whole. Text is laid
 * out by the same function the PDF renderer uses, measured with the same
 * font files. Selection, handles, guides and the position badge are drawn on
 * top at screen size.
 */
export const TicketStage = ({
  layout,
  mode,
  zoom,
  selected,
  onSelect,
  onChange,
  onSettle,
  colors,
  values,
  qrValue,
  templateUrl,
  imageUrl,
  fontsReady,
  problemIds,
  agenda,
  timezone,
}: StageProps) => {
  const { canvas, layers } = layout;
  const area = ticketArea(canvas);
  const framed = !!canvas.area && !areaIsWholeCanvas(canvas, canvas.area);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [areaDrag, setAreaDrag] = React.useState<AreaDrag | null>(null);
  const [guides, setGuides] = React.useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const edit = mode === "edit";
  const px = 1 / zoom; // one screen pixel in canvas units
  const clipId = React.useId();

  // Lay out every text layer once per render -- for drawing, boxes, and snapping.
  const texts = React.useMemo(() => {
    const out = new Map<string, { text: string; laid: LaidOutText }>();
    if (!fontsReady) return out;
    for (const l of layers) {
      if (l.kind !== "text") continue;
      // Edit view shows which token sits where; the {% %} logic around them is noise at canvas size.
      const text = edit ? l.text.replace(/\{%[\s\S]*?%\}/g, "") : renderTicketTemplate(l.text, values);
      out.set(l.id, { text, laid: layoutLayer(l, text) });
    }
    return out;
  }, [layers, edit, values, fontsReady]);

  const agendas = React.useMemo(() => {
    const out = new Map<string, LaidOutAgenda>();
    if (!fontsReady) return out;
    for (const l of layers) if (l.kind === "agenda") out.set(l.id, layoutAgendaLayer(l, agenda ?? [], timezone ?? "UTC"));
    return out;
  }, [layers, agenda, timezone, fontsReady]);

  const box = (l: TicketLayer) => boxOf(l, texts.get(l.id)?.laid.height);
  const color = (ref: Parameters<typeof resolveColor>[0]) => resolveColor(ref, colors);

  const begin = (e: React.PointerEvent, l: TicketLayer, m: Drag["mode"]) => {
    if (!edit) return;
    e.stopPropagation();
    onSelect(l.id);
    if (l.locked) return;
    const b = box(l);
    setDrag({ id: l.id, mode: m, sx: e.clientX, sy: e.clientY, start: l, aspect: b.w / Math.max(1, b.h) });
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const beginArea = (e: React.PointerEvent, m: AreaDrag["mode"]) => {
    if (!edit) return;
    e.stopPropagation();
    onSelect(AREA_ID);
    setAreaDrag({ mode: m, sx: e.clientX, sy: e.clientY, start: area });
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (areaDrag) {
      const dx = (e.clientX - areaDrag.sx) / zoom;
      const dy = (e.clientY - areaDrag.sy) / zoom;
      const a = areaDrag.start;
      // The frame never leaves the canvas; the corner never crosses the origin.
      const next: TicketArea =
        areaDrag.mode === "move"
          ? {
              ...a,
              x: Math.round(Math.min(canvas.width - a.width, Math.max(0, a.x + dx))),
              y: Math.round(Math.min(canvas.height - a.height, Math.max(0, a.y + dy))),
            }
          : {
              ...a,
              width: Math.round(Math.min(canvas.width - a.x, Math.max(100, a.width + dx))),
              height: Math.round(Math.min(canvas.height - a.y, Math.max(50, a.height + dy))),
            };
      onChange((cur) => ({ ...cur, canvas: { ...cur.canvas, area: next } }), "area");
      return;
    }
    if (!drag) return;
    const dx = (e.clientX - drag.sx) / zoom;
    const dy = (e.clientY - drag.sy) / zoom;
    const s = drag.start;
    if (drag.mode === "move") {
      let x = Math.round(s.x + dx);
      let y = Math.round(s.y + dy);
      const gx: number[] = [];
      const gy: number[] = [];
      if (!e.altKey) {
        // Snap edges and centres to the canvas and to every other visible layer.
        const b = box(s);
        const xs = [0, canvas.width / 2, canvas.width];
        const ys = [0, canvas.height / 2, canvas.height];
        if (framed) {
          xs.push(area.x, area.x + area.width / 2, area.x + area.width);
          ys.push(area.y, area.y + area.height / 2, area.y + area.height);
        }
        for (const o of layers) {
          if (o.id === s.id || o.hidden) continue;
          const ob = box(o);
          xs.push(ob.x, ob.x + ob.w / 2, ob.x + ob.w);
          ys.push(ob.y, ob.y + ob.h / 2, ob.y + ob.h);
        }
        const snap = (pos: number, size: number, lines: number[], out: number[]) => {
          let best: { d: number; to: number; line: number } | null = null;
          for (const [offset] of [[0], [size / 2], [size]] as const) {
            for (const line of lines) {
              const d = Math.abs(pos + offset - line);
              if (d <= SNAP_PX / zoom && (!best || d < best.d)) best = { d, to: line - offset, line };
            }
          }
          if (best) out.push(best.line);
          return best ? Math.round(best.to) : pos;
        };
        x = snap(x, b.w, xs, gx);
        y = snap(y, b.h, ys, gy);
      }
      setGuides({ x: gx, y: gy });
      onChange(
        (cur) => ({ ...cur, layers: cur.layers.map((l) => (l.id === s.id ? ({ ...l, x, y } as TicketLayer) : l)) }),
        `drag-${s.id}`
      );
      return;
    }
    onChange(
      (cur) => ({
        ...cur,
        layers: cur.layers.map((l) => {
          if (l.id !== s.id) return l;
          if (s.kind === "text") return { ...l, width: Math.max(10, Math.round(s.width + dx)) } as TicketLayer;
          if (s.kind === "qr") return { ...l, size: Math.max(20, Math.round(s.size + Math.max(dx, dy))) } as TicketLayer;
          if (s.kind === "image" || s.kind === "shape" || s.kind === "agenda") {
            const w = Math.max(1, Math.round(s.width + dx));
            let h = drag.mode === "e" ? s.height : Math.max(1, Math.round(s.height + dy));
            // Shift keeps the proportions, as in every design tool.
            if (e.shiftKey && drag.mode === "se") h = Math.max(1, Math.round(w / drag.aspect));
            return { ...l, width: w, height: h } as TicketLayer;
          }
          return l;
        }),
      }),
      `resize-${s.id}`
    );
  };

  const end = () => {
    if (!drag && !areaDrag) return;
    setDrag(null);
    setAreaDrag(null);
    setGuides({ x: [], y: [] });
    onSettle();
  };

  const sel = edit ? layers.find((l) => l.id === selected) : undefined;
  const sb = sel ? box(sel) : null;
  const areaSelected = edit && selected === AREA_ID;
  const radius = Math.min(area.radius, area.width / 2, area.height / 2);

  // The preview is the ticket alone, as it prints: the area, corners rounded, nothing around it.
  const view = edit ? { x: 0, y: 0, width: canvas.width, height: canvas.height } : area;
  const initials =
    (values.attendee_name ?? "A O")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "•";

  return (
    <svg
      ref={svgRef}
      width={view.width * zoom}
      height={view.height * zoom}
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      className="block shrink-0 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.55)]"
      style={!edit && radius ? { borderRadius: radius * zoom, boxShadow: "none" } : undefined}
      onPointerDown={() => edit && onSelect(null)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      role="img"
      aria-label={
        edit
          ? `Ticket canvas, ${canvas.width} by ${canvas.height} pixels`
          : `Ticket preview, ${Math.round(area.width)} by ${Math.round(area.height)} pixels`
      }
    >
      {!edit ? (
        <defs>
          <clipPath id={clipId}>
            <rect x={area.x} y={area.y} width={area.width} height={area.height} rx={radius} />
          </clipPath>
        </defs>
      ) : null}
      <g clipPath={!edit ? `url(#${clipId})` : undefined}>
        <rect width={canvas.width} height={canvas.height} fill={canvas.background} />
        {templateUrl ? (
          <image href={templateUrl} x={0} y={0} width={canvas.width} height={canvas.height} preserveAspectRatio="none" />
        ) : null}

        {layers.map((l) => {
          if (l.hidden) return null;
          const interactive = edit && !l.locked;
          const common = {
            onPointerDown: (e: React.PointerEvent) => begin(e, l, "move"),
            style: {
              cursor: interactive ? (drag?.id === l.id ? "grabbing" : "grab") : undefined,
              pointerEvents: (interactive ? "auto" : "none") as React.CSSProperties["pointerEvents"],
            },
            "data-layer": l.id,
          };
          switch (l.kind) {
            case "shape":
              // An outline is drawn in its 1000-unit box, stretched to the layer's; the stroke keeps its width.
              if (l.path)
                return (
                  <path
                    key={l.id}
                    {...common}
                    d={l.path}
                    transform={`translate(${l.x} ${l.y}) scale(${l.width / SHAPE_PATH_BOX} ${l.height / SHAPE_PATH_BOX})`}
                    fill={l.fill ? color(l.fill) : "transparent"}
                    stroke={l.stroke && l.strokeWidth > 0 ? color(l.stroke) : undefined}
                    strokeWidth={l.strokeWidth}
                    vectorEffect="non-scaling-stroke"
                    opacity={l.opacity}
                  />
                );
              return (
                <rect
                  key={l.id}
                  {...common}
                  x={l.x}
                  y={l.y}
                  width={l.width}
                  height={l.height}
                  rx={Math.min(l.radius, l.width / 2, l.height / 2)}
                  fill={l.fill ? color(l.fill) : "transparent"}
                  stroke={l.stroke && l.strokeWidth > 0 ? color(l.stroke) : undefined}
                  strokeWidth={l.strokeWidth}
                  opacity={l.opacity}
                />
              );
            case "agenda": {
              const laid = agendas.get(l.id);
              const w = agendaWeights(l.font);
              const mono = (role: string) => role === "time" || role === "day";
              const fill = (role: string) => (mono(role) ? color(l.accent) : role === "title" ? color(l.color) : color(l.muted));
              return (
                <g key={l.id} {...common} opacity={l.opacity}>
                  <rect
                    x={l.x}
                    y={l.y}
                    width={l.width}
                    height={l.height}
                    fill="transparent"
                    stroke={edit ? (problemIds.has(l.id) ? "#D2462F" : "rgba(140,145,140,0.55)") : "none"}
                    strokeDasharray={`${4 * px} ${3 * px}`}
                    strokeWidth={px}
                  />
                  {laid?.pieces.map((piece, i) => (
                    <text
                      key={i}
                      x={l.x + piece.x}
                      y={l.y + piece.y}
                      fontFamily={cssFontFamily(mono(piece.role) ? "mono" : l.font)}
                      fontWeight={mono(piece.role) ? 700 : piece.role === "title" ? w.title : w.detail}
                      fontSize={piece.size}
                      fill={fill(piece.role)}
                      style={textStyle}
                    >
                      {piece.text}
                    </text>
                  ))}
                </g>
              );
            }
            case "image": {
              const href = imageUrl(l);
              const rx = Math.min(l.radius, l.width / 2, l.height / 2);
              const clip = `clip-${l.id}`;
              return (
                <g key={l.id} {...common} opacity={l.opacity}>
                  {rx > 0 ? (
                    <clipPath id={clip}>
                      <rect x={l.x} y={l.y} width={l.width} height={l.height} rx={rx} />
                    </clipPath>
                  ) : null}
                  {href ? (
                    <image
                      href={href}
                      x={l.x}
                      y={l.y}
                      width={l.width}
                      height={l.height}
                      clipPath={rx > 0 ? `url(#${clip})` : undefined}
                      preserveAspectRatio={`${l.align === "left" ? "xMin" : l.align === "right" ? "xMax" : "xMid"}YMid ${l.fit === "cover" ? "slice" : "meet"}`}
                    />
                  ) : l.source === "guest_photo" ? (
                    // No photo in the sample: the initials tile the card would print.
                    <g clipPath={rx > 0 ? `url(#${clip})` : undefined}>
                      <rect x={l.x} y={l.y} width={l.width} height={l.height} fill={colors.primary} opacity={0.16} />
                      <text
                        x={l.x + l.width / 2}
                        y={l.y + l.height / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontFamily={cssFontFamily("inter")}
                        fontWeight={700}
                        fontSize={Math.min(l.width, l.height) * 0.42}
                        fill={colors.primary}
                        style={textStyle}
                      >
                        {initials}
                      </text>
                    </g>
                  ) : (
                    <rect x={l.x} y={l.y} width={l.width} height={l.height} fill="rgba(140,145,140,0.18)" stroke="#8C918C" strokeDasharray="8 6" />
                  )}
                  <rect x={l.x} y={l.y} width={l.width} height={l.height} fill="transparent" />
                </g>
              );
            }
            case "qr":
              return (
                <g key={l.id} {...common}>
                  <QrView l={l} value={qrValue} preview={!edit} />
                </g>
              );
            case "text": {
              const t = texts.get(l.id);
              const b = box(l);
              return (
                <g key={l.id} {...common} opacity={l.opacity}>
                  <rect
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    fill="transparent"
                    stroke={edit ? (problemIds.has(l.id) ? "#D2462F" : "rgba(140,145,140,0.55)") : "none"}
                    strokeDasharray={`${4 * px} ${3 * px}`}
                    strokeWidth={px}
                  />
                  {t?.laid.lines.map((line, i) => (
                    <text
                      key={i}
                      x={lineX(l, line.width)}
                      y={l.y + t.laid.baselines[i]!}
                      fontFamily={cssFontFamily(l.font)}
                      fontWeight={l.weight}
                      fontSize={t.laid.size}
                      letterSpacing={t.laid.letterSpacing}
                      fill={color(l.color)}
                      style={textStyle}
                    >
                      {line.text}
                    </text>
                  ))}
                </g>
              );
            }
          }
        })}
      </g>

      {edit && framed ? (
        // Everything outside the ticket area is the artboard: dimmed, never printed.
        <g>
          <path
            d={`M0,0 H${canvas.width} V${canvas.height} H0 Z M${area.x + radius},${area.y} H${area.x + area.width - radius} A${radius},${radius} 0 0 1 ${area.x + area.width},${area.y + radius} V${area.y + area.height - radius} A${radius},${radius} 0 0 1 ${area.x + area.width - radius},${area.y + area.height} H${area.x + radius} A${radius},${radius} 0 0 1 ${area.x},${area.y + area.height - radius} V${area.y + radius} A${radius},${radius} 0 0 1 ${area.x + radius},${area.y} Z`}
            fillRule="evenodd"
            fill="rgba(20,22,20,0.55)"
            style={{ cursor: "pointer" }}
            onPointerDown={(e) => beginArea(e, "move")}
          />
          <rect
            x={area.x}
            y={area.y}
            width={area.width}
            height={area.height}
            rx={radius}
            fill="none"
            stroke={areaSelected ? "#3B82F6" : "#FFFFFF"}
            strokeWidth={(areaSelected ? 2 : 1.5) * px}
            strokeDasharray={areaSelected ? undefined : `${6 * px} ${4 * px}`}
            pointerEvents="none"
          />
          <g
            transform={`translate(${area.x} ${area.y - 22 * px})`}
            style={{ cursor: areaDrag?.mode === "move" ? "grabbing" : "grab" }}
            onPointerDown={(e) => beginArea(e, "move")}
          >
            <rect width={92 * px} height={17 * px} rx={4 * px} fill={areaSelected ? "#3B82F6" : "#141614"} />
            <text x={6 * px} y={12 * px} fontSize={10.5 * px} fill="#FFFFFF" fontFamily="ui-monospace, monospace" style={{ userSelect: "none" }}>
              TICKET AREA
            </text>
          </g>
          {areaSelected ? (
            <rect
              x={area.x + area.width - 6 * px}
              y={area.y + area.height - 6 * px}
              width={12 * px}
              height={12 * px}
              rx={6 * px}
              fill="#FFFFFF"
              stroke="#3B82F6"
              strokeWidth={2 * px}
              style={{ cursor: "nwse-resize" }}
              onPointerDown={(e) => beginArea(e, "se")}
              aria-label="Resize ticket area"
            />
          ) : null}
        </g>
      ) : null}

      {guides.x.map((g) => (
        <line key={`gx${g}`} x1={g} x2={g} y1={0} y2={canvas.height} stroke="#E0457B" strokeWidth={px} pointerEvents="none" />
      ))}
      {guides.y.map((g) => (
        <line key={`gy${g}`} y1={g} y2={g} x1={0} x2={canvas.width} stroke="#E0457B" strokeWidth={px} pointerEvents="none" />
      ))}

      {sel && sb ? (
        <g pointerEvents="none">
          <rect x={sb.x} y={sb.y} width={sb.w} height={sb.h} fill="none" stroke="#3B82F6" strokeWidth={2 * px} />
          <g transform={`translate(${sb.x} ${sb.y - 22 * px})`}>
            <rect width={(`X:${Math.round(sel.x)} Y:${Math.round(sel.y)}`.length * 6.4 + 12) * px} height={17 * px} rx={4 * px} fill="#141614" />
            <text x={6 * px} y={12 * px} fontSize={10.5 * px} fill="#FFFFFF" fontFamily="ui-monospace, monospace">
              X:{Math.round(sel.x)} Y:{Math.round(sel.y)}
            </text>
          </g>
          {!sel.locked ? (
            <>
              <rect
                x={sb.x + sb.w - 6 * px}
                y={sb.y + sb.h - 6 * px}
                width={12 * px}
                height={12 * px}
                rx={6 * px}
                fill="#FFFFFF"
                stroke="#3B82F6"
                strokeWidth={2 * px}
                pointerEvents="auto"
                style={{ cursor: sel.kind === "text" ? "ew-resize" : "nwse-resize" }}
                onPointerDown={(e) => begin(e, sel, sel.kind === "text" ? "e" : "se")}
                aria-label="Resize"
              />
              {sel.kind === "shape" || sel.kind === "image" ? (
                <rect
                  x={sb.x + sb.w - 5 * px}
                  y={sb.y + sb.h / 2 - 10 * px}
                  width={10 * px}
                  height={20 * px}
                  rx={4 * px}
                  fill="#FFFFFF"
                  stroke="#3B82F6"
                  strokeWidth={2 * px}
                  pointerEvents="auto"
                  style={{ cursor: "ew-resize" }}
                  onPointerDown={(e) => begin(e, sel, "e")}
                />
              ) : null}
            </>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
};
