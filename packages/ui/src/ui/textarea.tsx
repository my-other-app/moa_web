import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/cn";

const textareaVariants = cva(
  "flex w-full bg-transparent outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "border-input placeholder:text-muted-foreground field-sizing-content min-h-16 rounded-md border px-3 py-2 text-base shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm",
        /* Matches the design's inputs (node 368:320), sized by the caller. */
        design:
          "placeholder:text-[var(--swatch-grey)] rounded-lg border-[0.5px] border-[var(--swatch-ink)] bg-white pl-2 pr-3.5 py-1.5 text-base font-medium focus-visible:ring-ring/50 focus-visible:ring-[3px]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Textarea, textareaVariants };
