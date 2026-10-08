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
         * Inter at 32px, sentence case, tightened tracking — the v2 page
         * title. It was Bebas Neue at 48px uppercase, the treatment from the
         * original design file (node 3:807), which is a different design
         * language from everything around it now: v2 sets hierarchy with size
         * and space and never bolds past 500.
         *
         * Changing it here rather than per page is the point of the
         * component: the screens that already hand-roll a v2 heading match
         * this, and every page still using PageHeader comes along with it.
         */}
        <h1 className="m-0 text-[28px] leading-[1.12] tracking-[-0.015em] sm:text-[32px]">
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
