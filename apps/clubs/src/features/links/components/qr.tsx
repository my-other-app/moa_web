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
export function useQr(url: string | null, width: number) {
  const [png, setPng] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width, errorCorrectionLevel: "M" })
      .then((data) => alive && setPng(data))
      .catch(() => alive && setPng(null));
    return () => {
      alive = false;
    };
  }, [url, width]);
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
