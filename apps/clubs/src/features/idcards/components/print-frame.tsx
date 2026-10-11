"use client";

import * as React from "react";

/**
 * Prints a PDF without leaving the page: the card loads in a hidden frame
 * and the print dialog opens on it. Same origin through the gateway, so
 * the frame's window is ours to call.
 */
export function PrintFrame({ url, onDone }: { url: string; onDone?: () => void }) {
  const ref = React.useRef<HTMLIFrameElement>(null);
  return (
    <iframe
      ref={ref}
      title="Print"
      src={url}
      aria-hidden
      className="absolute h-px w-px opacity-0"
      onLoad={() => {
        try {
          const w = ref.current?.contentWindow;
          w?.focus();
          w?.print();
        } catch {
          // A blocked print dialog leaves the card where a tap can open it.
          window.open(url, "_blank", "noopener");
        }
        onDone?.();
      }}
    />
  );
}

/** Opens a PDF in a new tab, for a batch or a card someone wants to look at first. */
export const openPdf = (url: string) => window.open(url, "_blank", "noopener");
