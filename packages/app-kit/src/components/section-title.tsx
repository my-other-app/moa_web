import type * as React from "react";
import { cn } from "@moa/ui";

/**
 * Section heading inside a page: 15px medium, sentence case, the same voice
 * as the v2 panel titles. It was Bebas Neue uppercase at 24px from the design
 * file, which read as a different product beside the Nocturne panels.
 *
 * Shared rather than local so admin and clubs keep one rhythm.
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
      <h2 className="m-0 text-[15px] leading-none font-medium">{children}</h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
