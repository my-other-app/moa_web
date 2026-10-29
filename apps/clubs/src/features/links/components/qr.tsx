"use client";

import * as React from "react";
import QRCode from "qrcode";
import { DownloadIcon } from "lucide-react";
import { cn } from "@moa/ui";

/**
 * The short link as a QR code, for a poster or a slide. Drawn in the
 * browser from the URL itself, so nothing is fetched; the download is the
 * same picture at print size.
 */

/** How much of the code can be damaged (or covered) and still read: L 7% · M 15% · Q 25% · H 30%. */
export type QrLevel = "L" | "M" | "Q" | "H";

export interface QrOptions {
  /**
   * The error correction. "M" for a link on a card; "H" for a code that has
   * to survive a projector, a phone camera at the back of a hall and
   * somebody's head in the way (features/live's join QR).
   */
  level?: QrLevel;
  /** The quiet zone in modules. Four is the spec's minimum and what a camera needs from across a room. */
  margin?: number;
}

export function useQr(url: string | null, width: number, { level = "M", margin = 1 }: QrOptions = {}) {
  const [png, setPng] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toDataURL(url, { margin, width, errorCorrectionLevel: level })
      .then((data) => alive && setPng(data))
      .catch(() => alive && setPng(null));
    return () => {
      alive = false;
    };
  }, [url, width, level, margin]);
  return png;
}

export function Qr({
  url,
  code,
  size = 112,
  className,
}: {
  url: string;
  code: string;
  size?: number;
  className?: string;
}) {
  const shown = useQr(url, size * 2);
  const print = useQr(url, 1024);
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shown}
          alt={`QR code for ${url}`}
          width={size}
          height={size}
          className="rounded-lg bg-white p-1"
        />
      ) : (
        <span
          className="bg-sunken block rounded-lg"
          style={{ width: size, height: size }}
          aria-hidden="true"
        />
      )}
      <a
        href={print ?? undefined}
        download={`${code}-qr.png`}
        aria-disabled={!print}
        className={cn(
          "btn btn-secondary btn-sm",
          !print && "pointer-events-none opacity-50",
        )}
      >
        <DownloadIcon className="size-3.5" /> QR for print
      </a>
    </div>
  );
}
