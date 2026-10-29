"use client";

import * as React from "react";
import { DownloadIcon } from "lucide-react";
import { cn } from "@moa/ui";

import { useQr } from "@/features/links";

/**
 * The way into the room for everyone without the app: a QR of the event's
 * live page, with the address printed under it for anyone whose camera has
 * given up.
 *
 * It goes on a projector in a hall, so it is drawn to be read from the back
 * row:
 *
 *  - black on a white card of its own, whatever the room's theme — a QR
 *    inverted or tinted is a QR that half the phones refuse;
 *  - error correction H, so a head, a lens flare or a crease still scans;
 *  - a four-module quiet zone, which is the spec's minimum and the thing
 *    most screens get wrong;
 *  - rendered from a picture three times the drawn size, so a 2× or 4×
 *    projector does not resample the modules into mush.
 *
 * The same picture at 2048 px is the download, for a poster by the door.
 */
export function JoinQr({
  url,
  /** The human-readable address under the picture: what somebody types instead of scanning. */
  address,
  size,
  /** A download of the same code at print size. Off on the projector itself. */
  printable = false,
  filename = "join-qr",
  className,
  label = "Scan to join",
}: {
  url: string;
  address: string;
  size: number;
  printable?: boolean;
  filename?: string;
  className?: string;
  label?: string;
}) {
  // H and a four-module quiet zone: see the note above. The drawn picture is
  // 3× the box so the modules stay square on a projector.
  const shown = useQr(url, size * 3, { level: "H", margin: 4 });
  const print = useQr(printable ? url : null, 2048, { level: "H", margin: 4 });
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div
        className="rounded-[20px] bg-white p-3 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.6)]"
        style={{ width: size + 24, height: size + 24 }}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt={`QR code to join the live room at ${address}`}
            width={size}
            height={size}
            // Nearest-neighbour: a QR scaled smoothly loses the hard edge between modules.
            style={{ width: size, height: size, imageRendering: "pixelated" }}
          />
        ) : (
          <span
            className="block animate-pulse rounded-lg bg-neutral-200"
            style={{ width: size, height: size }}
            aria-hidden="true"
          />
        )}
      </div>
      <p className="grid justify-items-center gap-1 text-center">
        <span
          className="text-ink-3 font-mono font-semibold tracking-[0.14em] uppercase"
          style={{ fontSize: Math.max(10, Math.round(size * 0.032)) }}
        >
          {label}
        </span>
        {/*
          Sized to come out about as wide as the card, so the code and its
          address read as one object. Never wrapped: an address broken across
          two lines is one somebody mistypes.
        */}
        <span
          className="text-ink font-mono font-semibold tracking-[-0.01em] whitespace-nowrap"
          style={{ fontSize: Math.max(13, Math.round(size * 0.046)) }}
        >
          {address}
        </span>
      </p>
      {printable ? (
        <a
          href={print ?? undefined}
          download={`${filename}.png`}
          aria-disabled={!print}
          className={cn("btn btn-secondary btn-sm", !print && "pointer-events-none opacity-50")}
        >
          <DownloadIcon className="size-3.5" /> QR for print
        </a>
      ) : null}
    </div>
  );
}
