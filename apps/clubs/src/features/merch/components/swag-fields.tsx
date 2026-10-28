"use client";

import * as React from "react";
import { ImageIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button, IconButton, NativeSelect, toast } from "@moa/ui";

import { IMAGE_ACCEPT, IMAGE_FORMATS_LABEL, fitImage, isPicture } from "@/lib/images";

import { uploadMerchPhoto } from "../api";
import type { MerchField, MerchItem, MerchItemInput } from "../schemas";

/**
 * The fields the add form and the edit dialog share: who gets an item, the
 * rule by a guest's answer, the photo shown at the gate, and the sizes.
 */
export const label = "eyebrow mb-1.5 block";

export const WHO = [
  { value: "everyone", label: "Everyone who checks in" },
  { value: "first", label: "First arrivals at the door" },
  { value: "winners", label: "Winners only (at results)" },
  { value: "speaker", label: "Speakers & mentors" },
  { value: "staff", label: "Volunteers" },
  { value: "custom", label: "Guests with a certain answer…" },
] as const;
export type Who = (typeof WHO)[number]["value"];

/** Which choice of "Who gets it" an item's rule reads as. */
export function whoOf(
  item: Pick<MerchItem, "eligibility_field" | "eligibility_value" | "handout_rule">,
): { who: Who; field: string; value: string } {
  const field = item.eligibility_field ?? "";
  const value = item.eligibility_value ?? "";
  if (field && value) {
    if (field.toLowerCase() === "role" && value === "Speaker")
      return { who: "speaker", field: "", value: "" };
    if (field.toLowerCase() === "role" && value === "Staff")
      return { who: "staff", field: "", value: "" };
    return { who: "custom", field, value };
  }
  if (item.handout_rule === "first_n") return { who: "first", field: "", value: "" };
  if (item.handout_rule === "winners") return { who: "winners", field: "", value: "" };
  return { who: "everyone", field: "", value: "" };
}

/** The rule fields an item is saved with for a choice of "Who gets it". */
export function ruleOf(
  who: Who,
  field: string,
  value: string,
): Pick<MerchItemInput, "eligibility_field" | "eligibility_value" | "handout_rule"> {
  switch (who) {
    case "speaker":
      return { eligibility_field: "role", eligibility_value: "Speaker", handout_rule: "door" };
    case "staff":
      return { eligibility_field: "role", eligibility_value: "Staff", handout_rule: "door" };
    case "custom":
      return { eligibility_field: field || null, eligibility_value: value || null, handout_rule: "door" };
    case "first":
      return { eligibility_field: null, eligibility_value: null, handout_rule: "first_n" };
    case "winners":
      return { eligibility_field: null, eligibility_value: null, handout_rule: "winners" };
    default:
      return { eligibility_field: null, eligibility_value: null, handout_rule: "door" };
  }
}

export type Photo = { key: string | null; url: string | null };

/** The photo the gate shows beside the item, so the right thing is handed over. */
export function PhotoField({
  eventId,
  value,
  onChange,
}: {
  eventId: number;
  value: Photo;
  onChange: (v: Photo) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!isPicture(file)) return void toast.error(`Choose a picture: ${IMAGE_FORMATS_LABEL}`);
    setBusy(true);
    try {
      // Converted when the API does not keep its format, and redrawn smaller when over budget (lib/images).
      const up = await uploadMerchPhoto(eventId, await fitImage(file, "photo"));
      onChange({ key: up.key, url: up.url });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not upload that image",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      {value.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value.url}
          alt=""
          className="border-line-soft size-14 shrink-0 rounded-xl border object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="bg-sunken text-ink-3 grid size-14 shrink-0 place-items-center rounded-xl"
        >
          <ImageIcon className="size-5" />
        </span>
      )}
      <div className="grid gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <label
            className="btn btn-secondary btn-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brand)]"
            aria-disabled={busy || undefined}
          >
            {busy ? "Uploading…" : value.key ? "Replace photo" : "Add a photo"}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              disabled={busy}
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
          {value.key ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              danger
              onClick={() => onChange({ key: null, url: null })}
            >
              Remove
            </Button>
          ) : null}
        </span>
        <span className="text-ink-3 text-[11.5px]">
          Optional. Shown at the gate so the right thing is handed over.
        </span>
      </div>
    </div>
  );
}

/** A rule by a guest's answer: a field from the guest list, and the answer it must be. */
export function RuleFields({
  fields,
  field,
  value,
  onField,
  onValue,
}: {
  fields: MerchField[];
  field: string;
  value: string;
  onField: (v: string) => void;
  onValue: (v: string) => void;
}) {
  const id = React.useId();
  const chosen = fields.find(
    (f) => f.name.toLowerCase() === field.toLowerCase(),
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`${id}-field`} className={label}>
          Guest field
        </label>
        <NativeSelect
          id={`${id}-field`}
          value={field}
          onChange={(e) => (onField(e.target.value), onValue(""))}
        >
          <option value="">Pick a field</option>
          {fields.map((f) => (
            <option key={f.key} value={f.name}>
              {f.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div>
        <label htmlFor={`${id}-value`} className={label}>
          Must be
        </label>
        {chosen && chosen.values.length ? (
          <NativeSelect
            id={`${id}-value`}
            value={value}
            onChange={(e) => onValue(e.target.value)}
            disabled={!field}
          >
            <option value="">Pick an answer</option>
            {chosen.values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <input
            id={`${id}-value`}
            value={value}
            onChange={(e) => onValue(e.target.value)}
            placeholder="VIP"
            disabled={!field}
            maxLength={80}
            className="input"
          />
        )}
      </div>
    </div>
  );
}

export type SizeRow = { label: string; stock: string };

/** The sizes of a new item, each with its own stock, read from a guest field. */
export function SizesEditor({
  fields,
  field,
  rows,
  onField,
  onRows,
}: {
  fields: MerchField[];
  field: string;
  rows: SizeRow[];
  onField: (name: string) => void;
  onRows: (rows: SizeRow[]) => void;
}) {
  const id = React.useId();
  const sizeFields = fields.filter((f) => f.kind !== "role");
  return (
    <div className="grid gap-2">
      <div>
        <label htmlFor={`${id}-field`} className={label}>
          The guest field that holds the size
        </label>
        <NativeSelect
          id={`${id}-field`}
          value={field}
          onChange={(e) => onField(e.target.value)}
        >
          <option value="">Pick a field</option>
          {sizeFields.map((f) => (
            <option key={f.key} value={f.name}>
              {f.name}
              {f.values.length ? ` · ${f.values.join(", ")}` : ""}
            </option>
          ))}
        </NativeSelect>
      </div>
      {sizeFields.length === 0 ? (
        <p className="text-caution text-[12px]">
          The event has no guest fields yet. Add one (a list, like “T-shirt
          size”) under the event&apos;s Settings first.
        </p>
      ) : null}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={r.label}
            onChange={(e) =>
              onRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
            }
            placeholder="L"
            maxLength={40}
            aria-label="Size"
            className="input font-mono"
          />
          <input
            value={r.stock}
            inputMode="numeric"
            onChange={(e) =>
              onRows(
                rows.map((x, j) =>
                  j === i ? { ...x, stock: e.target.value.replace(/\D/g, "") } : x,
                ),
              )
            }
            placeholder="60"
            aria-label="Stock of this size"
            className="input w-24 shrink-0 font-mono"
          />
          <IconButton
            label={`Remove size ${r.label || i + 1}`}
            danger
            onClick={() => onRows(rows.filter((_, j) => j !== i))}
          >
            <Trash2Icon />
          </IconButton>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onRows([...rows, { label: "", stock: "" }])}
        >
          <PlusIcon /> Another size
        </Button>
      </div>
    </div>
  );
}
