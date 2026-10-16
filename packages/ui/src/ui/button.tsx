import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "../lib/cn";

/**
 * The button. One component, and one stylesheet behind it: every variant
 * and size here is a `.btn` class from the Meridian sheet, so a `<Button>`
 * and a `<Link className="btn btn-secondary">` are the same control to
 * the pixel. Nothing else sets a button's height, padding, radius or type.
 *
 *   variant     class             use
 *   primary     btn-primary       the one thing the page is for
 *   secondary   btn-secondary     everything else
 *   ghost       btn-ghost         a quiet, link-like action
 *   destructive btn-destructive   the one that removes
 *
 *   size      class    height
 *   xs        btn-xs   28px — a row's small action
 *   sm        btn-sm   32px — a panel's action
 *   md        (none)   36px — a page's action
 *   lg        btn-lg   44px — a touch screen
 *   icon*     btn-icon the same heights, square
 *
 * The older names (`default`, `outline`, `link`, `display`) are kept as
 * aliases so a screen written against them renders the one system.
 */
const buttonVariants = cva("btn", {
  variants: {
    variant: {
      primary: "btn-primary",
      secondary: "btn-secondary",
      ghost: "btn-ghost",
      destructive: "btn-destructive",
      /* Aliases from before the sheet was the only source. */
      default: "btn-primary",
      outline: "btn-secondary",
      link: "btn-ghost",
      display: "btn-primary btn-lg",
    },
    size: {
      xs: "btn-xs",
      sm: "btn-sm",
      md: "",
      default: "",
      lg: "btn-lg",
      icon: "btn-icon",
      "icon-xs": "btn-icon btn-xs",
      "icon-sm": "btn-icon btn-sm",
      "icon-lg": "btn-icon btn-lg",
      display: "btn-lg",
    },
    /** Round, for an icon button that sits in a row. */
    round: { true: "btn-round" },
    /** A secondary or ghost button whose action removes something: refuse text, refuse on hover. */
    danger: { true: "btn-danger" },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({
  className,
  variant = "primary",
  size = "md",
  round,
  danger,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(
        buttonVariants({ variant, size, round, danger }),
        className,
      )}
      {...props}
    />
  );
}

type IconButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  /** What the button does; what a screen reader says and what the tooltip shows. */
  label: string;
  size?: "xs" | "sm" | "md";
  variant?: "secondary" | "ghost";
  danger?: boolean;
  children: React.ReactNode;
};

/** An icon-only button for a row: round, 32px, a line around it. */
function IconButton({
  label,
  size = "sm",
  variant = "secondary",
  danger,
  className,
  children,
  ...props
}: IconButtonProps) {
  const sized = size === "md" ? "icon" : size === "xs" ? "icon-xs" : "icon-sm";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-slot="icon-button"
      className={cn(
        buttonVariants({ variant, size: sized, round: true, danger }),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export { Button, IconButton, buttonVariants };
