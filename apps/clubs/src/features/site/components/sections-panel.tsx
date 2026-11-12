"use client";

import * as React from "react";
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, LockIcon } from "lucide-react";
import { CardLabel, FigurePanel, IconButton, Switch, cn } from "@moa/ui";

import { moved, sectionWord } from "../layout";
import { LEGACY_SECTION_EMPTY, LEGACY_SECTION_LABEL, TITLE_MAX, fixedOf, type Layout, type SiteTemplate } from "../schemas";
import { useDragReorder } from "../use-drag-reorder";

/**
 * The template's sections in the club's order: drag a row by its grip, or
 * use its Move up / Move down (the keyboard's way); switch one off to take
 * it off the page; write a title of your own over the template's. The rows
 * the template fixes (the navigation and hero at the top, the footer at the
 * foot, the profile column of a two-column design) are shown, not moved.
 * A section with nothing to show (no past events yet) leaves the page by
 * itself, whatever its switch says.
 */
function FixedRow({ words, where }: { words: string; where: string }) {
  return (
    <li className="border-line-soft text-ink-3 flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-[12.5px]">
      <LockIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{words}</span>
      <span className="text-[11px]">{where}</span>
    </li>
  );
}

export function SectionsPanel({
  template,
  layout,
  typed,
  onChange,
}: {
  template: SiteTemplate | undefined;
  layout: Layout;
  /** The titles as typed (the layout's are trimmed, and drop the template's own): what the fields show. */
  typed: Record<string, string>;
  onChange: (next: Layout) => void;
}) {
  const [said, setSaid] = React.useState("");
  const meta = new Map((template?.sections ?? []).map((s) => [s.key, s]));
  const order = layout.order;
  const word = (k: string) => sectionWord(template, k);

  const move = (from: number, to: number) => {
    const next = moved(order, from, to);
    if (next.join() === order.join()) return;
    onChange({ ...layout, order: next });
    const k = order[from] ?? "";
    setSaid(`${word(k)} moved to place ${next.indexOf(k) + 1} of ${next.length}`);
  };
  const drag = useDragReorder(move);
  const setHidden = (k: string, hide: boolean) => onChange({ ...layout, hidden: hide ? [...layout.hidden.filter((h) => h !== k), k] : layout.hidden.filter((h) => h !== k) });
  const setTitle = (k: string, v: string) => {
    const titles = { ...layout.titles, ...typed };
    if (v) titles[k] = v.slice(0, TITLE_MAX);
    else delete titles[k];
    onChange({ ...layout, titles });
  };

  const { top, side, bottom } = fixedOf(template);

  return (
    <FigurePanel className="p-4">
      <CardLabel>Sections</CardLabel>
      <p className="text-ink-3 mt-2 text-[11.5px]">
        Drag a section by its grip, or use the arrows. Switch one off to leave it off the page; a section with nothing to show yet stays off by itself.
        {template?.layout === "two_column" ? " The profile column stays at the side; these are the content column." : ""}
      </p>
      <ul className="mt-3 grid gap-2" aria-label="Fixed at the top">
        {top.map((k) => (
          <FixedRow key={k} words={word(k)} where="Fixed at the top" />
        ))}
        {side.map((k) => (
          <FixedRow key={k} words={word(k)} where="Fixed at the side" />
        ))}
      </ul>
      <ol className="mt-2 grid gap-2" aria-label="Sections in order">
        {order.map((k, i) => {
          const m = meta.get(k);
          const hideable = m?.hideable !== false;
          const shown = !layout.hidden.includes(k);
          const label = word(k);
          const item = drag.itemProps(i);
          return (
            <li
              key={k}
              {...item}
              data-testid={`section-${k}`}
              className={cn(
                "border-line bg-surface flex items-center gap-2 rounded-xl border px-2 py-2 transition-colors",
                item["data-dragging"] !== undefined && "opacity-50",
                item["data-over"] === "before" && "border-t-brand border-t-2",
                item["data-over"] === "after" && "border-b-brand border-b-2",
              )}
            >
              <span {...drag.handleProps(i)} className="text-ink-3 hover:text-ink cursor-grab touch-none p-1 active:cursor-grabbing" title="Drag to move" aria-hidden="true">
                <GripVerticalIcon className="size-4" />
              </span>
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="flex items-center gap-2 text-[12.5px] font-medium">
                  <span className={cn(shown ? "text-ink" : "text-ink-3 line-through")}>{label}</span>
                  {!shown ? <span className="text-ink-3 text-[11px] font-normal">Hidden</span> : null}
                </span>
                <input
                  aria-label={`${label} title`}
                  className="input input-sm w-full"
                  value={typed[k] ?? layout.titles[k] ?? ""}
                  placeholder={m?.default_title ?? label}
                  maxLength={TITLE_MAX}
                  onChange={(e) => setTitle(k, e.target.value)}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton label={`Move ${label} up`} size="xs" variant="ghost" disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <ArrowUpIcon className="size-3.5" />
                </IconButton>
                <IconButton label={`Move ${label} down`} size="xs" variant="ghost" disabled={i === order.length - 1} onClick={() => move(i, i + 1)}>
                  <ArrowDownIcon className="size-3.5" />
                </IconButton>
                {hideable ? (
                  <Switch checked={shown} onCheckedChange={(v) => setHidden(k, !v)} aria-label={`Show ${label}`} />
                ) : (
                  <span className="text-ink-3 grid w-9 place-items-center" title="Always on the page">
                    <LockIcon className="size-3.5" aria-label={`${label} is always shown`} />
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {bottom.length ? (
        <ul className="mt-2 grid gap-2" aria-label="Fixed at the foot">
          {bottom.map((k) => (
            <FixedRow key={k} words={word(k)} where="Fixed at the foot" />
          ))}
        </ul>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </FigurePanel>
  );
}

/**
 * The older server's sections: each only on or off, in the template's own
 * order (it keeps no order, no titles).
 */
export function LegacySectionsPanel({ sections, available, onChange }: { sections: Record<string, boolean>; available: Record<string, boolean>; onChange: (next: Record<string, boolean>) => void }) {
  const keys = Object.keys(LEGACY_SECTION_LABEL);
  return (
    <FigurePanel className="p-4">
      <CardLabel>Sections</CardLabel>
      <ul className="mt-3 grid gap-2">
        {keys.map((k) => {
          const on = sections[k] ?? true;
          const has = available[k] ?? true;
          const label = LEGACY_SECTION_LABEL[k] ?? k;
          return (
            <li key={k} className="flex items-center justify-between gap-3 text-[13px]">
              <span className={cn(on && has ? "text-ink" : "text-ink-3")}>
                {label}
                {!has ? <span className="text-ink-3 ml-2 text-[11px]">{LEGACY_SECTION_EMPTY[k] ?? "nothing to show yet"}</span> : null}
              </span>
              <Switch checked={on} onCheckedChange={(v) => onChange({ ...sections, [k]: v })} aria-label={`Show ${label}`} />
            </li>
          );
        })}
      </ul>
    </FigurePanel>
  );
}
