"use client";

import * as React from "react";
import { PlusIcon, Trash2Icon, UploadIcon, XIcon } from "lucide-react";
import { Button, IconButton, cn, toast } from "@moa/ui";

import { IMAGE_ACCEPT, fitImage } from "@/lib/images";

import { uploadEmailImage } from "../api";
import {
  BLOCK_META,
  type BlockKind,
  type BlockStyle,
  type DetailsRow,
  type EmailBlock,
  type EmailScope,
  type EmailToken,
} from "../schemas";
import {
  Busy,
  ColorField,
  NumberField,
  Segmented,
  SelectField,
  TemplateField,
  Toggle,
  ui,
} from "./kit";

interface TokenProps {
  tokens: EmailToken[];
  samples: Record<string, string>;
}

const DEFAULT_SIZE: Record<BlockKind, number> = {
  heading: 30,
  paragraph: 16,
  button: 16,
  image: 16,
  divider: 16,
  spacer: 16,
  list: 16,
  details: 15,
  ticket_card: 15,
};

const RowsEditor = ({
  rows,
  onChange,
  tokens,
  samples,
  label,
}: {
  rows: DetailsRow[];
  onChange: (rows: DetailsRow[]) => void;
  label: string;
} & TokenProps) => (
  <div className="space-y-2">
    <span className={ui.label}>{label}</span>
    {rows.map((r, i) => (
      <div
        key={i}
        className="border-line-soft bg-sunken/40 rounded-xl border p-2.5"
      >
        <div className="mb-2 flex items-center gap-1.5">
          <input
            aria-label={`Row ${i + 1} label`}
            value={r.label}
            placeholder="Label"
            onChange={(e) =>
              onChange(
                rows.map((x, j) =>
                  j === i ? { ...x, label: e.target.value } : x,
                ),
              )
            }
            className={ui.small}
          />
          <IconButton
            label={`Remove row ${i + 1}`}
            size="xs"
            variant="quiet"
            danger
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <XIcon />
          </IconButton>
        </div>
        <TemplateField
          id={`row-${i}-value`}
          label="Value"
          value={r.value}
          single
          onChange={(v) =>
            onChange(rows.map((x, j) => (j === i ? { ...x, value: v } : x)))
          }
          tokens={tokens}
          samples={samples}
        />
      </div>
    ))}
    <Button
      type="button"
      variant="secondary"
      size="xs"
      onClick={() => onChange([...rows, { label: "Label", value: "" }])}
    >
      <PlusIcon /> Add row
    </Button>
  </div>
);

const ImageSource = ({
  block,
  patch,
  scope,
}: {
  block: Extract<EmailBlock, { kind: "image" }>;
  patch: (p: Partial<Extract<EmailBlock, { kind: "image" }>>) => void;
  scope: EmailScope;
}) => {
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      // Converted when the API does not keep its format, and redrawn smaller when over budget (lib/images).
      const up = await uploadEmailImage(scope, await fitImage(file, "image"));
      patch({ imageKey: up.key });
      toast.success("Image uploaded", {
        description: `${up.width} × ${up.height}, sized for email.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <div className="space-y-2">
      <SelectField
        id="image-source"
        label="Picture"
        value={block.source}
        options={[
          { value: "upload", label: "An image you upload" },
          { value: "org_logo", label: "The club's logo" },
          { value: "event_icon", label: "The event poster" },
          { value: "qr", label: "The guest's QR code" },
        ]}
        onChange={(source) => patch({ source })}
      />
      {block.source === "upload" ? (
        <div className="border-line rounded-xl border border-dashed p-3">
          <p className={cn(ui.note, "mb-1.5 truncate")}>
            {block.imageKey
              ? block.imageKey.split("/").pop()
              : "No image yet. Any picture: an SVG, a HEIC or an AVIF is converted, and a big one made smaller to send."}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="secondary"
            size="xs"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Busy on={busy} />
            {busy ? null : <UploadIcon />}{" "}
            {block.imageKey ? "Replace" : "Upload"}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

function Fields({
  block,
  onChange,
  tokens,
  samples,
  scope,
}: {
  block: EmailBlock;
  onChange: (b: EmailBlock) => void;
  scope: EmailScope;
} & TokenProps) {
  const patch = (p: Record<string, unknown>) =>
    onChange({ ...block, ...p } as EmailBlock);
  switch (block.kind) {
    case "heading":
      return (
        <>
          <TemplateField
            id="b-text"
            label="Text"
            value={block.text}
            rows={2}
            onChange={(text) => patch({ text })}
            tokens={tokens}
            samples={samples}
          />
          <Segmented
            label="Level"
            value={String(block.level) as "1" | "2"}
            options={[
              { value: "1", label: "Title" },
              { value: "2", label: "Section" },
            ]}
            onChange={(v) => patch({ level: Number(v) })}
          />
        </>
      );
    case "paragraph":
      return (
        <>
          <TemplateField
            id="b-text"
            label="Text"
            value={block.text}
            rows={6}
            onChange={(text) => patch({ text })}
            tokens={tokens}
            samples={samples}
          />
          <p className={ui.note}>
            **bold**, _italic_ and [a link](https://…) work here. A blank line
            starts a new paragraph.
          </p>
        </>
      );
    case "button":
      return (
        <>
          <TemplateField
            id="b-label"
            label="Label"
            value={block.label}
            single
            onChange={(label) => patch({ label })}
            tokens={tokens}
            samples={samples}
          />
          <TemplateField
            id="b-href"
            label="Link"
            value={block.href}
            single
            placeholder="https://… or {{ticket_url}}"
            onChange={(href) => patch({ href })}
            tokens={tokens}
            samples={samples}
          />
          <Segmented
            label="Style"
            value={block.variant}
            options={[
              { value: "primary", label: "Filled" },
              { value: "secondary", label: "Outlined" },
            ]}
            onChange={(variant) => patch({ variant })}
          />
        </>
      );
    case "image":
      return (
        <>
          <ImageSource block={block} patch={patch} scope={scope} />
          <div className="min-w-0">
            <label htmlFor="b-alt" className={ui.label}>
              Description (for screen readers)
            </label>
            <input
              id="b-alt"
              value={block.alt}
              onChange={(e) => patch({ alt: e.target.value })}
              className={ui.control}
            />
          </div>
          <NumberField
            id="b-width"
            label="Width"
            value={block.width}
            min={10}
            max={100}
            suffix="%"
            onChange={(width) => patch({ width })}
          />
          <TemplateField
            id="b-href"
            label="Link (optional)"
            value={block.href ?? ""}
            single
            onChange={(href) => patch({ href: href || null })}
            tokens={tokens}
            samples={samples}
          />
        </>
      );
    case "divider":
      return (
        <ColorField
          id="b-color"
          label="Colour"
          value={block.color}
          fallback="#E1E1DC"
          clearable
          onChange={(color) => patch({ color })}
        />
      );
    case "spacer":
      return (
        <NumberField
          id="b-height"
          label="Height"
          value={block.height}
          min={4}
          max={160}
          suffix="px"
          onChange={(height) => patch({ height })}
        />
      );
    case "list":
      return (
        <>
          <TemplateField
            id="b-items"
            label="Items, one per line"
            value={block.items.join("\n")}
            rows={6}
            onChange={(v) =>
              patch({ items: v.split("\n").length ? v.split("\n") : [""] })
            }
            tokens={tokens}
            samples={samples}
          />
          <Toggle
            id="b-ordered"
            label="Numbered"
            checked={block.ordered}
            onChange={(ordered) => patch({ ordered })}
          />
        </>
      );
    case "details":
      return (
        <RowsEditor
          label="Rows"
          rows={block.rows}
          onChange={(rows) =>
            patch({
              rows: rows.length ? rows : [{ label: "Label", value: "" }],
            })
          }
          tokens={tokens}
          samples={samples}
        />
      );
    case "ticket_card":
      return (
        <>
          <Toggle
            id="b-qr"
            label="Show the QR code"
            checked={block.showQr}
            onChange={(showQr) => patch({ showQr })}
            note="The guest's own code, inline in the message."
          />
          <Toggle
            id="b-venue"
            label="Show the venue"
            checked={block.showVenue}
            onChange={(showVenue) => patch({ showVenue })}
          />
          <TemplateField
            id="b-eyebrow"
            label="Eyebrow"
            value={block.eyebrow}
            single
            onChange={(eyebrow) => patch({ eyebrow })}
            tokens={tokens}
            samples={samples}
          />
          <TemplateField
            id="b-title"
            label="Title"
            value={block.title}
            single
            onChange={(title) => patch({ title })}
            tokens={tokens}
            samples={samples}
          />
          <TemplateField
            id="b-note"
            label="Note under the card"
            value={block.note}
            rows={2}
            onChange={(note) => patch({ note })}
            tokens={tokens}
            samples={samples}
          />
          <RowsEditor
            label="Rows (leave empty for event, when, where, admission)"
            rows={block.rows}
            onChange={(rows) => patch({ rows })}
            tokens={tokens}
            samples={samples}
          />
        </>
      );
  }
}

function StyleFields({
  kind,
  style,
  onChange,
  textColor,
}: {
  kind: BlockKind;
  style: BlockStyle;
  onChange: (p: Partial<BlockStyle>) => void;
  textColor: string;
}) {
  const textual = !["divider", "spacer", "image"].includes(kind);
  const spaced = kind !== "spacer";
  return (
    <div className="border-line-soft space-y-2.5 border-t pt-3">
      <p className={ui.heading}>Style</p>
      {kind !== "spacer" && kind !== "divider" ? (
        <Segmented
          label="Align"
          value={style.align}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Centre" },
            { value: "right", label: "Right" },
          ]}
          onChange={(align) => onChange({ align })}
        />
      ) : null}
      {textual ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            id="s-size"
            label="Size"
            value={style.size ?? DEFAULT_SIZE[kind]}
            min={10}
            max={72}
            suffix="px"
            onChange={(size) => onChange({ size })}
          />
          <SelectField
            id="s-weight"
            label="Weight"
            value={style.weight ?? "auto"}
            options={[
              { value: "auto", label: "Default" },
              { value: "400", label: "Regular" },
              { value: "600", label: "Semibold" },
              { value: "700", label: "Bold" },
            ]}
            onChange={(v) =>
              onChange({
                weight: v === "auto" ? null : (v as BlockStyle["weight"]),
              })
            }
          />
        </div>
      ) : null}
      {textual || kind === "image" ? (
        <div className="grid grid-cols-2 gap-2">
          {textual ? (
            <ColorField
              id="s-color"
              label="Text colour"
              value={style.color}
              fallback={textColor}
              clearable
              onChange={(color) => onChange({ color })}
            />
          ) : null}
          <ColorField
            id="s-bg"
            label="Background"
            value={style.background}
            fallback="#ffffff"
            clearable
            onChange={(background) => onChange({ background })}
          />
        </div>
      ) : null}
      {spaced ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            id="s-pt"
            label="Space above"
            value={style.paddingTop}
            min={0}
            max={120}
            suffix="px"
            onChange={(paddingTop) => onChange({ paddingTop })}
          />
          <NumberField
            id="s-pb"
            label="Space below"
            value={style.paddingBottom}
            min={0}
            max={120}
            suffix="px"
            onChange={(paddingBottom) => onChange({ paddingBottom })}
          />
        </div>
      ) : null}
      {textual ? (
        <NumberField
          id="s-ls"
          label="Letter spacing"
          value={style.letterSpacing}
          min={-2}
          max={12}
          step={0.5}
          suffix="px"
          onChange={(letterSpacing) => onChange({ letterSpacing })}
        />
      ) : null}
    </div>
  );
}

/** Everything about one block: its words, then how it looks. */
export function BlockInspector({
  block,
  onChange,
  onRemove,
  tokens,
  samples,
  scope,
  textColor,
}: {
  block: EmailBlock;
  onChange: (b: EmailBlock) => void;
  onRemove: () => void;
  scope: EmailScope;
  textColor: string;
} & TokenProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink text-[13.5px] font-semibold">
            {BLOCK_META[block.kind].label}
          </p>
          <p className={ui.note}>{BLOCK_META[block.kind].note}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          danger
          onClick={onRemove}
          aria-label="Remove block"
        >
          <Trash2Icon /> Remove
        </Button>
      </div>
      <Fields
        block={block}
        onChange={onChange}
        tokens={tokens}
        samples={samples}
        scope={scope}
      />
      <StyleFields
        kind={block.kind}
        style={block.style}
        onChange={(p) =>
          onChange({ ...block, style: { ...block.style, ...p } })
        }
        textColor={textColor}
      />
    </div>
  );
}
