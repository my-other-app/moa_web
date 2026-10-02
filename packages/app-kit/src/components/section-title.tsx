import type * as React from "react";
import { cn } from "@moa/ui";

/**
 * Section heading inside a page: Bebas Neue, uppercase, 24px (design nodes
 * 368:299 / 368:372 / 368:392). One step down from `PageHeader`'s 48px title.
 *
 * Shared rather than local so admin and clubs use the same rhythm -- a page
 * that mixes a Bebas title with semibold sans section headings is the exact
 * drift that made the first build look like stock shadcn.
 */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <h2 className="bebas text-2xl leading-none tracking-wide uppercase">
        {children}
      </h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
