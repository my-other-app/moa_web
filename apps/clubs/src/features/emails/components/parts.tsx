"use client";

import * as React from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button, Skeleton } from "@moa/ui";

import { usePreview } from "../queries";
import type { EmailDesign, EmailScope } from "../schemas";

/**
 * The pieces the library and an event's emails share, so an email card
 * reads the same in both: the preview that opens under a card, the button
 * that opens it, and the three small figures on a journey email.
 */

/** The email as a guest would see it, with sample values, rendered when asked for. */
export function EmailPreview({
  scope,
  subject,
  design,
  name,
  open,
}: {
  scope: EmailScope;
  subject: string;
  design: EmailDesign;
  /** The email's name, for the frame's title. */
  name: string;
  open: boolean;
}) {
  const preview = usePreview(scope, { subject, design }, open);
  if (!open) return null;
  return (
    <div className="border-line-soft mt-3 overflow-hidden rounded-xl border">
      <div className="bg-sunken text-ink-2 flex items-center justify-between px-3 py-1.5 text-[11.5px]">
        <span className="truncate">
          <span className="text-ink-3">Subject:</span>{" "}
          {preview.data?.subject ?? subject}
        </span>
        <span className="text-ink-3 shrink-0 font-mono text-[10px]">
          sample values
        </span>
      </div>
      {preview.isPending ? (
        <Skeleton className="h-72 rounded-none" />
      ) : preview.isError ? (
        <p className="text-refuse px-3 py-4 text-[12.5px]">
          Could not render this email.
        </p>
      ) : (
        // The mail's own surface: email clients draw it on white, whatever the dashboard's mode.
        <iframe
          title={`Preview of ${name}`}
          sandbox=""
          srcDoc={preview.data?.html ?? ""}
          className="h-[26rem] w-full bg-white"
        />
      )}
    </div>
  );
}

/** Opens and closes an `EmailPreview`. */
export function PreviewToggle({
  name,
  open,
  onToggle,
}: {
  name: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Preview"} ${name}`}
    >
      {open ? <EyeOffIcon /> : <EyeIcon />} {open ? "Hide" : "Preview"}
    </Button>
  );
}

/** One small figure: what it is, its value, and a line under it. */
export type Figure = readonly [
  label: string,
  value: React.ReactNode,
  sub: React.ReactNode,
];

/** Three small figures in a row: a value, what it is, and a line under it. */
export function MiniFigures({ items }: { items: readonly Figure[] }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {items.map(([label, value, sub]) => (
        <div key={label} className="bg-sunken rounded-xl px-2.5 py-2">
          <div className="text-ink font-mono text-[15px] font-semibold tabular-nums">
            {value}
          </div>
          <div className="text-ink-3 text-[10.5px] tracking-[0.04em] uppercase">
            {label}
          </div>
          <div className="text-ink-3 truncate text-[11px]">{sub}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Whether an event's copy was changed after it was made. The server says
 * the same thing the same way: saved more than a few seconds after it was
 * copied from the library.
 */
export const isCustomised = (t: { createdAt: string; updatedAt: string }) =>
  new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime() > 5_000;
