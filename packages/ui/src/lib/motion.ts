import type { CSSProperties } from "react";

/**
 * Shared motion vocabulary.
 *
 * Micro-interactions are applied through these constants rather than ad-hoc
 * Tailwind strings so timing stays consistent across both dashboards: when
 * every surface enters at the same speed the UI reads as one product rather
 * than a set of pages. Every entry pairs with `motion-reduce:` so the whole
 * system degrades for users who ask for reduced motion.
 */

/** Interactive press feedback. Subtle -- a large scale reads as a toy. */
export const pressable =
  "transition-transform duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

/** Row/card hover lift. */
export const hoverLift =
  "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/** Content appearing for the first time. */
export const enter =
  "animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none";

/** Lighter variant for items already in view (e.g. filter re-renders). */
export const enterSoft =
  "animate-in fade-in-0 duration-200 motion-reduce:animate-none";

/**
 * Staggered list entry. Index-based delay, capped so a 50-row table does not
 * take three seconds to finish appearing.
 */
export function stagger(index: number, step = 35, max = 300): CSSProperties {
  return { animationDelay: `${Math.min(index * step, max)}ms` };
}

/** Focus ring matching the shadcn token set. */
export const focusRing =
  "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
