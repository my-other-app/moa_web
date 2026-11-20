"use client";

import { POSTER_FORMAT_SPECS, type PosterFormat } from "@moa/layout";
import { Skeleton } from "@moa/ui";
import { ImageIcon } from "lucide-react";
import * as React from "react";

import { DESIGNERS } from "../config";
import { useBoard } from "../queries";
import { boardContext, boardValues, makeRenderer, readLayout } from "./engine";
import { DocThumb } from "./stage";

/**
 * A poster design as a guest would get it, drawn by the board's own builder
 * with the sample guest and their drawn photo: a variant's layout for one
 * format (what the chain resolves to when the variant has none). For the
 * Posters page's "what guests will see".
 */
export const PosterThumb = ({
  eventId,
  variant = "default",
  format,
  width,
  values,
  className,
}: {
  eventId: number;
  variant?: string;
  format: PosterFormat;
  /** Drawn this wide; the height follows the format. */
  width: number;
  /** Values over the sample guest's (the moment's phrase being written, say). */
  values?: Readonly<Record<string, string>>;
  className?: string;
}) => {
  const spec = POSTER_FORMAT_SPECS[format];
  const height = Math.round((width * spec.height) / spec.width);
  const q = useBoard({ kind: "event", eventId }, "poster", "event_default", { variant, format, label: "" });
  const d = q.data;
  const look = React.useMemo(() => {
    if (!d) return null;
    try {
      const layout = readLayout(d.layout);
      const renderer = makeRenderer(
        { page: layout.page, canvas: layout.canvas, vars: layout.vars },
        { ...boardValues(d, "poster"), ...(values ?? {}) },
        boardContext(d, DESIGNERS.poster.sampleQr, {}, true),
        "poster"
      );
      return { layout, renderer };
    } catch {
      return null;
    }
  }, [d, values]);
  if (q.isPending) return <Skeleton className={className} style={{ width, height }} />;
  if (!look)
    return (
      <span className={className} style={{ width, height }}>
        <span className="bg-sunken text-ink-3 grid size-full place-items-center rounded-[var(--radius-md)]">
          <ImageIcon className="size-6" aria-hidden="true" />
        </span>
      </span>
    );
  return <DocThumb layout={look.layout} renderer={look.renderer} width={width} height={height} className={className} />;
};
