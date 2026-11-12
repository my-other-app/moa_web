"use client";

import {
  type FontFamilyV2,
  type ImageLayerV2,
  IMAGE_SOURCE_LABEL_V2,
  type ImageSourceV2,
  type LayerV2,
  type QrLayerV2,
  type Quad,
  type ShadowV2,
  type ShapeLayerV2,
  type SvgLayerV2,
  type TextLayerV2,
  type TokenGroup,
  defaultMinSize,
  findFont,
} from "@moa/layout";
import { Button, CardLabel, FigurePanel, IconButton, Notice, Switch, cn } from "@moa/ui";
import { CopyIcon, Trash2Icon, UploadIcon, XIcon } from "lucide-react";
import * as React from "react";

import { NumberField, Section, SegmentedField, SelectField, TokenMenu } from "../components/fields";
import { ui } from "../components/kit";
import type { DesignToken } from "../schemas";
import { type ColorContext, ColorFieldV2, FillField, FontPicker, nearestFace, resolveColorV2, weightLabel } from "./fields";
import { KIND_ICON } from "./layers-panel";
import { KIND_NAME, svgColors } from "./model";

/**
 * What the selected layer is and how it looks, in short sections: where it
 * sits, then what its kind has (type for text, fill and outline for a
 * shape, colours for artwork, the picture for an image), then its shadow
 * and when it shows. Every field is labelled; every change is an undo step,
 * a run of typing in one field being one.
 */

export interface InspectorContext {
  colors: ColorContext;
  fonts: readonly FontFamilyV2[];
  tokens: DesignToken[];
  samples: Record<string, string>;
  groups: TokenGroup[];
  /** The guest photo is a source on this kind. */
  guestPhoto: boolean;
  /** The kind is printed on stock that may carry pre-printed parts (badges). */
  preprint: boolean;
  /** What a QR holds on this kind, in words. */
  qrHolds: string;
  imageUrl: (l: ImageLayerV2) => string | null;
  onUpload: (file: File) => Promise<{ key: string; url: string } | null>;
  /** An event's signatures, stored with its design and saved at once; none on the club's templates. */
  onSignature?: (field: "signature_1" | "signature_2", file: File | null) => Promise<void>;
}

type Patch = (patch: Partial<LayerV2>, group?: string) => void;

const NameField = ({ id, value, onCommit }: { id: string; value: string; onCommit: (v: string) => void }) => {
  const [draft, setDraft] = React.useState(value);
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const commit = () => {
    const v = draft.trim();
    if (v && v !== value) onCommit(v.slice(0, 80));
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
        maxLength={80}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className={ui.control}
      />
    </div>
  );
};

/** Four corners or sides, the same for all unless split. */
const QuadField = ({ id, label: text, value, onChange, names }: { id: string; label: string; value: Quad; onChange: (v: Quad) => void; names: [string, string, string, string] }) => {
  const same = value.every((v) => v === value[0]);
  const [split, setSplit] = React.useState(!same);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          {split ? (
            <span className={ui.label}>{text}</span>
          ) : (
            <NumberField id={id} label={text} value={value[0]} min={0} suffix="px" onChange={(v) => onChange([v, v, v, v])} />
          )}
        </div>
        <label className="text-ink-2 mb-1.5 flex items-center gap-1.5 text-[11.5px]">
          <Switch checked={split} onCheckedChange={setSplit} aria-label={`${text}: set each one`} />
          Each
        </label>
      </div>
      {split ? (
        <div className="grid grid-cols-4 gap-1.5">
          {names.map((n, i) => (
            <NumberField
              key={n}
              id={`${id}-${i}`}
              label={n}
              value={value[i]!}
              min={0}
              onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)) as Quad)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
const CORNERS: [string, string, string, string] = ["Top left", "Top right", "Bottom right", "Bottom left"];
const SIDES: [string, string, string, string] = ["Top", "Right", "Bottom", "Left"];

const Toggle = ({ id, label: text, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <div className="flex items-start justify-between gap-3">
    <label htmlFor={id} className="min-w-0">
      <span className="text-ink block text-[12.5px] font-medium">{text}</span>
      {hint ? <span className={ui.note}>{hint}</span> : null}
    </label>
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
  </div>
);

// ─── Per kind ───────────────────────────────────────────────────────────

const TextFields = ({ l, patch, ctx, id }: { l: TextLayerV2; patch: Patch; ctx: InspectorContext; id: (f: string) => string }) => {
  const area = React.useRef<HTMLTextAreaElement>(null);
  const font = findFont(l.font.family, ctx.fonts);
  const weights = font ? (l.font.style === "italic" ? font.italic : font.normal) : [l.font.weight];
  const styles = font ? [font.normal.length ? "normal" : null, font.italic.length ? "italic" : null].filter(Boolean) : [l.font.style];
  const insert = (snippet: string) => {
    const el = area.current;
    const start = el?.selectionStart ?? l.text.length;
    const end = el?.selectionEnd ?? l.text.length;
    patch({ text: l.text.slice(0, start) + snippet + l.text.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };
  return (
    <>
      <Section title="Text" right={<TokenMenu onInsert={insert} tokens={ctx.tokens} samples={ctx.samples} groups={ctx.groups} />}>
        <div>
          <label htmlFor={id("text")} className="sr-only">
            Text
          </label>
          <textarea
            ref={area}
            id={id("text")}
            value={l.text}
            rows={3}
            maxLength={2000}
            spellCheck={false}
            onChange={(e) => patch({ text: e.target.value }, `${l.id}-text`)}
            className="input min-h-[72px] w-full py-2 font-mono text-[12px]"
          />
          <p className={cn(ui.note, "mt-1")}>Double-click the text on the canvas to write in place.</p>
        </div>
      </Section>
      <Section title="Type">
        <FontPicker
          id={id("font")}
          value={font?.family ?? l.font.family}
          fonts={ctx.fonts}
          sample={ctx.samples.attendee_name || "Asha Rao"}
          onChange={(family) => {
            const f = findFont(family, ctx.fonts);
            patch({ font: { family, ...(f ? nearestFace(f, l.font.weight, l.font.style) : { weight: l.font.weight, style: l.font.style }) } });
          }}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <SelectField
            id={id("weight")}
            label="Weight"
            value={l.font.weight}
            options={(weights.length ? weights : [l.font.weight]).map((w) => ({ value: w, label: weightLabel(w) }))}
            onChange={(weight) => patch({ font: { ...l.font, weight } })}
          />
          {styles.length > 1 ? (
            <SelectField
              id={id("style")}
              label="Style"
              value={l.font.style}
              options={[
                { value: "normal", label: "Upright" },
                { value: "italic", label: "Italic" },
              ]}
              onChange={(style) => patch({ font: { ...l.font, ...(font ? nearestFace(font, l.font.weight, style) : { style }) } })}
            />
          ) : null}
          <NumberField
            id={id("size")}
            label="Size"
            value={l.size}
            min={1}
            max={1000}
            suffix="px"
            onChange={(size) => patch({ size, minSize: Math.min(l.minSize, size) }, `${l.id}-size`)}
          />
          <NumberField id={id("tracking")} label="Letter spacing" value={l.letterSpacing} step={0.01} min={-1} max={5} suffix="em" onChange={(v) => patch({ letterSpacing: v }, `${l.id}-tracking`)} />
          <NumberField id={id("leading")} label="Line height" value={l.lineHeight} step={0.05} min={0.5} max={5} onChange={(v) => patch({ lineHeight: v }, `${l.id}-leading`)} />
        </div>
        <ColorFieldV2 id={id("color")} label="Colour" value={l.color} onChange={(c) => c && patch({ color: c }, `${l.id}-color`)} ctx={ctx.colors} />
      </Section>
      <Section title="Layout">
        <SegmentedField
          label="Align"
          value={l.align}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Centre" },
            { value: "right", label: "Right" },
          ]}
          onChange={(align) => patch({ align })}
        />
        <SegmentedField
          label="Vertical"
          value={l.valign}
          options={[
            { value: "top", label: "Top" },
            { value: "middle", label: "Middle" },
            { value: "bottom", label: "Bottom" },
          ]}
          onChange={(valign) => patch({ valign })}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <SelectField
            id={id("case")}
            label="Case"
            value={l.transform}
            options={[
              { value: "none", label: "As written" },
              { value: "upper", label: "CAPITALS" },
              { value: "lower", label: "lower case" },
            ]}
            onChange={(transform) => patch({ transform })}
          />
          <NumberField id={id("lines")} label="Lines at most" value={l.maxLines} min={1} max={20} onChange={(v) => patch({ maxLines: Math.round(v) }, `${l.id}-lines`)} />
          <SelectField
            id={id("fit")}
            label="When it is too long"
            value={l.fit}
            options={[
              { value: "shrink", label: "Shrink to fit" },
              { value: "ellipsis", label: "Cut with …" },
              { value: "none", label: "Leave it" },
            ]}
            onChange={(fit) => patch({ fit })}
          />
          {l.fit === "shrink" ? (
            <NumberField id={id("min")} label="Smallest size" value={l.minSize} min={1} max={l.size} suffix="px" onChange={(v) => patch({ minSize: v }, `${l.id}-min`)} />
          ) : null}
        </div>
      </Section>
      <Section title="Box">
        <FillField id={id("bg")} label="Background" value={l.background} onChange={(background) => patch({ background }, `${l.id}-bg`)} ctx={ctx.colors} />
        <QuadField id={id("padding")} label="Padding" value={l.padding} names={SIDES} onChange={(padding) => patch({ padding }, `${l.id}-padding`)} />
        <QuadField id={id("radius")} label="Corner radius" value={l.radius} names={CORNERS} onChange={(radius) => patch({ radius }, `${l.id}-radius`)} />
      </Section>
    </>
  );
};

const ShapeFields = ({ l, patch, ctx, id }: { l: ShapeLayerV2; patch: Patch; ctx: InspectorContext; id: (f: string) => string }) => (
  <>
    <Section title="Shape">
      <SegmentedField
        label="Shape"
        value={l.shape}
        options={[
          { value: "rect", label: "Rectangle" },
          { value: "ellipse", label: "Ellipse" },
          { value: "path", label: "Outline" },
        ]}
        onChange={(shape) => patch({ shape, path: shape === "path" ? (l.path ?? `M0 0 L${l.width} 0 L${l.width / 2} ${l.height} Z`) : l.path })}
      />
      {l.shape === "path" ? (
        <div>
          <label htmlFor={id("path")} className={ui.label}>
            Outline
          </label>
          <textarea
            id={id("path")}
            value={l.path ?? ""}
            rows={3}
            spellCheck={false}
            onChange={(e) => patch({ path: e.target.value }, `${l.id}-path`)}
            className="input min-h-[60px] w-full py-2 font-mono text-[11px]"
          />
          <p className={cn(ui.note, "mt-1")}>SVG path commands in the layer&apos;s own pixels.</p>
        </div>
      ) : null}
      <FillField id={id("fill")} label="Fill" value={l.fill} onChange={(fill) => patch({ fill }, `${l.id}-fill`)} ctx={ctx.colors} />
      {l.shape === "rect" ? <QuadField id={id("radius")} label="Corner radius" value={l.radius} names={CORNERS} onChange={(radius) => patch({ radius }, `${l.id}-radius`)} /> : null}
    </Section>
    <Section title="Outline">
      <ColorFieldV2
        id={id("stroke")}
        label="Line colour"
        value={l.stroke?.color ?? null}
        allowNone
        ctx={ctx.colors}
        onChange={(c) => patch({ stroke: c ? { color: c, width: l.stroke?.width || 2, dash: l.stroke?.dash ?? null } : null }, `${l.id}-stroke`)}
      />
      {l.stroke ? (
        <div className="grid grid-cols-2 gap-2.5">
          <NumberField id={id("stroke-w")} label="Line width" value={l.stroke.width} min={0} max={1000} suffix="px" onChange={(width) => patch({ stroke: { ...l.stroke!, width } }, `${l.id}-stroke-w`)} />
          <SelectField
            id={id("dash")}
            label="Line"
            value={l.stroke.dash ? "dashed" : "solid"}
            options={[
              { value: "solid", label: "Solid" },
              { value: "dashed", label: "Dashed" },
            ]}
            onChange={(v) => patch({ stroke: { ...l.stroke!, dash: v === "dashed" ? [Math.max(2, l.stroke!.width * 3), Math.max(2, l.stroke!.width * 2)] : null } })}
          />
          {l.stroke.dash ? (
            <>
              <NumberField id={id("dash-on")} label="Dash" value={l.stroke.dash[0]} min={0} suffix="px" onChange={(v) => patch({ stroke: { ...l.stroke!, dash: [v, l.stroke!.dash![1]] } }, `${l.id}-dash`)} />
              <NumberField id={id("dash-off")} label="Gap" value={l.stroke.dash[1]} min={0} suffix="px" onChange={(v) => patch({ stroke: { ...l.stroke!, dash: [l.stroke!.dash![0], v] } }, `${l.id}-dash`)} />
            </>
          ) : null}
        </div>
      ) : null}
    </Section>
  </>
);

const readSvg = (file: File) => file.text();

const SvgFields = ({ l, patch, ctx, id }: { l: SvgLayerV2; patch: Patch; ctx: InspectorContext; id: (f: string) => string }) => {
  const file = React.useRef<HTMLInputElement>(null);
  const colors = React.useMemo(() => svgColors(l.markup), [l.markup]);
  const recolor = l.recolor ?? {};
  const setColor = (from: string, to: string | null) => {
    const next = { ...recolor };
    const key = Object.keys(next).find((k) => k.toUpperCase() === from) ?? from;
    if (to) next[key] = to;
    else delete next[key];
    patch({ recolor: Object.keys(next).length ? next : null }, `${l.id}-recolor`);
  };
  return (
    <Section title="Artwork">
      <SelectField
        id={id("fit")}
        label="Fit"
        value={l.fit}
        options={[
          { value: "contain", label: "Fit inside" },
          { value: "cover", label: "Fill and crop" },
          { value: "stretch", label: "Stretch" },
        ]}
        onChange={(fit) => patch({ fit })}
      />
      {colors.length ? (
        <div className="flex flex-col gap-2">
          <span className={ui.label}>Colours</span>
          <p className={cn(ui.note, "-mt-1")}>Each colour in the artwork, and what to paint it with. The accent follows the document.</p>
          {colors.map((c) => {
            const mapped = Object.entries(recolor).find(([k]) => k.toUpperCase() === c)?.[1] ?? null;
            return (
              <div key={c} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                <span className="border-line size-5 rounded-full border" style={{ background: c }} title={c} aria-hidden="true" />
                <ColorFieldV2 id={id(`re-${c.slice(1)}`)} label={`Paint ${c} as`} value={mapped} allowNone ctx={ctx.colors} compact onChange={(to) => setColor(c, to)} />
              </div>
            );
          })}
          <p className={ui.note}>None keeps the colour as drawn.</p>
        </div>
      ) : (
        <p className={ui.note}>This artwork has no colours written as hex to change.</p>
      )}
      <input
        ref={file}
        type="file"
        accept=".svg,image/svg+xml"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) patch({ markup: await readSvg(f), recolor: null });
        }}
      />
      <Button type="button" size="xs" variant="secondary" className="self-start" onClick={() => file.current?.click()}>
        <UploadIcon /> Replace the SVG
      </Button>
    </Section>
  );
};

const ImageFields = ({ l, patch, ctx, id }: { l: ImageLayerV2; patch: Patch; ctx: InspectorContext; id: (f: string) => string }) => {
  const file = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const sources = (Object.keys(IMAGE_SOURCE_LABEL_V2) as ImageSourceV2[]).filter((s) => s !== "guest_photo" || ctx.guestPhoto || l.source === s);
  const url = ctx.imageUrl(l);
  return (
    <Section title="Picture">
      <SelectField id={id("source")} label="Shows" value={l.source} options={sources.map((s) => ({ value: s, label: IMAGE_SOURCE_LABEL_V2[s] }))} onChange={(source) => patch({ source })} />
      {(l.source === "signature_1" || l.source === "signature_2") && ctx.onSignature ? (
        <SignatureField l={l} source={l.source} url={url} onSignature={ctx.onSignature} />
      ) : l.source === "signature_1" || l.source === "signature_2" ? (
        <p className={ui.note}>Each event uploads its own signatures, in its own designs.</p>
      ) : null}
      {l.source === "upload" ? (
        <div className="flex items-center gap-2.5">
          <span className="bg-sunken border-line grid size-14 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a signed upload URL, shown as it is
              <img src={url} alt="" className="size-full object-contain" />
            ) : (
              <span className="text-ink-3 text-[10.5px]">None</span>
            )}
          </span>
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              const res = await ctx.onUpload(f);
              setBusy(false);
              if (res) patch({ imageKey: res.key });
            }}
          />
          <Button type="button" size="xs" variant="secondary" disabled={busy} onClick={() => file.current?.click()}>
            <UploadIcon /> {busy ? "Uploading…" : l.imageKey ? "Replace" : "Upload"}
          </Button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2.5">
        <SelectField
          id={id("fit")}
          label="Fit"
          value={l.fit}
          options={[
            { value: "contain", label: "Fit inside" },
            { value: "cover", label: "Fill and crop" },
          ]}
          onChange={(fit) => patch({ fit })}
        />
        {l.source === "guest_photo" ? (
          <SelectField
            id={id("placeholder")}
            label="No photo"
            value={l.placeholder}
            options={[
              { value: "initials", label: "Show initials" },
              { value: "none", label: "Leave empty" },
            ]}
            onChange={(placeholder) => patch({ placeholder })}
          />
        ) : null}
      </div>
      <QuadField id={id("radius")} label="Corner radius" value={l.radius} names={CORNERS} onChange={(radius) => patch({ radius }, `${l.id}-radius`)} />
      <ColorFieldV2
        id={id("border")}
        label="Border"
        value={l.border?.color ?? null}
        allowNone
        ctx={ctx.colors}
        onChange={(c) => patch({ border: c ? { color: c, width: l.border?.width || 2 } : null }, `${l.id}-border`)}
      />
      {l.border ? <NumberField id={id("border-w")} label="Border width" value={l.border.width} min={0} max={500} suffix="px" onChange={(width) => patch({ border: { ...l.border!, width } }, `${l.id}-border-w`)} /> : null}
    </Section>
  );
};

/** The signature a signature layer shows: uploaded with the event's design, saved at once. */
const SignatureField = ({
  l,
  source,
  url,
  onSignature,
}: {
  l: ImageLayerV2;
  source: "signature_1" | "signature_2";
  url: string | null;
  onSignature: (field: "signature_1" | "signature_2", file: File | null) => Promise<void>;
}) => {
  const file = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const run = async (f: File | null) => {
    setBusy(true);
    try {
      await onSignature(source, f);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2.5">
      <span className="bg-sunken border-line grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed link, shown as it is
          <img src={url} alt="" className="size-full object-contain" />
        ) : (
          <span className="text-ink-3 text-[10.5px]">None</span>
        )}
      </span>
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void run(f);
        }}
      />
      <Button type="button" size="xs" variant="secondary" disabled={busy} onClick={() => file.current?.click()} aria-label={`Upload the signature for ${l.name}`}>
        <UploadIcon /> {busy ? "Saving…" : url ? "Replace" : "Upload"}
      </Button>
      {url ? (
        <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => void run(null)}>
          Remove
        </Button>
      ) : null}
    </div>
  );
};

const QrFields = ({ l, patch, ctx, id }: { l: QrLayerV2; patch: Patch; ctx: InspectorContext; id: (f: string) => string }) => (
  <Section title="QR code">
    <p className={ui.note}>Always black on white, so every scanner reads it. It holds {ctx.qrHolds}.</p>
    <NumberField id={id("quiet")} label="Blank border" value={l.quietZone} min={0} max={4} suffix="modules" onChange={(v) => patch({ quietZone: Math.round(v) }, `${l.id}-quiet`)} />
    <FillField id={id("bg")} label="Tile behind it" value={l.background} onChange={(background) => patch({ background }, `${l.id}-bg`)} ctx={ctx.colors} />
    <QuadField id={id("radius")} label="Corner radius" value={l.radius} names={CORNERS} onChange={(radius) => patch({ radius }, `${l.id}-radius`)} />
  </Section>
);

const SHADOW: ShadowV2 = { x: 0, y: 4, blur: 12, spread: 0, color: "#00000040" };

// ─── The panel ──────────────────────────────────────────────────────────

export const BoardInspector = ({
  layer,
  onPatch,
  onClose,
  onDuplicate,
  onRemove,
  canRemove,
  canDuplicate,
  problems,
  ctx,
}: {
  layer: LayerV2;
  onPatch: Patch;
  onClose: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canRemove: boolean;
  canDuplicate: boolean;
  problems: string[];
  ctx: InspectorContext;
}) => {
  const id = (f: string) => `insp-${layer.id}-${f}`;
  const g = (f: string) => `${layer.id}-${f}`;
  const state = [KIND_NAME[layer.kind], layer.locked ? "locked" : null, layer.hidden ? "hidden" : null].filter(Boolean).join(" · ");
  const tokenOptions = [{ value: "", label: "Always" }, ...ctx.tokens.map((t) => ({ value: t.key, label: `When ${t.label.toLowerCase()} is filled in` }))];
  const square = layer.kind === "qr";
  return (
    <FigurePanel role="region" aria-label="Properties" className="p-0">
      <div className="px-4 pt-4 pb-3.5">
        <CardLabel
          right={
            <IconButton label="Deselect" variant="quiet" size="xs" onClick={onClose}>
              <XIcon />
            </IconButton>
          }
        >
          Properties
        </CardLabel>
        <div className="mt-2 flex items-center gap-2.5">
          <span aria-hidden="true" className={cn("grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] [&_svg]:size-4", problems.length ? "bg-refuse-soft text-refuse" : "bg-sunken text-ink-2")}>
            {KIND_ICON[layer.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-ink m-0 truncate text-[14px] font-semibold">{layer.name}</p>
            <p className="text-ink-3 m-0 text-[12px]">{state}</p>
          </div>
          <IconButton label="Duplicate" size="sm" variant="quiet" disabled={!canDuplicate} onClick={onDuplicate}>
            <CopyIcon />
          </IconButton>
          <IconButton label={canRemove ? "Delete" : "This design needs its QR code"} size="sm" variant="quiet" danger disabled={!canRemove} onClick={onRemove}>
            <Trash2Icon />
          </IconButton>
        </div>
        {problems.length ? (
          <Notice tone="refuse" tag="Fix" className="mt-3">
            <ul className="m-0 list-disc pl-4">
              {problems.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </div>

      <Section title="Layer">
        <NameField id={id("name")} value={layer.name} onCommit={(name) => onPatch({ name })} />
        <div className="grid grid-cols-2 gap-2.5">
          <NumberField id={id("x")} label="X" value={layer.x} suffix="px" onChange={(x) => onPatch({ x }, g("x"))} />
          <NumberField id={id("y")} label="Y" value={layer.y} suffix="px" onChange={(y) => onPatch({ y }, g("y"))} />
          <NumberField
            id={id("w")}
            label={square ? "Size" : "Width"}
            value={layer.width}
            min={1}
            suffix="px"
            onChange={(width) => onPatch(square ? { width, height: width } : { width }, g("w"))}
          />
          {square ? null : <NumberField id={id("h")} label="Height" value={layer.height} min={1} suffix="px" onChange={(height) => onPatch({ height }, g("h"))} />}
          <NumberField id={id("rot")} label="Rotation" value={layer.rotation} min={-360} max={360} suffix="°" onChange={(rotation) => onPatch({ rotation }, g("rot"))} />
          <NumberField id={id("opacity")} label="Opacity" value={Math.round(layer.opacity * 100)} min={0} max={100} suffix="%" onChange={(v) => onPatch({ opacity: v / 100 }, g("opacity"))} />
        </div>
      </Section>

      {layer.kind === "text" ? <TextFields l={layer} patch={onPatch} ctx={ctx} id={id} /> : null}
      {layer.kind === "shape" ? <ShapeFields l={layer} patch={onPatch} ctx={ctx} id={id} /> : null}
      {layer.kind === "svg" ? <SvgFields l={layer} patch={onPatch} ctx={ctx} id={id} /> : null}
      {layer.kind === "image" ? <ImageFields l={layer} patch={onPatch} ctx={ctx} id={id} /> : null}
      {layer.kind === "qr" ? <QrFields l={layer} patch={onPatch} ctx={ctx} id={id} /> : null}

      <Section title="Shadow" right={<Switch aria-label="Shadow" checked={!!layer.shadow} onCheckedChange={(on) => onPatch({ shadow: on ? SHADOW : null })} />}>
        {layer.shadow ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField id={id("sx")} label="Across" value={layer.shadow.x} suffix="px" onChange={(x) => onPatch({ shadow: { ...layer.shadow!, x } }, g("shadow"))} />
              <NumberField id={id("sy")} label="Down" value={layer.shadow.y} suffix="px" onChange={(y) => onPatch({ shadow: { ...layer.shadow!, y } }, g("shadow"))} />
              <NumberField id={id("sb")} label="Blur" value={layer.shadow.blur} min={0} suffix="px" onChange={(blur) => onPatch({ shadow: { ...layer.shadow!, blur } }, g("shadow"))} />
              <NumberField id={id("ss")} label="Spread" value={layer.shadow.spread} suffix="px" onChange={(spread) => onPatch({ shadow: { ...layer.shadow!, spread } }, g("shadow"))} />
            </div>
            <ColorFieldV2 id={id("sc")} label="Shadow colour" value={layer.shadow.color} ctx={ctx.colors} onChange={(c) => c && onPatch({ shadow: { ...layer.shadow!, color: c } }, g("shadow"))} />
          </>
        ) : (
          <p className={ui.note}>No shadow.</p>
        )}
      </Section>

      <Section title="Shows">
        <SelectField id={id("showif")} label="Show this layer" value={layer.showIf ?? ""} options={tokenOptions} onChange={(v) => onPatch({ showIf: v || null })} />
        {ctx.preprint ? (
          <Toggle
            id={id("pre")}
            label="Already printed on the card"
            hint="Shown here, left out when printing."
            checked={layer.preprinted}
            onChange={(preprinted) => onPatch({ preprinted })}
          />
        ) : null}
      </Section>
    </FigurePanel>
  );
};

/** A text layer's colour as painted, for the in-place editor. */
export const paintOf = (l: TextLayerV2, ctx: ColorContext) => resolveColorV2(l.color, ctx);

/** minSize kept below size when the size shrinks under it. */
export const minFor = (size: number, min: number | undefined) => Math.min(size, min ?? defaultMinSize(size));
