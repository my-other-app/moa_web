import type * as React from "react";
import { cn } from "@moa/ui";

/**
 * Standard page heading. Exists so every page's title, description and action
 * sit at identical positions -- inconsistent headers are the fastest way for a
 * dashboard to feel assembled rather than designed.
 */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 mb-6 flex flex-col gap-3 duration-300 sm:flex-row sm:items-start sm:justify-between motion-reduce:animate-none",
        className
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground text-sm text-pretty">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </div>
  );
}
