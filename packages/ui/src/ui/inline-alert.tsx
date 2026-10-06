import * as React from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  XIcon,
} from "lucide-react";

import { cn } from "../lib/cn";

/**
 * A short notice placed next to the thing it is about.
 *
 * Deliberately not a toast: these describe a standing condition ("5 clubs are
 * waiting for approval"), which is still true after a toast would have faded,
 * and which the reader needs while looking at the panel it belongs to.
 */
export type AlertTone = "info" | "warning" | "success" | "destructive";

/*
 * Derived from the product's own swatches rather than Tailwind's ramps.
 *
 * The generic amber tints rendered as a muddy tan beside the brand teal, with
 * the body text too close to its own background to read comfortably. These
 * are explicit so the result is the same everywhere, and they are tints of
 * the palette the rest of the product already uses.
 */
const toneClasses: Record<AlertTone, string> = {
  info: "border-[#cfe6f5] bg-[#f0f8fd] text-[#0b4f70] dark:border-[#1d3a4d] dark:bg-[#0e2230] dark:text-[#bfe2f5]",
  warning:
    "border-[#f6dca5] bg-[#fff8e8] text-[#6b4e07] dark:border-[#4a3a12] dark:bg-[#2a2210] dark:text-[#f8dfa5]",
  success:
    "border-[#c6e8cf] bg-[#effaf2] text-[#096b5c] dark:border-[#16302c] dark:bg-[#0f2420] dark:text-[#b4e5bc]",
  destructive:
    "border-[#f6c9c6] bg-[#fdefee] text-[#8c1c17] dark:border-[#4a1d1a] dark:bg-[#2b1312] dark:text-[#f3aba7]",
};

const toneIcons: Record<AlertTone, React.ComponentType<{ className?: string }>> = {
  info: InfoIcon,
  warning: AlertTriangleIcon,
  success: CheckCircle2Icon,
  destructive: AlertTriangleIcon,
};

export interface InlineAlertProps {
  tone?: AlertTone;
  title?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

function InlineAlert({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
  className,
}: InlineAlertProps) {
  const Icon = toneIcons[tone];

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-3.5 text-[13px] leading-relaxed",
        toneClasses[tone],
        className
      )}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded opacity-60 transition-opacity hover:opacity-100"
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export { InlineAlert };
