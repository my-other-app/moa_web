"use client";

import * as React from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@moa/ui";

const ORDER = ["system", "light", "dark"] as const;
type Mode = (typeof ORDER)[number];

const LABEL: Record<Mode, string> = { system: "Following the system", light: "Light", dark: "Dark" };

const subscribe = () => () => {};

/**
 * One button that cycles system → light → dark. The icon shows what is in
 * force now; the tooltip says which choice made it so. Rendered only after
 * mount, because the server cannot know the viewer's choice.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return <span aria-hidden="true" className={cn("size-9", className)} />;

  const mode = (ORDER.includes(theme as Mode) ? theme : "system") as Mode;
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]!;
  const Icon = mode === "system" ? MonitorIcon : resolvedTheme === "dark" ? MoonIcon : SunIcon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setTheme(next)}
          aria-label={`Theme: ${LABEL[mode]}. Switch to ${LABEL[next].toLowerCase()}`}
          className={cn(
            "border-line bg-surface text-ink-2 hover:bg-sunken hover:text-ink grid size-9 shrink-0 place-items-center rounded-full border transition-colors",
            className
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{LABEL[mode]} · click for {LABEL[next].toLowerCase()}</TooltipContent>
    </Tooltip>
  );
}
