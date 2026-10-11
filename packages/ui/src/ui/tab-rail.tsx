"use client";

import * as React from "react";

import { cn } from "../lib/cn";

export interface TabItem {
  key: string;
  label: React.ReactNode;
  count?: string | number | null;
  href?: string;
}

export interface TabRailProps {
  items: TabItem[];
  value: string;
  onChange?: (key: string) => void;
  /** Rendered for href tabs so the router owns navigation. */
  renderLink?: (item: TabItem, props: { className: string; children: React.ReactNode; "aria-current"?: "page" }) => React.ReactNode;
  /** Names the rail for screen readers -- "Event sections". */
  label?: string;
  className?: string;
}

/**
 * A rail of sections with an indicator that slides between them.
 *
 * The rail wraps rather than scrolls on tablets so no tab can hide. A rail of
 * links is navigation, not a tablist: each tab is its own URL and a full
 * page, so it is announced (and bookmarked) as such.
 */
function TabRail({ items, value, onChange, renderLink, label, className }: TabRailProps) {
  const ref = React.useRef<HTMLElement>(null);
  const [bar, setBar] = React.useState<{ left: number; width: number } | null>(null);

  React.useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-tab="${value}"]`);
    setBar(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [value, items.length]);

  const navigational = !!renderLink && items.every((t) => t.href);
  const Rail = (navigational ? "nav" : "div") as "nav";
  return (
    <Rail
      ref={ref}
      {...(navigational ? { "aria-label": label ?? "Sections" } : { role: "tablist", "aria-label": label })}
      className={cn("border-border relative flex flex-wrap gap-x-0.5 border-b", className)}
    >
      {items.map((t) => {
        const active = t.key === value;
        const cls = cn(
          "relative shrink-0 whitespace-nowrap border-0 bg-transparent px-3 py-2.5 text-[13px] transition-colors duration-150 hover:text-foreground focus-visible:text-foreground",
          active ? "text-foreground" : "text-muted-foreground"
        );
        const inner = (
          <>
            {t.label}
            {t.count != null ? <span className="text-muted-foreground ml-1.5 font-mono text-[11px] tabular-nums">{t.count}</span> : null}
          </>
        );
        if (t.href && renderLink) {
          return (
            <span key={t.key} data-tab={t.key} className="contents">
              {renderLink(t, { className: cls, children: inner, ...(active ? { "aria-current": "page" as const } : {}) })}
            </span>
          );
        }
        return (
          <button key={t.key} data-tab={t.key} role="tab" type="button" aria-selected={active} onClick={() => onChange?.(t.key)} className={cls}>
            {inner}
          </button>
        );
      })}
      {bar ? (
        <span
          aria-hidden="true"
          style={{ left: bar.left, width: bar.width }}
          className="bg-brand absolute -bottom-px h-0.5 transition-[left,width] duration-200 ease-out motion-reduce:transition-none"
        />
      ) : null}
    </Rail>
  );
}

/**
 * Wraps a tab's content so a change cross-fades in place. `kind="page"` is
 * for a rail of links, where the panel is the page itself.
 */
function TabPanel({ children, className, id, kind = "tab" }: { children: React.ReactNode; className?: string; id: string; kind?: "tab" | "page" }) {
  return (
    <div key={id} {...(kind === "tab" ? { role: "tabpanel" } : {})} className={cn("animate-in fade-in-0 duration-150 motion-reduce:animate-none", className)}>
      {children}
    </div>
  );
}

export { TabRail, TabPanel };
