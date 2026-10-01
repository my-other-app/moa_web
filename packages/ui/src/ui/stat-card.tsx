import * as React from "react";

import { cn } from "../lib/cn";

export type StatCardTone = "default" | "success" | "warning" | "destructive" | "info";

const toneTextClasses: Record<StatCardTone, string> = {
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  destructive: "text-destructive",
  info: "text-blue-600 dark:text-blue-400",
};

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  caption?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatCardTone;
  layout?: "row" | "column";
  className?: string;
}

function StatCard({
  label,
  value,
  caption,
  icon,
  tone = "default",
  layout = "column",
  className,
}: StatCardProps) {
  if (layout === "row") {
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-lg border bg-card p-4",
          className
        )}
      >
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold font-mono">{value}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-[110px] flex-col justify-between rounded-xl border bg-card p-4 shadow-sm",
        className
      )}
    >
      <div className={cn("flex items-center gap-2", toneTextClasses[tone])}>
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {caption ? (
          <p className="text-xs text-muted-foreground">{caption}</p>
        ) : null}
      </div>
    </div>
  );
}

export { StatCard };
