"use client";

import * as React from "react";
import QRCode from "qrcode";
import { CheckIcon, CopyIcon, SmartphoneIcon } from "lucide-react";
import { cn, toast } from "@moa/ui";

/** Blank modules round the code. The QR spec asks for four; fewer and some phone cameras miss it. */
const QUIET_ZONE = 4;
/** Drawn size in CSS pixels, quiet zone included. */
const DRAWN_PX = 200;

/**
 * The code as one SVG path, each run of dark modules in a row a single
 * rectangle, inside a quiet zone. Built here from the link itself with the
 * `qrcode` library: the link holds the account's secret, so it is never sent
 * to a QR service or anywhere else to be drawn.
 */
function drawQr(text: string): { size: number; path: string } | null {
  let qr: ReturnType<typeof QRCode.create>;
  try {
    qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  } catch {
    // Only for a link too long for any QR code, which the server never sends.
    return null;
  }
  const { modules } = qr;
  const n = modules.size;
  const parts: string[] = [];
  for (let row = 0; row < n; row++) {
    let col = 0;
    while (col < n) {
      if (!modules.get(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < n && modules.get(row, col)) col++;
      const run = col - start;
      parts.push(`M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${run}v1h-${run}z`);
    }
  }
  return { size: n + QUIET_ZONE * 2, path: parts.join("") };
}

/** "JBSWY3DPEHPK3PXP" as "JBSW Y3DP EHPK 3PXP": blocks of four are easier to read across and type in. */
export function groupKey(secret: string): string {
  return secret.replace(/\s+/g, "").match(/.{1,4}/g)?.join(" ") ?? "";
}

function AuthenticatorQr({ uri }: { uri: string }) {
  const drawing = React.useMemo(() => drawQr(uri), [uri]);
  if (!drawing) {
    return (
      <p className="text-ink-2 m-0 text-[13px]">
        This code could not be drawn. Use the key below instead.
      </p>
    );
  }
  return (
    // Always black on white, in the dark theme too: plenty of scanners cannot
    // read a light-on-dark code. The white tile is the quiet zone; in the
    // light theme a hairline keeps it from melting into a white card.
    <div className="border-line w-fit overflow-hidden rounded-xl border bg-white dark:border-transparent">
      <svg
        role="img"
        aria-label="QR code for your authenticator app"
        viewBox={`0 0 ${drawing.size} ${drawing.size}`}
        width={DRAWN_PX}
        height={DRAWN_PX}
        shapeRendering="crispEdges"
        className="block"
      >
        <rect width={drawing.size} height={drawing.size} fill="#ffffff" />
        <path d={drawing.path} fill="#000000" />
      </svg>
    </div>
  );
}

export interface AuthenticatorSetupProps {
  /** The `otpauth://totp/...` link from POST /auth/2fa/setup. It carries the secret: never log it or send it anywhere. */
  uri: string;
  /** The same secret on its own (base32), for typing in by hand. */
  secret: string;
  className?: string;
}

/**
 * The scan step of two-factor setup, shared by both dashboards: the link as
 * a QR code, what to do with it, and for anyone who cannot scan (setting up
 * on the phone itself, or a camera that will not focus) the key to type in
 * and the link to open. The code field and the confirm button stay with each
 * dashboard's own panel.
 */
export function AuthenticatorSetup({ uri, secret, className }: AuthenticatorSetupProps) {
  const id = React.useId();
  const key = secret.replace(/\s+/g, "");
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      // The key without the spaces: some apps refuse them when pasted.
      await navigator.clipboard.writeText(key);
    } catch {
      toast.error("Couldn't copy the key. Select it and copy it instead.");
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <AuthenticatorQr uri={uri} />
      <p className="text-ink-2 m-0 max-w-[46ch] text-[13px] leading-[1.5] text-pretty">
        Scan this with Google Authenticator, Microsoft Authenticator, 1Password or any authenticator app, then
        enter the 6-digit code it shows.
      </p>
      <div role="group" aria-labelledby={`${id}-cant-scan`} className="bg-sunken flex flex-col gap-2 rounded-xl p-3">
        <p id={`${id}-cant-scan`} className="text-ink m-0 text-[13px] font-medium">
          Can&apos;t scan?
        </p>
        <p className="text-ink-3 m-0 text-[12.5px]">
          Type this key into the app instead. The spaces are only there to make it easier to read.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-ink font-mono text-[14px] tracking-[0.06em] break-all">{groupKey(key)}</code>
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => void copy()}>
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {copied ? "Copied" : "Copy key"}
          </button>
          <span className="sr-only" aria-live="polite">
            {copied ? "Key copied" : ""}
          </span>
        </div>
        <p className="text-ink-3 m-0 text-[12.5px]">
          Setting up on this phone?{" "}
          <a
            href={uri}
            className="text-brand inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
          >
            <SmartphoneIcon className="size-3.5" aria-hidden="true" />
            Open in authenticator app
          </a>
        </p>
      </div>
    </div>
  );
}
