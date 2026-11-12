"use client";

import type { LayerKindV2, LayerV2 } from "@moa/layout";
import { CardLabel, FigurePanel, IconToggle, cn } from "@moa/ui";
import { CircleAlertIcon, EyeIcon, EyeOffIcon, ImageIcon, LockIcon, LockOpenIcon, QrCodeIcon, ShapesIcon, SparklesIcon, TypeIcon } from "lucide-react";
import * as React from "react";

import { KIND_NAME } from "./model";

/**
 * Every layer, front first, as a list a keyboard can drive: Tab reaches the
 * list, the arrows move between rows, Enter or Space picks one (with shift
 * or ⌘ it is added to the selection), and each row has its eye and lock.
 * This is how a layer under another one, or a locked one, is picked.
 */

export const KIND_ICON: Record<LayerKindV2, React.ReactNode> = {
  text: <TypeIcon />,
  shape: <ShapesIcon />,
  svg: <SparklesIcon />,
  image: <ImageIcon />,
  qr: <QrCodeIcon />,
};

const summary = (l: LayerV2) => (l.kind === "text" ? l.text.replace(/\s+/g, " ").trim() || "Empty" : KIND_NAME[l.kind]);

export const BoardLayers = ({
  layers,
  selected,
  onSelect,
  onPatch,
  flagged,
  pinnedQr,
}: {
  layers: readonly LayerV2[];
  selected: ReadonlySet<string>;
  onSelect: (ids: string[], mode: "replace" | "toggle") => void;
  onPatch: (id: string, patch: Partial<LayerV2>) => void;
  flagged: ReadonlySet<string>;
  /** The QR is what the gate scans: it cannot be hidden. */
  pinnedQr: boolean;
}) => {
  const list = React.useRef<HTMLUListElement>(null);
  const ordered = React.useMemo(() => [...layers].reverse(), [layers]);
  const hidden = layers.filter((l) => l.hidden).length;

  const focusRow = (i: number) => list.current?.querySelectorAll<HTMLElement>("[data-row]")[i]?.focus();
  const onKey = (e: React.KeyboardEvent, i: number, id: string) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(Math.min(ordered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusRow(Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect([id], e.shiftKey || e.metaKey || e.ctrlKey ? "toggle" : "replace");
    }
    // Arrows nudge from the canvas, not from here: here they move between rows.
    e.stopPropagation();
  };

  return (
    <FigurePanel role="region" aria-label="Layers" className="p-0">
      <div className="border-line-soft border-b px-4 pt-4 pb-3">
        <CardLabel
          right={
            <span className="text-ink-3 font-mono text-[11px] tabular-nums">
              {layers.length}
              {hidden ? ` · ${hidden} hidden` : ""}
            </span>
          }
        >
          Layers
        </CardLabel>
      </div>
      {ordered.length ? (
        <ul ref={list} className="scroll-thin m-0 max-h-[340px] list-none overflow-y-auto p-1.5" aria-label="Layers, front to back">
          {ordered.map((l, i) => {
            const on = selected.has(l.id);
            const bad = flagged.has(l.id);
            const pinned = l.kind === "qr" && pinnedQr;
            return (
              <li key={l.id}>
                <div
                  data-row=""
                  role="button"
                  tabIndex={0}
                  aria-pressed={on}
                  aria-label={l.name}
                  onClick={(e) => onSelect([l.id], e.shiftKey || e.metaKey || e.ctrlKey ? "toggle" : "replace")}
                  onKeyDown={(e) => onKey(e, i, l.id)}
                  className={cn(
                    "group flex items-center gap-2 rounded-[var(--radius-md)] border px-2 py-1.5 transition-colors outline-none",
                    "focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]",
                    on ? "border-brand-line bg-brand-soft" : "hover:bg-sunken border-transparent"
                  )}
                >
                  <span className={cn("flex min-w-0 flex-1 items-center gap-2", l.hidden && "opacity-55")}>
                    <span
                      aria-hidden="true"
                      className={cn("grid size-6 shrink-0 place-items-center rounded-[6px] [&_svg]:size-3.5", bad ? "bg-refuse-soft text-refuse" : "bg-sunken text-ink-2")}
                    >
                      {bad ? <CircleAlertIcon /> : KIND_ICON[l.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink block truncate text-[12.5px] font-medium">{l.name}</span>
                      <span className="text-ink-3 block truncate font-mono text-[10.5px]">
                        {bad ? <span className="text-refuse">needs a fix · </span> : null}
                        {summary(l)}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 has-[[aria-pressed=true]]:opacity-100">
                    <IconToggle
                      on={!l.hidden}
                      labelOn={`Hide ${l.name}`}
                      labelOff={`Show ${l.name}`}
                      iconOn={<EyeIcon />}
                      iconOff={<EyeOffIcon />}
                      disabled={pinned}
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                      onToggle={() => onPatch(l.id, { hidden: !l.hidden })}
                    />
                    <IconToggle
                      on={l.locked}
                      labelOn={`Unlock ${l.name}`}
                      labelOff={`Lock ${l.name}`}
                      iconOn={<LockIcon />}
                      iconOff={<LockOpenIcon />}
                      tone="caution"
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                      onToggle={() => onPatch(l.id, { locked: !l.locked })}
                    />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-ink-3 m-0 px-4 py-5 text-center text-[12.5px]">No layers yet. Add one from the toolbar.</p>
      )}
    </FigurePanel>
  );
};
