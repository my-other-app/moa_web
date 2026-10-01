import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/cn";

/**
 * Loading placeholder.
 *
 * `shimmer` is the default because a travelling highlight reads as "working"
 * rather than "stalled" -- a plain pulse on a slow connection is easily
 * mistaken for a broken layout. `pulse` stays available for dense lists where
 * many shimmering rows at once would be noisy.
 */
const skeletonVariants = cva("bg-accent rounded-md", {
  variants: {
    variant: {
      shimmer:
        "relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-background/60 before:to-transparent motion-reduce:before:animate-none",
      pulse: "animate-pulse motion-reduce:animate-none",
      none: "",
    },
  },
  defaultVariants: { variant: "shimmer" },
});

function Skeleton({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof skeletonVariants>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(skeletonVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Skeleton, skeletonVariants };
