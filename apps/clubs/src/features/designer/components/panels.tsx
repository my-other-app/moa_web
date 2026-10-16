"use client";

import {
  areaIsWholeCanvas,
  canvasForPage,
  type ColorRef,
  IMAGE_SOURCE_LABEL,
  type ImageSource,
  minQrSize,
  PAGE_PRESETS,
  type PageSpec,
  pagePresetOf,
  TICKET_FONTS,
  type TicketArea,
  type TicketFont,
  type TicketLayer,
  ticketArea,
} from "@moa/layout";
import { Button, CardLabel, DefinitionRows, EmptyState, FigurePanel, IconButton, IconToggle, Notice, Switch, cn } from "@moa/ui";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  ImagePlusIcon,
  LayersIcon,
  ListIcon,
  LockIcon,
  LockOpenIcon,
  QrCodeIcon,
  ScanIcon,
  SquareIcon,
  Trash2Icon,
  TypeIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import * as React from "react";

import type { DesignerConfig } from "../config";
import type { DesignToken } from "../schemas";
import { Busy, ColorRefField, NumberField, Section, SegmentedField, SelectField, TokenMenu } from "./fields";
import { KIND_LABEL, type Layout, ui } from "./kit";

// ─── Kind marks ─────────────────────────────────────────────────────────

/** Each kind's icon, as elements: picked from a table, never a component made in render. */
const KIND_ICON: Record<TicketLayer["kind"], React.ReactNode> = {
  text: <TypeIcon />,
  qr: <QrCodeIcon />,
  image: <ImageIcon />,
  shape: <SquareIcon />,
  agenda: <ListIcon />,
};

/** A layer's kind as a small mark -- the same in the list and at the head of its properties. Refuse when it needs fixing. */
export const KindMark = ({ kind, bad, size = "sm" }: { kind: TicketLayer["kind"]; bad?: boolean; size?: "sm" | "md" }) => (
  <span
    aria-hidden="true"
    className={cn(
      "grid shrink-0 place-items-center rounded-[var(--radius-sm)]",
      size === "sm" ? "size-7 [&_svg]:size-3.5" : "size-9 [&_svg]:size-4",
      bad ? "bg-refuse-soft text-refuse" : "bg-sunken text-ink-2"
    )}
  >
    {KIND_ICON[kind]}
  </span>
);

// ─── Layers ─────────────────────────────────────────────────────────────

const ADDABLE: { kind: TicketLayer["kind"]; label: string }[] = [
  { kind: "text", label: "Text" },
  { kind: "qr", label: "QR code" },
  { kind: "image", label: "Image" },
  { kind: "shape", label: "Shape" },
  { kind: "agenda", label: "Agenda" },
];

export const LayersPanel = ({
  layers,
  selected,
  onSelect,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
  onAdd,
  agendaAllowed = false,
  problems,
  disabled,
  qrRequired,
}: {
  layers: TicketLayer[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onPatch: (id: string, patch: Partial<TicketLayer>) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (kind: TicketLayer["kind"]) => void;
  /** The run of show may be placed on this kind of design. */
  agendaAllowed?: boolean;
  problems: Map<string, string[]>;
  disabled: boolean;
  /** The QR cannot be hidden or deleted -- it is what the gate scans. */
  qrRequired: boolean;
}) => {
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const hasQr = layers.some((l) => l.kind === "qr");
  const hasAgenda = layers.some((l) => l.kind === "agenda");
  // Front first, as in every design tool.
  const ordered = [...layers].reverse();
  const hiddenCount = layers.filter((l) => l.hidden).length;
  return (
    <FigurePanel role="region" aria-label="Layers" className="p-0">
      <div className="border-line-soft border-b px-4 pt-4 pb-3.5">
        <CardLabel
          right={
            <span className="text-ink-3 font-mono text-[11px] tabular-nums">
              {layers.length}
              {hiddenCount ? ` · ${hiddenCount} hidden` : ""}
            </span>
          }
        >
          Layers
        </CardLabel>
        <div role="group" aria-label="Add a layer" className="mt-3 flex flex-wrap gap-1.5">
          {ADDABLE.filter((a) => a.kind !== "agenda" || agendaAllowed).map((a) => {
            const one = (a.kind === "qr" && hasQr) || (a.kind === "agenda" && hasAgenda);
            return (
              <Button
                key={a.kind}
                size="xs"
                variant="secondary"
                disabled={disabled || one}
                title={one ? (a.kind === "qr" ? "A design has exactly one QR code" : "A design lists the run of show once") : `Add a ${a.label.toLowerCase()} layer`}
                onClick={() => onAdd(a.kind)}
              >
                {KIND_ICON[a.kind]}
                {a.label}
              </Button>
            );
          })}
        </div>
      </div>
      {ordered.length ? (
        <ul className="scroll-thin max-h-[360px] overflow-y-auto p-1.5" aria-label="Layers, front to back">
          {ordered.map((l, i) => {
            const on = l.id === selected;
            const bad = problems.has(l.id);
            const pinned = l.kind === "qr" && qrRequired;
            return (
              <li key={l.id}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={on}
                  onClick={() => onSelect(l.id)}
                  onKeyDown={(e) =>
                    (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onSelect(l.id))
                  }
                  className={cn(
                    "group flex items-center gap-2 rounded-[var(--radius-md)] border px-2 py-1.5 transition-colors",
                    on ? "border-brand-line bg-brand-soft" : "border-transparent hover:bg-sunken"
                  )}
                >
                  {/* A hidden layer fades; its controls do not, so the eye that brings it back stays easy to find. */}
                  <span className={cn("flex min-w-0 flex-1 items-center gap-2", l.hidden && "opacity-55")}>
                    <KindMark kind={l.kind} bad={bad} />
                    <span className="min-w-0 flex-1">
                      {renaming === l.id ? (
                        <input
                          autoFocus
                          aria-label="Layer name"
                          defaultValue={l.name}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                            if (e.key === "Escape") setRenaming(null);
                          }}
                          onBlur={(e) => {
                            const v = e.currentTarget.value.trim();
                            if (v && v !== l.name) onPatch(l.id, { name: v.slice(0, 60) });
                            setRenaming(null);
                          }}
                          className="input input-sm"
                        />
                      ) : (
                        <span
                          className="text-ink block truncate text-[12.5px] font-medium"
                          onDoubleClick={() => !disabled && setRenaming(l.id)}
                          title="Double-click to rename"
                        >
                          {l.name}
                        </span>
                      )}
                      <span className="text-ink-3 block truncate font-mono text-[10.5px]">
                        {bad ? <span className="text-refuse">needs attention · </span> : null}
                        {l.kind === "text" ? l.text || "empty" : KIND_LABEL[l.kind]}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 has-[[aria-pressed=true]]:opacity-100">
                    <IconToggle
                      on={!l.hidden}
                      labelOn={`Hide ${l.name}`}
                      labelOff={`Show ${l.name}`}
                      iconOn={<EyeIcon />}
                      iconOff={<EyeOffIcon />}
                      disabled={disabled || pinned}
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                      onToggle={() => onPatch(l.id, { hidden: !l.hidden })}
                    />
                    <IconToggle
                      on={!!l.locked}
                      labelOn={`Unlock ${l.name}`}
                      labelOff={`Lock ${l.name} in place`}
                      iconOn={<LockIcon />}
                      iconOff={<LockOpenIcon />}
                      tone="caution"
                      disabled={disabled}
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                      onToggle={() => onPatch(l.id, { locked: !l.locked })}
                    />
                    <IconButton label={`Bring ${l.name} forward`} variant="quiet" size="xs" disabled={disabled || i === 0} onClick={(e) => (e.stopPropagation(), onMove(l.id, 1))}>
                      <ArrowUpIcon />
                    </IconButton>
                    <IconButton label={`Send ${l.name} backward`} variant="quiet" size="xs" disabled={disabled || i === ordered.length - 1} onClick={(e) => (e.stopPropagation(), onMove(l.id, -1))}>
                      <ArrowDownIcon />
                    </IconButton>
                    <IconButton label={`Duplicate ${l.name}`} variant="quiet" size="xs" disabled={disabled || l.kind === "qr"} onClick={(e) => (e.stopPropagation(), onDuplicate(l.id))}>
                      <CopyIcon />
                    </IconButton>
                    <IconButton label={pinned ? "Every ticket needs its QR code" : `Delete ${l.name}`} variant="quiet" size="xs" danger disabled={disabled || pinned} onClick={(e) => (e.stopPropagation(), onRemove(l.id))}>
                      <Trash2Icon />
                    </IconButton>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState size="sm" icon={<LayersIcon />} title="No layers yet" description="Add text, a QR code, an image or a shape above, or start from a layout." />
      )}
    </FigurePanel>
  );
};

// ─── Properties ─────────────────────────────────────────────────────────

export interface InspectorContext {
  resolve: (c: ColorRef) => string;
  tokens: DesignToken[];
  samples: Record<string, string>;
  /** The layer's text as the sample guest would see it. */
  rendered: (l: Extract<TicketLayer, { kind: "text" }>) => { text: string; truncated: boolean };
  canvas: Layout["canvas"];
  page: PageSpec;
  config: DesignerConfig;
  onUploadImage: (file: File) => Promise<{ key: string; url: string } | null>;
  imageUrl: (l: Extract<TicketLayer, { kind: "image" }>) => string | null;
  disabled: boolean;
}

const ALIGN = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
] as const;

/** A layer's name, committed on Enter or when the field is left -- never emptied. */
const NameField = ({ id, value, disabled, onCommit }: { id: string; value: string; disabled: boolean; onCommit: (v: string) => void }) => {
  const [draft, setDraft] = React.useState(value);
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const commit = () => {
    const v = draft.trim();
    if (v && v !== value) onCommit(v.slice(0, 60));
    else setDraft(value);
  };
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={ui.label}>
        Name
      </label>
      <input
        id={id}
        value={draft}
        maxLength={60}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className={ui.control}
      />
    </div>
  );
};

export const Inspector = ({
  layer,
  onPatch,
  onClose,
  problems,
  ctx,
}: {
  layer: TicketLayer;
  onPatch: (patch: Partial<TicketLayer>, group?: string) => void;
  /** Deselect the layer, back to the canvas's own settings. */
  onClose?: () => void;
  problems: string[];
  ctx: InspectorContext;
}) => {
  const id = (f: string) => `insp-${layer.id}-${f}`;
  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const d = ctx.disabled;
  const p =
    <K extends string>(field: K) =>
    (v: unknown) =>
      onPatch({ [field]: v } as Partial<TicketLayer>, `${layer.id}-${field}`);
  const opacity = (l: { opacity: number }) => (
    <NumberField
      id={id("opacity")}
      label="Opacity"
      value={Math.round(l.opacity * 100)}
      onChange={(v) => onPatch({ opacity: v / 100 } as Partial<TicketLayer>, `${layer.id}-opacity`)}
      min={0}
      max={100}
      suffix="%"
      disabled={d}
    />
  );
  const name = <NameField id={id("name")} value={layer.name} disabled={d} onCommit={(v) => onPatch({ name: v })} />;
  const state = [KIND_LABEL[layer.kind], layer.locked ? "locked" : null, layer.hidden ? "hidden" : null].filter(Boolean).join(" · ");

  return (
    <FigurePanel role="region" aria-label="Properties" className="p-0">
      <div className="px-4 pt-4 pb-3.5">
        <CardLabel
          right={
            onClose ? (
              <IconButton label="Deselect" variant="quiet" size="xs" onClick={onClose}>
                <XIcon />
              </IconButton>
            ) : null
          }
        >
          Properties
        </CardLabel>
        <div className="mt-2 flex items-center gap-2.5">
          <KindMark kind={layer.kind} bad={problems.length > 0} size="md" />
          <div className="min-w-0">
            <p className="text-ink m-0 truncate text-[14px] font-semibold">{layer.name}</p>
            <p className="text-ink-3 m-0 text-[12px]">{state}</p>
          </div>
        </div>
        {problems.length ? (
          <Notice tone="refuse" tag="Fix" className="mt-3">
            <ul className="m-0 list-disc pl-4">
              {problems.map((m) => (
                <li key={m}>{m.replace(`${layer.name}: `, "")}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        {layer.locked ? (
          <Notice
            tone="caution"
            tag="Locked"
            className="mt-3"
            action={
              <Button size="xs" variant="secondary" disabled={d} onClick={() => onPatch({ locked: false })}>
                <LockOpenIcon /> Unlock
              </Button>
            }
          >
            Held in place on the stage. The fields below still move it.
          </Notice>
        ) : null}
      </div>

      {layer.kind === "text" ? (
        <>
          <Section title="Layer">
            {name}
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField id={id("x")} label="X" value={layer.x} onChange={p("x")} suffix="px" disabled={d} />
              <NumberField id={id("y")} label="Y" value={layer.y} onChange={p("y")} suffix="px" disabled={d} />
              <NumberField id={id("width")} label="Box width" value={layer.width} onChange={p("width")} min={10} suffix="px" disabled={d} />
              <NumberField
                id={id("maxLines")}
                label="Max lines"
                value={layer.maxLines}
                onChange={(v) => onPatch({ maxLines: Math.round(v) } as Partial<TicketLayer>, `${layer.id}-maxLines`)}
                min={1}
                max={12}
                disabled={d}
              />
            </div>
          </Section>
          <Section
            title={<label htmlFor={id("text")}>Text and tokens</label>}
            right={
              !d ? (
                <TokenMenu
                  tokens={ctx.tokens}
                  samples={ctx.samples}
                  groups={ctx.config.tokenGroups}
                  onInsert={(snippet) => {
                    const el = textRef.current;
                    const at = el?.selectionStart ?? layer.text.length;
                    const end = el?.selectionEnd ?? at;
                    onPatch({ text: layer.text.slice(0, at) + snippet + layer.text.slice(end) });
                    requestAnimationFrame(() => {
                      el?.focus();
                      el?.setSelectionRange(at + snippet.length, at + snippet.length);
                    });
                  }}
                />
              ) : null
            }
          >
            <textarea
              ref={textRef}
              id={id("text")}
              value={layer.text}
              rows={Math.min(5, Math.max(2, Math.ceil(layer.text.length / 34)))}
              disabled={d}
              spellCheck={false}
              onChange={(e) => onPatch({ text: e.target.value.slice(0, 600) }, `${layer.id}-text`)}
              className="input min-h-0 font-mono text-[12.5px] leading-[1.5]"
            />
            <SampleLine text={ctx.rendered(layer)} />
          </Section>
          <Section title="Type">
            <div className="grid grid-cols-2 gap-2.5">
              <SelectField
                id={id("font")}
                label="Font"
                value={layer.font}
                disabled={d}
                options={(Object.keys(TICKET_FONTS) as TicketFont[]).map((f) => ({ value: f, label: TICKET_FONTS[f].label }))}
                onChange={(font) =>
                  onPatch({
                    font,
                    weight: (TICKET_FONTS[font].weights as readonly number[]).includes(layer.weight)
                      ? layer.weight
                      : TICKET_FONTS[font].weights[0],
                  } as Partial<TicketLayer>)
                }
              />
              <SelectField
                id={id("weight")}
                label="Weight"
                value={layer.weight}
                disabled={d || TICKET_FONTS[layer.font].weights.length === 1}
                options={TICKET_FONTS[layer.font].weights.map((w) => ({ value: w as number, label: WEIGHT_LABEL[w] ?? String(w) }))}
                onChange={p("weight")}
              />
              <NumberField id={id("size")} label="Font size" value={layer.size} onChange={p("size")} min={4} max={800} suffix="px" disabled={d} />
              <NumberField id={id("lineSpacing")} label="Line spacing" value={layer.lineSpacing} onChange={p("lineSpacing")} suffix="px" disabled={d} />
              <NumberField id={id("letterSpacing")} label="Letter spacing" value={layer.letterSpacing} onChange={p("letterSpacing")} step={0.5} suffix="px" disabled={d} />
            </div>
            {layer.font === "dm_serif" || layer.font === "bebas" ? (
              <p className={ui.note}>
                {TICKET_FONTS[layer.font].label} covers Latin letters only. A name in another script prints in Inter so it is never lost.
              </p>
            ) : null}
            <SegmentedField label="Align" value={layer.align} onChange={(align) => onPatch({ align } as Partial<TicketLayer>)} options={[...ALIGN]} />
            <SegmentedField
              label="When it does not fit"
              value={layer.fit}
              onChange={(fit) => onPatch({ fit } as Partial<TicketLayer>)}
              options={[
                { value: "shrink", label: "Shrink, then cut" },
                { value: "truncate", label: "Cut with …" },
              ]}
            />
          </Section>
          <Section title="Colour">
            <ColorRefField
              id={id("color")}
              label="Font colour"
              value={layer.color}
              onChange={(v) => onPatch({ color: v ?? "#141614" } as Partial<TicketLayer>, `${layer.id}-color`)}
              resolve={ctx.resolve}
            />
            <div className="grid grid-cols-2 gap-2.5">{opacity(layer)}</div>
          </Section>
        </>
      ) : null}

      {layer.kind === "qr" ? (
        <>
          <Section title="Layer">
            {name}
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField id={id("x")} label="X" value={layer.x} onChange={p("x")} suffix="px" disabled={d} />
              <NumberField id={id("y")} label="Y" value={layer.y} onChange={p("y")} suffix="px" disabled={d} />
              <NumberField id={id("size")} label="Size" value={layer.size} onChange={p("size")} min={20} suffix="px" disabled={d} />
              <NumberField
                id={id("quiet")}
                label="Quiet zone"
                value={layer.quietZone}
                onChange={(v) => onPatch({ quietZone: Math.round(v) } as Partial<TicketLayer>, `${layer.id}-quiet`)}
                min={0}
                max={4}
                suffix="mod"
                disabled={d}
              />
            </div>
            <p className={ui.note}>
              At least {minQrSize(ctx.canvas, ctx.page)} px on this canvas. The size is the whole square, quiet zone included, so it never
              changes with the length of the code.
            </p>
          </Section>
          <Section title="Colour">
            <ColorRefField
              id={id("dark")}
              label="Modules"
              value={layer.dark}
              refs={false}
              onChange={(v) => v && onPatch({ dark: v } as Partial<TicketLayer>, `${layer.id}-dark`)}
              resolve={ctx.resolve}
            />
            <ColorRefField
              id={id("light")}
              label="Background"
              value={layer.light === "transparent" ? null : layer.light}
              refs={false}
              allowNone
              onChange={(v) => onPatch({ light: v ?? "transparent" } as Partial<TicketLayer>, `${layer.id}-light`)}
              resolve={ctx.resolve}
            />
            {layer.light === "transparent" ? (
              <p className="text-caution m-0 text-[11.5px] leading-[1.5]">No background: only safe where the template is plain and light behind the code.</p>
            ) : null}
          </Section>
        </>
      ) : null}

      {layer.kind === "image" ? (
        <>
          <Section title="Layer">
            {name}
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField id={id("x")} label="X" value={layer.x} onChange={p("x")} suffix="px" disabled={d} />
              <NumberField id={id("y")} label="Y" value={layer.y} onChange={p("y")} suffix="px" disabled={d} />
              <NumberField id={id("w")} label="Width" value={layer.width} onChange={p("width")} min={1} suffix="px" disabled={d} />
              <NumberField id={id("h")} label="Height" value={layer.height} onChange={p("height")} min={1} suffix="px" disabled={d} />
            </div>
          </Section>
          <Section title="Image">
            <SelectField
              id={id("source")}
              label="Shows"
              value={layer.source}
              disabled={d}
              options={(Object.keys(IMAGE_SOURCE_LABEL) as ImageSource[])
                .filter((s) => s !== "guest_photo" || ctx.config.guestPhoto)
                .map((s) => ({ value: s, label: IMAGE_SOURCE_LABEL[s] }))}
              onChange={(source) =>
                onPatch(
                  // A photo is normally a filled circle; the rest keep their shape.
                  source === "guest_photo" && layer.source !== "guest_photo"
                    ? ({ source, fit: "cover", radius: Math.min(layer.width, layer.height) / 2 } as Partial<TicketLayer>)
                    : ({ source } as Partial<TicketLayer>)
                )
              }
            />
            {layer.source === "guest_photo" ? (
              <p className={ui.note}>The guest&apos;s photo when one is on file; their initials on a tinted tile when not.</p>
            ) : null}
            {layer.source === "upload" ? (
              <ImagePicker layer={layer} ctx={ctx} onPicked={(key) => onPatch({ imageKey: key } as Partial<TicketLayer>)} />
            ) : null}
          </Section>
          <Section title="Fit">
            <SegmentedField
              label="In its box"
              value={layer.fit}
              onChange={(fit) => onPatch({ fit } as Partial<TicketLayer>)}
              options={[
                { value: "contain", label: "Whole image" },
                { value: "cover", label: "Fill the box" },
              ]}
            />
            {layer.fit === "contain" ? (
              <SegmentedField label="Sits in its box" value={layer.align} onChange={(align) => onPatch({ align } as Partial<TicketLayer>)} options={[...ALIGN]} />
            ) : null}
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField id={id("radius")} label="Corners" value={layer.radius} onChange={p("radius")} min={0} suffix="px" disabled={d} />
              {opacity(layer)}
            </div>
          </Section>
        </>
      ) : null}

      {layer.kind === "agenda" ? (
        <>
          <Section title="Layer">
            {name}
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField id={id("x")} label="X" value={layer.x} onChange={p("x")} suffix="px" disabled={d} />
              <NumberField id={id("y")} label="Y" value={layer.y} onChange={p("y")} suffix="px" disabled={d} />
              <NumberField id={id("w")} label="Width" value={layer.width} onChange={p("width")} min={40} suffix="px" disabled={d} />
              <NumberField id={id("h")} label="Height" value={layer.height} onChange={p("height")} min={20} suffix="px" disabled={d} />
            </div>
          </Section>
          <Section title="Sessions">
            <p className={ui.note}>
              The event&apos;s sessions, laid into this box: time, title, then speaker and room. What does not fit shrinks, then drops with a count.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField
                id={id("columns")}
                label="Columns"
                value={layer.columns}
                onChange={(v) => onPatch({ columns: Math.min(3, Math.max(1, Math.round(v))) } as Partial<TicketLayer>, `${layer.id}-columns`)}
                min={1}
                max={3}
                disabled={d}
              />
              <NumberField id={id("rowGap")} label="Between sessions" value={layer.rowGap} onChange={p("rowGap")} min={0} max={1000} suffix="px" disabled={d} />
            </div>
            <ul className="m-0 grid list-none gap-2 p-0">
              {(
                [
                  ["showSpeaker", "Show the speaker"],
                  ["showLocation", "Show the room"],
                  ["showDayHeadings", "Head each day, when there is more than one"],
                ] as const
              ).map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <label htmlFor={id(key)} className="text-ink text-[12.5px]">
                    {label}
                  </label>
                  <Switch id={id(key)} checked={layer[key]} disabled={d} onCheckedChange={(v) => onPatch({ [key]: v } as Partial<TicketLayer>)} />
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Type">
            <div className="grid grid-cols-2 gap-2.5">
              <SelectField
                id={id("font")}
                label="Font"
                value={layer.font}
                disabled={d}
                options={(Object.keys(TICKET_FONTS) as TicketFont[]).map((f) => ({ value: f, label: TICKET_FONTS[f].label }))}
                onChange={(font) => onPatch({ font } as Partial<TicketLayer>)}
              />
              <NumberField id={id("size")} label="Title size" value={layer.size} onChange={p("size")} min={6} max={400} suffix="px" disabled={d} />
            </div>
            <SegmentedField label="Align" value={layer.align} onChange={(align) => onPatch({ align } as Partial<TicketLayer>)} options={[...ALIGN]} />
          </Section>
          <Section title="Colour">
            <ColorRefField id={id("color")} label="Titles" value={layer.color} onChange={(v) => onPatch({ color: v ?? "#141614" } as Partial<TicketLayer>, `${layer.id}-color`)} resolve={ctx.resolve} />
            <ColorRefField id={id("accent")} label="Times and day headings" value={layer.accent} onChange={(v) => onPatch({ accent: v ?? "brand.primary" } as Partial<TicketLayer>, `${layer.id}-accent`)} resolve={ctx.resolve} />
            <ColorRefField id={id("muted")} label="Speaker and room" value={layer.muted} onChange={(v) => onPatch({ muted: v ?? "#5A5F5B" } as Partial<TicketLayer>, `${layer.id}-muted`)} resolve={ctx.resolve} />
            <div className="grid grid-cols-2 gap-2.5">{opacity(layer)}</div>
          </Section>
        </>
      ) : null}

      {layer.kind === "shape" ? (
        <>
          <Section title="Layer">
            {name}
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField id={id("x")} label="X" value={layer.x} onChange={p("x")} suffix="px" disabled={d} />
              <NumberField id={id("y")} label="Y" value={layer.y} onChange={p("y")} suffix="px" disabled={d} />
              <NumberField id={id("w")} label="Width" value={layer.width} onChange={p("width")} min={0.5} suffix="px" disabled={d} />
              <NumberField id={id("h")} label="Height" value={layer.height} onChange={p("height")} min={0.5} suffix="px" disabled={d} />
              {layer.path ? null : (
                <NumberField id={id("radius")} label="Corner radius" value={layer.radius} onChange={p("radius")} min={0} suffix="px" disabled={d} />
              )}
            </div>
            {layer.path ? (
              <p className={ui.note}>
                A curved shape from a layout. Drag its handles or set width and height to reshape it; the fill, outline and opacity work as on
                any shape.
              </p>
            ) : null}
          </Section>
          <Section title="Fill and outline">
            <ColorRefField
              id={id("fill")}
              label="Fill"
              value={layer.fill}
              allowNone
              onChange={(v) => onPatch({ fill: v } as Partial<TicketLayer>, `${layer.id}-fill`)}
              resolve={ctx.resolve}
            />
            <ColorRefField
              id={id("stroke")}
              label="Outline"
              value={layer.stroke}
              allowNone
              onChange={(v) =>
                onPatch({ stroke: v, strokeWidth: v && !layer.strokeWidth ? 3 : layer.strokeWidth } as Partial<TicketLayer>, `${layer.id}-stroke`)
              }
              resolve={ctx.resolve}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField id={id("strokeWidth")} label="Outline width" value={layer.strokeWidth} onChange={p("strokeWidth")} min={0} suffix="px" disabled={d} />
              {opacity(layer)}
            </div>
          </Section>
        </>
      ) : null}
    </FigurePanel>
  );
};

const WEIGHT_LABEL: Record<number, string> = { 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold" };

const SampleLine = ({ text }: { text: { text: string; truncated: boolean } }) => (
  <div className="bg-sunken rounded-[var(--radius-md)] px-3 py-2 text-[12px] leading-[1.5]">
    <span className="eyebrow mb-0.5 block">Sample guest sees</span>
    <span className={cn("break-words", text.text ? "text-ink" : "text-ink-3")}>{text.text || "Nothing — every token is empty for this guest"}</span>
    {text.truncated ? <span className="text-caution mt-1 block text-[11.5px]">Cut short even at half size — widen the box or allow more lines.</span> : null}
  </div>
);

/** A checkerboard in the chrome's colours, behind a picture that may be transparent. */
const CHECKER = "bg-[repeating-conic-gradient(var(--sunken)_0_25%,var(--surface)_0_50%)] bg-[length:12px_12px]";

const ImagePicker = ({
  layer,
  ctx,
  onPicked,
}: {
  layer: Extract<TicketLayer, { kind: "image" }>;
  ctx: InspectorContext;
  onPicked: (key: string) => void;
}) => {
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const url = ctx.imageUrl(layer);
  return (
    <div className="flex items-center gap-3">
      <span className={cn("border-line grid size-14 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border", CHECKER)}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-contain" />
        ) : (
          <span className="text-ink-3 text-[11px]">No image</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <Button size="sm" variant="secondary" disabled={ctx.disabled || busy} onClick={() => input.current?.click()}>
          {busy ? <Busy on /> : <UploadIcon />}
          {layer.imageKey ? "Replace image" : "Choose image"}
        </Button>
        <p className={cn("mt-1.5", ui.note)}>PNG keeps transparency · up to 5 MB. Or drop one on the stage.</p>
      </div>
      <input
        ref={input}
        type="file"
        aria-label="Upload an image"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          const res = await ctx.onUploadImage(f);
          setBusy(false);
          if (res) onPicked(res.key);
        }}
      />
    </div>
  );
};

// ─── Canvas ─────────────────────────────────────────────────────────────

const SIZES = [
  { label: "Ticket · 1560 × 690", w: 1560, h: 690 },
  { label: "Wide · 1800 × 600", w: 1800, h: 600 },
  { label: "A6 landscape · 1748 × 1240", w: 1748, h: 1240 },
  { label: "Square · 1080 × 1080", w: 1080, h: 1080 },
  { label: "Phone · 1080 × 1920", w: 1080, h: 1920 },
];

export const CanvasPanel = ({
  config,
  layout,
  templateUrl,
  onCanvas,
  onPage,
  onUploadTemplate,
  onRemoveTemplate,
  onResize,
  onFill,
  onCrop,
  coverage,
  photos,
  onUploadBackground,
  onRemoveBackground,
  onFindArea,
  finding,
  areaSelected,
  uploading,
  disabled,
  qrSize,
}: {
  config: DesignerConfig;
  layout: Layout;
  templateUrl: string | null;
  onCanvas: (patch: Partial<Layout["canvas"]>) => void;
  onPage: (page: PageSpec) => void;
  onUploadTemplate: (file: File) => void;
  onRemoveTemplate: () => void;
  /** A new size for the whole canvas: the layers are scaled to fit it. */
  onResize: (width: number, height: number) => void;
  /** Scale the layers up to fill the canvas they sit in; shrink the canvas to the layers. */
  onFill: () => void;
  onCrop: () => void;
  /** How much of the canvas the layers cover, per axis. */
  coverage: { w: number; h: number } | null;
  /** The photo slots -- a picture per panel -- or none, for one picture behind everything. */
  photos: { id: string; name: string; url: string | null }[];
  onUploadBackground: (file: File, slotId: string | null) => void;
  onRemoveBackground: (slotId: string | null) => void;
  onFindArea: () => void;
  finding: boolean;
  areaSelected: boolean;
  uploading: boolean;
  disabled: boolean;
  qrSize: number | null;
}) => {
  const { canvas, page } = layout;
  const input = React.useRef<HTMLInputElement>(null);
  const photoInput = React.useRef<HTMLInputElement>(null);
  const [photoTarget, setPhotoTarget] = React.useState<string | null>(null);
  const area = ticketArea(canvas);
  const bare = coverage && !canvas.templateKey && (coverage.w < 0.9 || coverage.h < 0.9);
  const fixed = !!page.heightMm;
  const preset = pagePresetOf(page);
  const pageShape = fixed ? page.widthMm / page.heightMm! : null;
  const shapeOff = pageShape ? Math.abs(pageShape - area.width / area.height) / pageShape > 0.015 : false;
  const fitted = canvasForPage(page, config.dpi);
  const framed = !!canvas.area && !areaIsWholeCanvas(canvas, canvas.area);
  const setArea = (p: Partial<TicketArea>) => {
    const next = { ...area, ...p };
    onCanvas({ area: areaIsWholeCanvas(canvas, next) ? null : next });
  };
  return (
    <FigurePanel role="region" aria-label="Canvas" className="p-0">
      <div className="px-4 pt-4 pb-3.5">
        <CardLabel
          right={
            <span className="text-ink-3 font-mono text-[11px] tabular-nums">
              {canvas.width} × {canvas.height} px
            </span>
          }
        >
          Canvas
        </CardLabel>
        <p className="text-ink-3 m-0 mt-1.5 text-[12px] leading-[1.5]">
          No layer selected. These settings are the {config.noun}&apos;s own; pick a layer on the stage or in the list to change it.
        </p>
        {bare ? (
          <Notice
            tone="caution"
            tag="Bare edge"
            className="mt-3"
            action={
              <span className="flex flex-wrap gap-1.5">
                <Button size="xs" variant="secondary" disabled={disabled} onClick={onFill}>
                  Fill the canvas
                </Button>
                <Button size="xs" variant="secondary" disabled={disabled} onClick={onCrop}>
                  Crop to the {config.noun}
                </Button>
              </span>
            }
          >
            The layers cover {Math.round(Math.min(coverage.w, coverage.h) * 100)}% of the canvas; the rest prints as the background colour. Fill
            grows the {config.noun} to the edges; crop shrinks the canvas to it.
          </Notice>
        ) : null}
      </div>

      {config.pages.length > 1 || fixed ? (
        <Section title="Printed size">
          <SelectField
            id="canvas-page"
            label="Page"
            value={preset ?? "custom"}
            disabled={disabled}
            options={[
              ...config.pages.map((k) => ({ value: k as string, label: PAGE_PRESETS[k].label })),
              ...(preset ? [] : [{ value: "custom", label: `Custom · ${page.widthMm} × ${page.heightMm ?? "—"} mm` }]),
            ]}
            onChange={(v) => {
              const next = PAGE_PRESETS[v as keyof typeof PAGE_PRESETS]?.page;
              if (next) onPage(next);
            }}
          />
          {shapeOff ? (
            <Notice
              tone="refuse"
              tag="Shape"
              action={
                !canvas.templateKey ? (
                  <Button size="xs" variant="secondary" disabled={disabled} onClick={() => onCanvas({ width: fitted.width, height: fitted.height, area: null })}>
                    Resize to {fitted.width} × {fitted.height}
                  </Button>
                ) : undefined
              }
            >
              The {canvas.area ? "ticket area" : "canvas"} is {Math.round(area.width)} × {Math.round(area.height)} — not the shape of a {page.widthMm} ×{" "}
              {page.heightMm} mm page.
              {canvas.templateKey ? " Export the template at that shape, or draw a frame of that shape." : ""}
            </Notice>
          ) : fixed ? (
            <p className={ui.note}>
              Export templates at {fitted.width} × {fitted.height} px ({config.dpi} dpi) for a sharp print.
            </p>
          ) : null}
        </Section>
      ) : null}

      <Section
        title="Ticket area"
        className={cn("transition-colors", areaSelected && "bg-brand-soft")}
        right={
          <span className="text-ink-3 font-mono text-[11px] tabular-nums">
            {framed ? `${Math.round(area.width)} × ${Math.round(area.height)} at ${Math.round(area.x)}, ${Math.round(area.y)}` : "Whole canvas"}
          </span>
        }
      >
        <p className={ui.note}>
          {framed
            ? "Only this rectangle is the ticket: the PDF, the preview and every send show it alone. The rest of the canvas is the artboard around it."
            : "The whole canvas prints. If your export carries a backdrop or mock-up around the ticket, find the ticket inside it, or drag a frame on the canvas."}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {canvas.templateKey ? (
            <Button size="sm" variant="secondary" disabled={disabled || finding} onClick={onFindArea}>
              {finding ? <Busy on /> : <ScanIcon />}
              Find the ticket
            </Button>
          ) : null}
          {framed ? (
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onCanvas({ area: null })}>
              Use the whole canvas
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() =>
                setArea({
                  x: Math.round(canvas.width * 0.1),
                  y: Math.round(canvas.height * 0.1),
                  width: Math.round(canvas.width * 0.8),
                  height: Math.round(canvas.height * 0.8),
                  radius: 0,
                })
              }
            >
              Draw a frame
            </Button>
          )}
        </div>
        {framed ? (
          <div className="grid grid-cols-2 gap-2.5">
            <NumberField id="area-x" label="X" value={area.x} min={0} max={canvas.width - 100} suffix="px" disabled={disabled} onChange={(v) => setArea({ x: Math.round(v) })} />
            <NumberField id="area-y" label="Y" value={area.y} min={0} max={canvas.height - 50} suffix="px" disabled={disabled} onChange={(v) => setArea({ y: Math.round(v) })} />
            <NumberField id="area-w" label="Width" value={area.width} min={100} max={canvas.width} suffix="px" disabled={disabled} onChange={(v) => setArea({ width: Math.round(v) })} />
            <NumberField id="area-h" label="Height" value={area.height} min={50} max={canvas.height} suffix="px" disabled={disabled} onChange={(v) => setArea({ height: Math.round(v) })} />
            <NumberField id="area-r" label="Corner radius" value={area.radius} min={0} max={Math.floor(Math.min(area.width, area.height) / 2)} suffix="px" disabled={disabled} onChange={(v) => setArea({ radius: Math.round(v) })} />
          </div>
        ) : null}
      </Section>

      <Section title="Template">
        <div className="flex items-center gap-3">
          <span className="border-line bg-sunken grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border">
            {templateUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={templateUrl} alt="Ticket template" className="size-full object-contain" />
            ) : (
              <span className="text-ink-3 px-2 text-center text-[11px]">No template</span>
            )}
          </span>
          <div className="flex flex-col items-start gap-1.5">
            <Button size="sm" variant="secondary" disabled={disabled || uploading} onClick={() => input.current?.click()}>
              {uploading ? <Busy on /> : <UploadIcon />}
              {canvas.templateKey ? "Replace template" : "Upload template"}
            </Button>
            {canvas.templateKey ? (
              <Button size="sm" variant="ghost" danger disabled={disabled} onClick={onRemoveTemplate}>
                Remove template
              </Button>
            ) : null}
          </div>
        </div>
        <p className={ui.note}>
          For a whole {config.noun} designed elsewhere, such as a Figma export: the canvas takes the file&apos;s pixel size, so X and Y match your
          design file, and the layers are scaled onto it. For a photo behind this layout, add a background picture instead — the {config.noun}{" "}
          keeps its size.
        </p>
        <input
          ref={input}
          type="file"
          aria-label="Upload a template"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onUploadTemplate(f);
          }}
        />
      </Section>

      {!canvas.templateKey ? (
        <Section title="Size">
          <div className="grid grid-cols-2 gap-2.5">
            {!fixed ? (
              <div className="col-span-2">
                <SelectField
                  id="canvas-size"
                  label="Preset"
                  value={SIZES.find((s) => s.w === canvas.width && s.h === canvas.height)?.label ?? "Custom"}
                  disabled={disabled}
                  options={[...SIZES.map((s) => ({ value: s.label, label: s.label })), { value: "Custom", label: "Custom" }]}
                  onChange={(v) => {
                    const s = SIZES.find((x) => x.label === v);
                    if (s) onResize(s.w, s.h);
                  }}
                />
              </div>
            ) : null}
            <NumberField id="canvas-w" label="Width" value={canvas.width} min={300} max={6000} onChange={(v) => onCanvas({ width: Math.round(v) })} suffix="px" disabled={disabled} />
            <NumberField id="canvas-h" label="Height" value={canvas.height} min={150} max={6000} onChange={(v) => onCanvas({ height: Math.round(v) })} suffix="px" disabled={disabled} />
          </div>
        </Section>
      ) : null}

      <Section title="Background">
        <ColorRefField id="canvas-bg" label="Colour" value={canvas.background} refs={false} onChange={(v) => v && onCanvas({ background: v })} resolve={(c) => c} />
        {(photos.length ? photos : [{ id: null as string | null, name: "Picture", url: null as string | null }]).map((slot) => (
          <div key={slot.id ?? "all"} className="flex items-center gap-3">
            <span className="border-line bg-sunken grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border">
              {slot.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={slot.url} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-ink-3 px-2 text-center text-[11px]">No picture</span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-ink mb-1.5 text-[12.5px] font-medium">{photos.length ? slot.name : "Picture"}</div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled || (uploading && photoTarget === slot.id)}
                  onClick={() => {
                    setPhotoTarget(slot.id);
                    photoInput.current?.click();
                  }}
                >
                  {uploading && photoTarget === slot.id ? <Busy on /> : <ImagePlusIcon />}
                  {slot.url ? "Replace" : "Add a picture"}
                </Button>
                {slot.url ? (
                  <Button size="sm" variant="ghost" danger disabled={disabled} onClick={() => onRemoveBackground(slot.id)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        <p className={ui.note}>
          {photos.length
            ? `Each panel takes its own picture, cropped to fill it — the ${config.noun} keeps its size. Drop a picture onto a panel on the stage to set just that one.`
            : `A photo behind the ${config.noun}, cropped to fill it — the ${config.noun} keeps its size. You can also drop a picture straight onto the stage.`}
        </p>
        <input
          ref={photoInput}
          type="file"
          aria-label="Upload a background picture"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onUploadBackground(f, photoTarget);
          }}
        />
      </Section>

      <Section title="At a glance">
        <DefinitionRows
          rows={[
            { k: "Layers", v: String(layout.layers.length) },
            { k: "QR code", v: qrSize ? `${qrSize} px · at least ${minQrSize(canvas, page)}` : `None · at least ${minQrSize(canvas, page)} px if added` },
            { k: "Prints", v: `${framed ? "The ticket area" : "The whole canvas"}, ${fixed ? `${page.widthMm} × ${page.heightMm} mm` : "8 in wide"}` },
          ]}
        />
      </Section>
    </FigurePanel>
  );
};
