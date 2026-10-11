"use client";

import * as React from "react";

import { cn } from "../lib/cn";

/**
 * The small vocabulary every figures panel is written in: the panel, its
 * eyebrow, a proportion bar, key/value rows, a filter chip, a notice row and
 * an initials mark. Kept together because they are only ever used together,
 * and a panel built from half of them reads as a different product.
 */

/** A panel on the figures grid. */
function FigurePanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="figure-panel"
      className={cn("bg-card ring-border/70 min-w-0 rounded-2xl p-4 shadow-sm ring-1", className)}
      {...props}
    />
  );
}

/** Uppercase mono eyebrow used as a panel or section heading. */
function CardLabel({ className, children, right }: { className?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="text-muted-foreground font-mono text-[10px] font-medium tracking-[0.09em] uppercase">{children}</span>
      {right}
    </div>
  );
}

export type BarTone = "accent" | "admit" | "caution" | "refuse" | "muted";

const BAR_FILL: Record<BarTone, string> = {
  accent: "bg-brand",
  admit: "bg-emerald-500",
  caution: "bg-amber-400",
  refuse: "bg-red-500",
  muted: "bg-muted-foreground/40",
};

function ProgressBar({
  value,
  max,
  tone = "accent",
  className,
  height = 9,
  label,
}: {
  value: number;
  max: number;
  tone?: BarTone;
  className?: string;
  height?: number;
  /** Accessible name; defaults to the fraction it shows. */
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label ?? `${value} of ${max}`}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      style={{ height }}
      className={cn("bg-muted w-full overflow-hidden rounded-full", className)}
    >
      <div
        style={{ width: `${pct}%` }}
        className={cn("h-full origin-left rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none", BAR_FILL[tone])}
      />
    </div>
  );
}

/** Key/value rows used on overview cards. */
function DefinitionRows({ rows }: { rows: { k: string; v: React.ReactNode }[] }) {
  return (
    <dl className="m-0">
      {rows.map((r) => (
        <div key={r.k} className="border-border/60 flex gap-3 border-t py-[7px] first:border-t-0">
          <dt className="text-muted-foreground w-[92px] shrink-0 font-mono text-[11px] leading-[1.5] tracking-[0.05em] uppercase">{r.k}</dt>
          <dd className="text-foreground m-0 min-w-0 flex-1 text-[12.5px]">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A toggle chip for filters: mono, tracked, lit when on. */
function Chip({
  active,
  onClick,
  children,
  tone = "accent",
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  tone?: "accent" | "caution" | "refuse" | "admit";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 font-mono text-[11px] font-medium tracking-[0.05em] transition-colors duration-150",
        active ? "border-brand bg-brand text-brand-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted",
        !active && tone === "caution" && "border-amber-500/40 text-amber-600 dark:text-amber-300",
        !active && tone === "refuse" && "border-red-500/40 text-red-600 dark:text-red-300",
        !active && tone === "admit" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-300",
        className
      )}
    >
      {children}
    </button>
  );
}

export type NoticeTone = "neutral" | "accent" | "caution" | "refuse" | "admit";

const NOTICE: Record<NoticeTone, string> = {
  neutral: "bg-muted/50 border-border text-muted-foreground [--tag:var(--muted-foreground)]",
  accent: "bg-brand/10 border-brand/30 text-foreground [--tag:var(--brand)]",
  caution: "bg-[#fdf0d2] border-[#ebdcb4] text-[#6b4e07] dark:bg-[#33280f] dark:border-[#57441f] dark:text-[#f8dfa5] [--tag:currentColor]",
  refuse: "bg-[#fde3e1] border-[#efd0cb] text-[#8c1c17] dark:bg-[#381917] dark:border-[#5a2a24] dark:text-[#f3aba7] [--tag:currentColor]",
  admit: "bg-[#e3f5e8] border-[#cbe3d5] text-[#096b5c] dark:bg-[#12302a] dark:border-[#265338] dark:text-[#b4e5bc] [--tag:currentColor]",
};

/** A tinted notice row with a mono tag on the left. */
function Notice({
  tone = "neutral",
  tag,
  children,
  action,
  className,
}: {
  tone?: NoticeTone;
  tag?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "refuse" || tone === "caution" ? "alert" : "note"}
      className={cn("flex flex-wrap items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[12.5px] leading-[1.55]", NOTICE[tone], className)}
    >
      {tag ? <span className="shrink-0 pt-0.5 font-mono text-[9px] font-semibold tracking-[0.08em] text-[var(--tag)] uppercase">{tag}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Two initials in a disc, for a list that names people without their photos. */
function InitialsAvatar({ name, size = 28, tone = "accent", className }: { name: string; size?: number; tone?: "accent" | "admit" | "muted"; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-mono font-semibold leading-none",
        tone === "admit" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : tone === "muted" ? "bg-muted text-muted-foreground" : "bg-brand/10 text-brand",
        className
      )}
    >
      {initials || "•"}
    </span>
  );
}

export { FigurePanel, CardLabel, ProgressBar, DefinitionRows, Chip, Notice, InitialsAvatar };
