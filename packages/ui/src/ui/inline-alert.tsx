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

const toneClasses: Record<AlertTone, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100",
  warning:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100",
  destructive:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100",
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
        "flex items-start gap-2.5 rounded-lg border p-3 text-xs",
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
