import * as React from "react";

import { cn } from "../lib/cn";
import { Badge } from "./badge";

export type StatusTone = "default" | "success" | "warning" | "destructive" | "info";

const toneClasses: Record<StatusTone, string> = {
  default: "bg-secondary text-secondary-foreground border-transparent",
  success:
    "bg-emerald-100 text-emerald-700 border-transparent dark:bg-emerald-900/40 dark:text-emerald-300",
  warning:
    "bg-amber-100 text-amber-700 border-transparent dark:bg-amber-900/40 dark:text-amber-300",
  destructive:
    "bg-red-100 text-red-700 border-transparent dark:bg-red-900/40 dark:text-red-300",
  info: "bg-blue-100 text-blue-700 border-transparent dark:bg-blue-900/40 dark:text-blue-300",
};

export interface StatusBadgeProps {
  label: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}

function StatusBadge({ label, tone = "default", className }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(toneClasses[tone], className)}>
      {label}
    </Badge>
  );
}

export { StatusBadge };
