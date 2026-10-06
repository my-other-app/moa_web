import * as React from "react";

import { cn } from "../lib/cn";
import { Badge } from "./badge";

export type StatusTone = "default" | "success" | "warning" | "destructive" | "info";

/*
 * Explicit tints from the product palette. The Tailwind ramps gave a warning
 * badge too little separation from its own text -- "In 2 days" was amber on
 * amber and effectively unreadable at 12px.
 */
const toneClasses: Record<StatusTone, string> = {
  default: "bg-secondary text-secondary-foreground border-transparent",
  success:
    "bg-[#e3f5e8] text-[#096b5c] border-transparent dark:bg-[#12302a] dark:text-[#b4e5bc]",
  warning:
    "bg-[#fdf0d2] text-[#6b4e07] border-transparent dark:bg-[#33280f] dark:text-[#f8dfa5]",
  destructive:
    "bg-[#fde3e1] text-[#8c1c17] border-transparent dark:bg-[#381917] dark:text-[#f3aba7]",
  info: "bg-[#e2f0fa] text-[#0b4f70] border-transparent dark:bg-[#12293a] dark:text-[#bfe2f5]",
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
