import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * Tailwind-merge, told about the Meridian button. Its tones and sizes are
 * plain classes in meridian.css, which tailwind-merge does not know, so
 * `cn("btn btn-secondary", dirty && "btn-primary")` used to keep both: the
 * browser then took the secondary's fill and the primary's text colour, and
 * the button's label disappeared (white on white in light mode, near-black
 * on charcoal in dark). As groups, the last tone and the last size win, the
 * way `px-2` gives way to `px-4`.
 */
const twMerge = extendTailwindMerge<"btn-tone" | "btn-size">({
  extend: {
    classGroups: {
      "btn-tone": [{ btn: ["primary", "secondary", "ghost", "quiet", "destructive"] }],
      "btn-size": [{ btn: ["xs", "sm", "lg"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
