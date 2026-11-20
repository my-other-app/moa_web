"use client";

import { isPosterFormat, POSTER_FORMAT_SPECS, POSTER_FORMATS, type PosterFormat } from "@moa/layout";
import { EmptyState, NativeSelect, Segmented, Skeleton } from "@moa/ui";
import * as React from "react";

import { BoardPage } from "../board/board-page";
import { usePosterVariants } from "../queries";
import type { PosterVariants } from "../schemas";
import { LeaveDialog } from "./dialogs";

/**
 * An event's poster designs on the board. A design is per variant — the
 * event's default, a role's, a ticket type's — and holds a layout for each
 * format; a guest gets the first that has one: their role's, their ticket
 * type's, everyone's, then the built-in poster (posters contract §3). Which
 * variant and format are open is in the address (`?variant=&format=`), so the
 * Posters page can link straight to one.
 */

/** A variant's name when the API has not listed it (a ticket type since removed). */
const fallbackLabel = (variant: string) => {
  if (variant === "default") return "Everyone";
  const [kind, rest = ""] = variant.split(":");
  if (kind === "role") return `${rest.charAt(0).toUpperCase()}${rest.slice(1)}s`;
  if (kind === "type") return `Ticket type ${rest}`;
  return variant;
};

const GROUPS: { title: string; test: (v: string) => boolean }[] = [
  { title: "Everyone", test: (v) => v === "default" },
  { title: "By role", test: (v) => v.startsWith("role:") },
  { title: "By ticket type", test: (v) => v.startsWith("type:") },
];

/** Who the design is for: the variants, grouped (everyone, a role, a ticket type). */
export const VariantPicker = ({ value, options, onChange }: { value: string; options: { variant: string; label: string }[]; onChange: (v: string) => void }) => {
  const all = options.some((o) => o.variant === value) ? options : [...options, { variant: value, label: fallbackLabel(value) }];
  return (
    <label className="flex flex-wrap items-center gap-2.5">
      <span className="eyebrow">Designing for</span>
      <NativeSelect aria-label="Designing for" className="w-auto min-w-[200px]" value={value} onChange={(e) => onChange(e.target.value)}>
        {GROUPS.map((g) => {
          const items = all.filter((o) => g.test(o.variant));
          if (!items.length) return null;
          return (
            <optgroup key={g.title} label={g.title}>
              {items.map((o) => (
                <option key={o.variant} value={o.variant}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          );
        })}
      </NativeSelect>
    </label>
  );
};

/** Which formats this variant has a layout of its own for, in words. */
export const savedFormatsNote = (saved: PosterVariants["variants"][number]["formats"]) => {
  const own = POSTER_FORMATS.filter((f) => saved[f]?.saved);
  if (!own.length) return "No layout of its own yet: each format shows the next design in line.";
  if (own.length === POSTER_FORMATS.length) return "Its own square, portrait and story layouts.";
  const rest = POSTER_FORMATS.filter((f) => !own.includes(f));
  const words = (fs: readonly PosterFormat[]) => fs.map((f) => POSTER_FORMAT_SPECS[f].label.toLowerCase()).join(" and ");
  return `Its own ${words(own)} ${own.length === 1 ? "layout" : "layouts"}; ${words(rest)} ${rest.length === 1 ? "follows" : "follow"} the next design in line.`;
};

export const PosterDesignTab = ({ eventId, dirtyRef }: { eventId: number; dirtyRef: React.MutableRefObject<boolean> }) => {
  const [variant, setVariant] = React.useState(() => (typeof window === "undefined" ? "default" : new URLSearchParams(window.location.search).get("variant") || "default"));
  const [format, setFormat] = React.useState<PosterFormat>(() => {
    const asked = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("format");
    return isPosterFormat(asked) ? asked : "square";
  });
  const [pending, setPending] = React.useState<(() => void) | null>(null);
  const variants = usePosterVariants(eventId);

  const ask = React.useCallback(
    (go: () => void) => {
      if (dirtyRef.current) setPending(() => go);
      else go();
    },
    [dirtyRef]
  );
  const open = (v: string, f: PosterFormat) => {
    if (v === variant && f === format) return;
    ask(() => {
      dirtyRef.current = false;
      setVariant(v);
      setFormat(f);
      // In the address, so a reload or a shared link opens on the same design.
      const q = new URLSearchParams(window.location.search);
      q.set("variant", v);
      q.set("format", f);
      window.history.replaceState(null, "", `?${q.toString()}`);
    });
  };

  if (variants.isPending) return <Skeleton className="h-[480px] rounded-2xl" />;
  if (!variants.data)
    return (
      <EmptyState
        tone="muted"
        title="Posters are not here yet"
        description={variants.isError ? "Could not load the poster designs. Reload to try again." : "Guests' “I'm attending” posters come with the next update of MyOtherApp."}
      />
    );

  const options = variants.data.options.length ? variants.data.options : [{ variant: "default", label: "Everyone" }];
  const label = options.find((o) => o.variant === variant)?.label ?? fallbackLabel(variant);
  const saved = variants.data.variants.find((v) => v.variant === variant)?.formats ?? {};
  const picker = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <VariantPicker value={variant} options={options} onChange={(v) => open(v, format)} />
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="eyebrow">Format</span>
        <Segmented
          label="Format"
          value={format}
          options={POSTER_FORMATS.map((f) => ({ value: f, label: POSTER_FORMAT_SPECS[f].label }))}
          onChange={(f) => open(variant, f)}
        />
      </div>
      <span className="text-ink-3 text-[12px]">{savedFormatsNote(saved)}</span>
    </div>
  );

  return (
    <>
      <BoardPage
        scope={{ kind: "event", eventId }}
        kind="poster"
        audience="event_default"
        picker={picker}
        dirtyRef={dirtyRef}
        ask={ask}
        poster={{ variant, format, label }}
      />
      <LeaveDialog
        open={pending !== null}
        what="poster"
        onStay={() => setPending(null)}
        onLeave={() => {
          pending?.();
          setPending(null);
        }}
      />
    </>
  );
};
