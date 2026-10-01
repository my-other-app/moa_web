import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/cn";

const emptyStateVariants = cva(
  "flex flex-col items-center justify-center text-center animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none",
  {
    variants: {
      size: {
        sm: "gap-2 px-4 py-8",
        default: "gap-3 px-6 py-14",
        lg: "gap-4 px-8 py-20",
      },
      tone: {
        default: "",
        muted: "bg-muted/40 rounded-lg border border-dashed",
      },
    },
    defaultVariants: { size: "default", tone: "default" },
  }
);

export interface EmptyStateProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof emptyStateVariants> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * Shown when a list has no rows. Distinguishing "nothing here yet" from
 * "nothing matched your filter" is the caller's job via `title`/`description`,
 * because the two need very different actions from the user.
 */
function EmptyState({
  className,
  size,
  tone,
  icon,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(emptyStateVariants({ size, tone }), className)}
      {...props}
    >
      {icon ? (
        <div className="text-muted-foreground [&_svg]:size-8" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm text-balance">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export { EmptyState, emptyStateVariants };
