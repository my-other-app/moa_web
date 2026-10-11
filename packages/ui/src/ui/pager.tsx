"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "../lib/cn";

export interface PagerProps {
  /** 1-based. */
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  sizes?: number[];
  /** The word for one and for many: ["guest", "guests"]. */
  noun?: [string, string];
  busy?: boolean;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  className?: string;
}

/**
 * Where a list stands and how to move through it: "1–20 of 184 guests",
 * the page size, previous and next. Always shown once there are rows, even
 * on a single page, so every list reads the same way and the count is never
 * a mystery.
 */
function Pager({ page, pageCount, total, pageSize, sizes = [10, 20, 50, 100], noun, busy, onPage, onPageSize, className }: PagerProps) {
  const pages = Math.max(1, pageCount);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const word = noun ? ` ${total === 1 ? noun[0] : noun[1]}` : "";
  const nav = "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground grid size-7 shrink-0 place-items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card";
  return (
    <div className={cn("text-muted-foreground flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12px]", className)}>
      <span className="font-mono tabular-nums">
        {from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
        {word}
        {busy ? " · refreshing" : ""}
      </span>
      <span className="flex items-center gap-2">
        {onPageSize ? (
          <label className="flex items-center gap-1.5">
            <span>Per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              aria-label="Rows per page"
              className="border-border bg-card text-foreground h-7 rounded-md border px-1.5 text-[12px] outline-none"
            >
              {(sizes.includes(pageSize) ? sizes : [...sizes, pageSize].sort((a, b) => a - b)).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Previous page" className={nav}>
          <ChevronLeftIcon className="size-3.5" />
        </button>
        <span className="font-mono tabular-nums">
          {page} / {pages}
        </span>
        <button type="button" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages} aria-label="Next page" className={nav}>
          <ChevronRightIcon className="size-3.5" />
        </button>
      </span>
    </div>
  );
}

export { Pager };
