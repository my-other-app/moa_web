import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/cn";

const inputVariants = cva(
  "file:text-foreground selection:bg-primary selection:text-primary-foreground w-full min-w-0 bg-transparent outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 transition-[color,box-shadow] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "placeholder:text-muted-foreground dark:bg-input/30 border-input h-9 rounded-md border px-3 py-1 text-base shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm",
        /*
         * The form field from the design (node 368:306): 44px tall, 8px
         * radius, a hairline charcoal border and grey medium placeholder
         * text. A variant rather than a second component so every field in
         * both dashboards keeps one implementation.
         */
        design:
          "placeholder:text-[var(--swatch-grey)] h-11 rounded-lg border-[0.5px] border-[var(--swatch-ink)] bg-white pl-2 pr-3.5 py-1.5 text-base font-medium focus-visible:ring-ring/50 focus-visible:ring-[3px]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Input({
  className,
  type,
  variant,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Input, inputVariants };
