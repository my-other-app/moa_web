"use client";

import * as React from "react";
import { CheckIcon, CircleCheckIcon, CircleXIcon, CloudUploadIcon, TriangleAlertIcon } from "lucide-react";
import { RollingNumber, buttonVariants, cn } from "@moa/ui";

/**
 * The door's vocabulary, shared by the gate console, the kiosk and the phone
 * check-in. These screens are read at arm's length in a busy entrance, so
 * everything here is a size up from the dashboard: 44px touch targets (the
 * `btn-lg` size), 16px fields so a phone never zooms, verdicts painted in a
 * solid tone. Every colour is a Meridian token; nothing here is restyled per
 * screen.
 */

export type DoorTone = "admit" | "caution" | "refuse" | "info";

/** A tinted surface in a tone: its line, its soft ground, its ink. */
export const TONE_SOFT: Record<DoorTone, string> = {
  admit: "border-admit-line bg-admit-soft text-admit",
  caution: "border-caution-line bg-caution-soft text-caution",
  refuse: "border-refuse-line bg-refuse-soft text-refuse",
  info: "border-info-line bg-info-soft text-info",
};

/** The tone as a solid fill: the verdict a volunteer reads from two metres. */
export const TONE_SOLID: Record<DoorTone, string> = {
  admit: "bg-admit text-surface",
  caution: "bg-caution text-surface",
  refuse: "bg-refuse text-surface",
  info: "bg-info text-surface",
};

export const TONE_LINE: Record<DoorTone, string> = {
  admit: "border-admit-line",
  caution: "border-caution-line",
  refuse: "border-refuse-line",
  info: "border-info-line",
};

export const TONE_TEXT: Record<DoorTone, string> = {
  admit: "text-admit",
  caution: "text-caution",
  refuse: "text-refuse",
  info: "text-info",
};

/** One icon per tone, so the shape says the verdict before the words do. */
export const TONE_ICON: Record<DoorTone, React.ComponentType<{ className?: string }>> = {
  admit: CircleCheckIcon,
  caution: TriangleAlertIcon,
  refuse: CircleXIcon,
  info: CloudUploadIcon,
};

const RRGGBB = /^#[0-9a-f]{6}$/i;
const linear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: number[]) => 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!);
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/**
 * An event's own colour as the brand of a screen on Meridian's dark scale
 * (the kiosk, the phone check-in). Set on the screen's root, it overrides
 * the variables every kit class reads: `--brand` for fills, text and the
 * focus ring; `--brand-soft` and `--brand-line` for the tints;
 * `--brand-foreground` for text on a brand fill. The admit, caution and
 * refuse tones are untouched — a verdict never takes the club's colour.
 *
 * A colour too deep to read as text on the dark canvas is lifted toward
 * white until it does (about 3:1), and the text on a fill is whichever of
 * the dark canvas or the light ink contrasts more with it. Anything that is
 * not a `#rrggbb` leaves Meridian's own brand in place.
 */
export function brandOnDark(color: string | null | undefined): React.CSSProperties | undefined {
  if (!color || !RRGGBB.test(color)) return undefined;
  let rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  let lifted = false;
  for (let step = 0; luminance(rgb) < 0.12 && step < 12; step++) {
    rgb = rgb.map((c) => c + (255 - c) * 0.15);
    lifted = true;
  }
  const brand = lifted ? toHex(rgb) : color.toLowerCase();
  const l = luminance(rgb);
  const darkText = (l + 0.05) / 0.05 >= 1.05 / (l + 0.05);
  return {
    "--brand": brand,
    "--brand-soft": `color-mix(in srgb, ${brand} 16%, transparent)`,
    "--brand-line": `color-mix(in srgb, ${brand} 40%, transparent)`,
    "--brand-foreground": darkText ? "var(--canvas)" : "var(--ink)",
  } as React.CSSProperties;
}

/** The field at the door: the kit's field at the touch height, 16px so a phone does not zoom on focus. */
export const DOOR_FIELD = "input h-11 text-[16px]";
/** A field's label at the door. */
export const DOOR_LABEL = "text-ink-2 mb-1.5 block text-[13px] font-medium";

/**
 * An icon-only button at the touch size. `IconButton` stops at 36px, which
 * is right for a dashboard row and too small for a thumb in a queue; this is
 * the same `.btn` control at `btn-lg`, square and round.
 */
export function DoorIconButton({
  label,
  variant = "secondary",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "children"> & {
  label: string;
  variant?: "secondary" | "ghost" | "quiet";
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={label} className={cn(buttonVariants({ variant, size: "icon-lg", round: true }), className)} {...props}>
      {children}
    </button>
  );
}

/** One of a few exclusive choices at touch height: a door, a role. Put several in a `role="radiogroup"`. */
export function TouchChoice({ checked, onClick, children, aside, role = "radio" }: { checked: boolean; onClick: () => void; children: React.ReactNode; aside?: React.ReactNode; role?: "radio" | "checkbox" }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-field)] border px-4 text-[14px] font-medium transition-colors",
        checked ? "border-brand-line bg-brand-soft text-ink" : "border-line bg-surface text-ink-2 hover:bg-sunken"
      )}
    >
      {checked ? <CheckIcon aria-hidden="true" className="text-brand size-4" /> : null}
      {children}
      {aside}
    </button>
  );
}

/** A strip across the screen for a standing condition: offline, syncing, the door shut. */
export function DoorBanner({ tone, icon, title, children, action, className }: { tone: DoorTone; icon: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("flex items-start gap-3 border px-4 py-3", TONE_SOFT[tone], className)}>
      <span aria-hidden="true" className="mt-px shrink-0 [&>svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-[13.5px] leading-[1.5]">
        <p className="font-semibold">{title}</p>
        {children ? <div className="text-ink-2 mt-0.5">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Who is in, of how many expected: the figure every door screen keeps in view. */
export function DoorCount({ checkedIn, registered, size = "md", className }: { checkedIn: number; registered: number; size?: "md" | "lg"; className?: string }) {
  return (
    <div className={cn("shrink-0 text-right", className)}>
      <p className="eyebrow">Checked in</p>
      <p className="mt-1 font-mono leading-none tabular-nums">
        <RollingNumber value={checkedIn} className={cn("text-ink font-medium tracking-[-0.03em]", size === "lg" ? "text-[34px]" : "text-[28px]")} />
        <span className={cn("text-ink-3", size === "lg" ? "text-[16px]" : "text-[14px]")}> / {registered}</span>
      </p>
    </div>
  );
}

/** The same figure as a bar, edge to edge under a header. */
export function DoorProgress({ checkedIn, registered, className }: { checkedIn: number; registered: number; className?: string }) {
  const pct = registered > 0 ? Math.min(100, Math.round((checkedIn / registered) * 100)) : 0;
  return (
    <div role="progressbar" aria-label={`${checkedIn} of ${registered} checked in`} aria-valuenow={checkedIn} aria-valuemin={0} aria-valuemax={registered} className={cn("bg-sunken h-1 w-full overflow-hidden", className)}>
      <div style={{ width: `${pct}%` }} className="bg-admit h-full transition-[width] duration-500 ease-out motion-reduce:transition-none" />
    </div>
  );
}

/** A small spinner in the current colour, for "checking", "registering", "opening". */
export function DoorSpinner({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none", className)} />;
}

const CORNERS = [
  "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-lg",
  "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-lg",
  "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-lg",
  "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-lg",
];

/**
 * The camera, always on the dark scale whatever the page is: a lit
 * viewfinder on a pale page reads as a hole. The video element is always
 * mounted (hidden while off) because the scanner is handed it the moment
 * the camera starts. While on, a frame marks where the QR goes and the rest
 * of the picture is dimmed.
 */
export function CameraWell({
  videoRef,
  on,
  frame = 58,
  className,
  style,
  children,
}: {
  videoRef: React.Ref<HTMLVideoElement>;
  on: boolean;
  /** The frame's width as a percentage of the well. */
  frame?: number;
  className?: string;
  /** The screen's brand variables (`brandOnDark`), which the well's own `.dark` would otherwise reset. */
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <div style={style} className={cn("dark bg-canvas text-ink ring-line relative flex items-center justify-center overflow-hidden rounded-[var(--radius-panel)] ring-1", className)}>
      <video ref={videoRef} playsInline muted className={on ? "absolute inset-0 size-full object-cover" : "hidden"} />
      {on ? (
        <div
          aria-hidden="true"
          style={{ width: `${frame}%`, boxShadow: "0 0 0 9999px color-mix(in srgb, var(--canvas) 55%, transparent)" }}
          className="absolute top-1/2 left-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-lg"
        >
          {CORNERS.map((c) => (
            <span key={c} className={cn("border-ink absolute size-[26px]", c)} />
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}
