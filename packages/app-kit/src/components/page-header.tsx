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
        {/*
         * Bebas Neue, uppercase, 48px — the page-title treatment from the
         * design (node 3:807). Shared by both apps so admin inherits the same
         * language rather than drifting back to a generic dashboard heading.
         */}
        <h1 className="bebas text-[40px] leading-none tracking-wide uppercase sm:text-[48px]">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground text-sm text-pretty">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </div>
  );
}
