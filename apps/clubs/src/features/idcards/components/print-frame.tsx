"use client";

import * as React from "react";
import { toast } from "@moa/ui";

import { fetchPdf } from "../api";

/** How long a blob a fallback tab opened is kept, so that tab can finish reading it. */
const OPENED_KEEP_MS = 60_000;

/**
 * Prints a PDF without leaving the page: the card is fetched, loaded in a
 * hidden frame as a blob, and the print dialog opens on it.
 *
 * Fetched rather than framed by its URL so a door key or a kiosk token goes
 * in a header (`headers`), never in the query string, where it lands in
 * every access log between the phone and the API. A blob of our own is same
 * origin, so the frame's window is ours to call; the blob URL is revoked
 * when the frame goes. A refusal (a reprint the rules do not allow, a key
 * switched off) is said in a toast rather than printed as a page of JSON.
 */
export function PrintFrame({
  url,
  headers,
  onDone,
  onError,
}: {
  url: string;
  headers?: Record<string, string>;
  onDone?: () => void;
  /** Told when the PDF could not be fetched; a toast says so when this is absent. */
  onError?: (error: unknown) => void;
}) {
  const ref = React.useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = React.useState<string | null>(null);
  // The callbacks change on every render of the caller; the fetch must not.
  const done = React.useRef(onDone);
  const failed = React.useRef(onError);
  React.useEffect(() => {
    done.current = onDone;
    failed.current = onError;
  });
  const opened = React.useRef(false);
  const headerKey = JSON.stringify(headers ?? {});

  React.useEffect(() => {
    let alive = true;
    let made: string | null = null;
    fetchPdf(url, JSON.parse(headerKey) as Record<string, string>)
      .then((blob) => {
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setSrc(made);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        if (failed.current) failed.current(error);
        else toast.error(error instanceof Error && error.message ? error.message : "The card could not be printed.");
        done.current?.();
      });
    return () => {
      alive = false;
      if (!made) return;
      const blobUrl = made;
      // A tab the fallback opened may still be reading it: let it finish first.
      if (opened.current) setTimeout(() => URL.revokeObjectURL(blobUrl), OPENED_KEEP_MS);
      else URL.revokeObjectURL(blobUrl);
    };
  }, [url, headerKey]);

  if (!src) return null;
  return (
    <iframe
      ref={ref}
      title="Print"
      src={src}
      aria-hidden
      className="absolute h-px w-px opacity-0"
      onLoad={() => {
        try {
          const w = ref.current?.contentWindow;
          w?.focus();
          w?.print();
        } catch {
          // A blocked print dialog leaves the card where a tap can open it.
          opened.current = true;
          window.open(src, "_blank", "noopener");
        }
        done.current?.();
      }}
    />
  );
}

/** Opens a PDF in a new tab, for a batch or a card someone wants to look at first. */
export const openPdf = (url: string) => window.open(url, "_blank", "noopener");
