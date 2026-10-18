import * as React from "react";
import { cn } from "@moa/ui";

import { topicColor, topicLabel } from "./derive";
import type { TopicRef } from "./schemas";

/** The topic's colour as a soft fill and a line, so a chip reads the same on the light and the dark ground. */
export function topicTint(color: string, fill = 10, line = 35): React.CSSProperties {
  return {
    background: `color-mix(in srgb, ${color} ${fill}%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} ${line}%, transparent)`,
  };
}

/** A topic's dot: its colour, decorative. */
export function TopicDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

/**
 * Topics as small chips: each one's colour, then its name. A list, named
 * for what it lists, so a screen reader hears "Topics, 2 items". Renders
 * nothing when there are none; the caller decides what an empty one says.
 */
export function TopicChips({
  topics,
  label = "Topics",
  size = "sm",
  className,
}: {
  topics: readonly TopicRef[];
  /** The list's accessible name. */
  label?: string;
  size?: "xs" | "sm";
  className?: string;
}) {
  if (!topics.length) return null;
  return (
    <ul aria-label={label} className={cn("m-0 flex list-none flex-wrap items-center gap-1.5 p-0", className)}>
      {topics.map((t) => {
        const color = topicColor(t);
        return (
          <li key={t.id} className="m-0 p-0">
            <span
              data-slot="topic-chip"
              className={cn(
                "text-ink inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
                size === "xs" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-[12px]",
              )}
              style={topicTint(color)}
            >
              <TopicDot color={color} className={size === "xs" ? "size-1.5" : undefined} />
              {topicLabel(t.name)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
