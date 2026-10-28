"use client";

/* eslint-disable @next/next/no-img-element -- these draw the API's pictures as they are, already sized by the API */

import * as React from "react";
import { cn } from "@moa/ui";

import { initials } from "../format";
import { isSquareEnough } from "../picture-specs";

/**
 * The three frames every dashboard draws a club picture in (picture-specs).
 *
 * - PosterFrame: 4:5. The poster is never cropped: it is drawn whole, over
 *   a soft blurred copy of itself that fills the rest of the frame. A 4:5
 *   poster covers its copy entirely.
 * - LogoTile: a square. A square logo fills it; any other (a wide
 *   wordmark) is drawn whole with room around it. The tile is white behind
 *   a logo in both themes, so a see-through logo made for white stays seen.
 * - BannerFrame: 3:1, the banner filling it.
 */

/** Calls back with a picture's own size once it has loaded (or was already). */
function useNatural(src: string | null | undefined, onSize?: (width: number, height: number) => void) {
  const [size, setSize] = React.useState<{ src: string; width: number; height: number } | null>(null);
  const report = React.useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !src || !img.complete || !img.naturalWidth || !img.naturalHeight) return;
      setSize((prev) => (prev && prev.src === src && prev.width === img.naturalWidth && prev.height === img.naturalHeight ? prev : { src, width: img.naturalWidth, height: img.naturalHeight }));
    },
    [src],
  );
  const natural = size && size.src === src ? size : null;
  // Told once per picture, not on every render.
  const told = React.useRef(onSize);
  React.useLayoutEffect(() => {
    told.current = onSize;
  });
  React.useEffect(() => {
    if (natural) told.current?.(natural.width, natural.height);
  }, [natural]);
  return { natural, report };
}

export interface PosterFrameProps {
  src: string | null | undefined;
  alt?: string;
  /** The frame's width in px when it is fixed; under 100 the backdrop's blur is smaller. */
  width?: number;
  /** Size, corners, border: the frame is always 4:5. */
  className?: string;
  /** Shown when there is no poster, or it failed to load. */
  fallback?: React.ReactNode;
  /** Drawn over the frame either way (a tag, a date, a spinner). */
  children?: React.ReactNode;
  /** The poster's own size, once it has loaded. */
  onSize?: (width: number, height: number) => void;
  loading?: "lazy" | "eager";
}

export function PosterFrame({ src, alt = "", width, className, fallback = null, children, onSize, loading = "lazy" }: PosterFrameProps) {
  const [failed, setFailed] = React.useState<string | null>(null);
  const { report } = useNatural(src, onSize);
  const shown = src && failed !== src ? src : null;
  const small = width !== undefined && width < 100;
  return (
    <div data-frame="poster" className={cn("bg-sunken relative isolate aspect-[4/5] shrink-0 overflow-hidden", className)}>
      {shown ? (
        <>
          <img
            src={shown}
            alt=""
            aria-hidden="true"
            loading={loading}
            decoding="async"
            data-part="backdrop"
            className={cn("pointer-events-none absolute inset-0 size-full scale-[1.15] object-cover brightness-[.94] saturate-[1.1]", small ? "blur-[8px]" : "blur-[20px]")}
          />
          <img
            ref={report}
            src={shown}
            alt={alt}
            loading={loading}
            decoding="async"
            data-part="poster"
            className="absolute inset-0 size-full object-contain"
            onLoad={(e) => report(e.currentTarget)}
            onError={() => setFailed(shown)}
          />
        </>
      ) : (
        fallback
      )}
      {children}
    </div>
  );
}

export interface LogoTileProps {
  src: string | null | undefined;
  /** Whose logo: their initials stand in when there is none. */
  name?: string | null;
  alt?: string;
  /** A rounded square (the default) or a circle; the padding around a wide logo suits each. */
  shape?: "rounded" | "circle";
  /** Size and corners, e.g. `size-16 rounded-xl`. */
  className?: string;
  /** What stands in without a logo; the initials by default. */
  fallback?: React.ReactNode;
  /** On the tile when it shows the initials. */
  fallbackClassName?: string;
  /** Drawn over the tile either way (a spinner). */
  children?: React.ReactNode;
  /**
   * A hairline round the white tile, so it reads as a tile on a white card.
   * Off where the tile already has a border of its own.
   */
  outline?: boolean;
}

export function LogoTile({ src, name, alt = "", shape = "rounded", className, fallback, fallbackClassName, children, outline = true }: LogoTileProps) {
  const [failed, setFailed] = React.useState<string | null>(null);
  const { natural, report } = useNatural(src);
  const shown = src && failed !== src ? src : null;
  const fit = natural ? (isSquareEnough(natural.width, natural.height) ? "fill" : "whole") : null;
  return (
    <span
      data-frame="logo"
      data-fit={shown ? (fit ?? "pending") : "none"}
      className={cn(
        "relative isolate inline-grid aspect-square shrink-0 place-items-center overflow-hidden",
        shape === "circle" ? "rounded-full" : "rounded-xl",
        shown ? "bg-white" : cn("bg-sunken text-ink-2 font-semibold", fallbackClassName),
        className,
      )}
    >
      {shown ? (
        <img
          key={shown}
          ref={report}
          src={shown}
          alt={alt}
          decoding="async"
          className={cn(
            "absolute inset-0 size-full",
            fit === "whole" ? cn("object-contain", shape === "circle" ? "p-[16%]" : "p-[10%]") : "object-cover",
            // Not drawn until its shape is known, so a wordmark never shows cropped first.
            fit ? "opacity-100" : "opacity-0",
          )}
          onLoad={(e) => report(e.currentTarget)}
          onError={() => setFailed(shown)}
        />
      ) : (
        (fallback ?? <span aria-hidden="true">{initials(name ?? "")}</span>)
      )}
      {shown && outline ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/[0.08] ring-inset" /> : null}
      {children}
    </span>
  );
}

export interface BannerFrameProps {
  src: string | null | undefined;
  alt?: string;
  /** Width, corners; the frame is always 3:1. */
  className?: string;
  style?: React.CSSProperties;
  /** Shown when there is no banner, or it failed to load. */
  fallback?: React.ReactNode;
  /** Drawn over the frame either way (the replace button). */
  children?: React.ReactNode;
  loading?: "lazy" | "eager";
}

export function BannerFrame({ src, alt = "", className, style, fallback = null, children, loading = "lazy" }: BannerFrameProps) {
  const [failed, setFailed] = React.useState<string | null>(null);
  const shown = src && failed !== src ? src : null;
  return (
    <div data-frame="banner" className={cn("relative isolate aspect-[3/1] w-full overflow-hidden", className)} style={style}>
      {shown ? (
        <img src={shown} alt={alt} loading={loading} decoding="async" className="absolute inset-0 size-full object-cover" onError={() => setFailed(shown)} />
      ) : (
        fallback
      )}
      {children}
    </div>
  );
}
