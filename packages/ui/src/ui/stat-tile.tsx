"use client";

import * as React from "react";

import { cn } from "../lib/cn";

/**
 * A headline figure that may lead somewhere.
 *
 * Tabular numerals are enforced: a counter ticking from 168 to 169 must not
 * shift its neighbours. The digits roll in over 180 ms on change. A tile that
 * leads somewhere is one link, edge to edge, and takes the brand gradient
 * while pointed at or focused -- so the green says "this is where you are
 * about to go", not "this one matters more than the others".
 */
export interface StatTileProps {
  label: string;
  value: string | number;
  note?: React.ReactNode;
  delta?: string;
  trend?: "none" | "up" | "down";
  action?: { label: string; onClick: () => void } | { label: string; href: string };
  /** The app's link component (next/link), so a tile navigates without a full reload. */
  linkAs?: React.ElementType;
  /** `hero` paints the gradient permanently -- for the one figure the page is about. */
  scale?: "sm" | "hero";
  className?: string;
}

const HERO =
  "bg-[linear-gradient(150deg,var(--color-section-glow,#17a58f)_0%,var(--color-section,#14423b)_100%)]";

function StatTile({ label, value, note, delta, trend = "none", action, linkAs, scale = "sm", className }: StatTileProps) {
  const hero = scale === "hero";
  const href = action && "href" in action ? action.href : null;
  const interactive = !hero && (href !== null || !!action);
  const on = (rest: string, lit: string, lift: string) => (hero ? lit : interactive ? cn(rest, lift) : rest);

  const body = (
    <>
      {hero ? (
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(130%_100%_at_88%_4%,rgba(255,255,255,0.22)_0%,transparent_58%)]" />
      ) : null}
      {interactive ? (
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none",
            HERO
          )}
        />
      ) : null}
      <div className="relative flex items-start justify-between gap-2.5">
        <span className={cn("text-[12.5px] font-semibold tracking-[-0.01em] transition-colors", on("text-foreground", "text-white/90", "group-hover:text-white/90 group-focus-visible:text-white/90"))}>
          {label}
        </span>
        {action ? (
          <span
            aria-hidden="true"
            className={cn(
              "grid size-[30px] shrink-0 place-items-center rounded-full border text-[13px] transition-[transform,background-color,color,border-color] duration-150",
              on(
                "border-border bg-muted text-muted-foreground",
                "border-transparent bg-white/95 text-[var(--color-section,#14423b)]",
                "group-hover:border-transparent group-hover:bg-white/95 group-hover:text-[var(--color-section,#14423b)] group-focus-visible:border-transparent group-focus-visible:bg-white/95 group-focus-visible:text-[var(--color-section,#14423b)]"
              ),
              interactive && "group-hover:translate-x-px group-hover:-translate-y-px"
            )}
          >
            ↗
          </span>
        ) : null}
      </div>
      <RollingNumber
        value={value}
        className={cn(
          "relative mt-3.5 block font-mono text-[38px] leading-none tracking-[-0.035em] transition-colors",
          on("text-foreground", "text-white", "group-hover:text-white group-focus-visible:text-white")
        )}
      />
      {delta || note ? (
        <div className="relative mt-3 flex items-center gap-2">
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-1 font-mono text-[10px] font-medium leading-none",
                on(
                  trend === "down" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-brand/10 text-brand",
                  "bg-white/15 text-white",
                  "group-hover:bg-white/15 group-hover:text-white group-focus-visible:bg-white/15 group-focus-visible:text-white"
                )
              )}
            >
              {trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}
              {delta}
            </span>
          ) : null}
          {note ? (
            <span className={cn("text-[12px] leading-[1.4] transition-colors", on("text-muted-foreground", "text-white/70", "group-hover:text-white/70 group-focus-visible:text-white/70"))}>
              {note}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const classes = cn(
    "relative overflow-hidden rounded-2xl p-[18px] pb-4",
    hero ? cn("text-white shadow-[0_12px_28px_-14px_rgba(14,61,40,0.55)]", HERO) : "bg-card ring-border/70 shadow-sm ring-1",
    interactive &&
      "group block cursor-pointer text-left transition-[box-shadow] duration-200 hover:shadow-[0_12px_28px_-14px_rgba(14,61,40,0.55)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none",
    className
  );

  if (href !== null) {
    const LinkComp = linkAs ?? "a";
    return (
      <LinkComp href={href} className={classes} aria-label={`${label}: ${value}. ${action!.label}`}>
        {body}
      </LinkComp>
    );
  }
  if (action && "onClick" in action) {
    return (
      <button type="button" onClick={action.onClick} className={cn(classes, "w-full")} aria-label={`${label}: ${value}. ${action.label}`}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}

/** A number whose digits roll in when the value changes; never a full re-render flash. */
function RollingNumber({ value, className }: { value: string | number; className?: string }) {
  const text = String(value);
  const [key, setKey] = React.useState(0);
  const prev = React.useRef(text);
  React.useEffect(() => {
    if (prev.current !== text) {
      prev.current = text;
      setKey((k) => k + 1);
    }
  }, [text]);
  return (
    <span className={cn("tabular-nums", className)} aria-live="polite">
      <span key={key} className="inline-block [animation:digit-roll_180ms_ease-out_both] motion-reduce:[animation:none]">
        {text}
      </span>
    </span>
  );
}

export { StatTile, RollingNumber };
