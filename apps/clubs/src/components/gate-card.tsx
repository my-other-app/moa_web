"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@moa/ui";

import { useClubDashboard } from "@/features/club";

/**
 * The door shortcut, only when a door is open: one live event goes straight
 * to its gate console, several are listed. Hidden on an event's own pages,
 * whose header already has the button, and when nothing is open.
 */
export function GateCard({ className }: { className?: string }) {
  const pathname = usePathname();
  const onEvent = /^\/events\/(?!new(?:\/|$))[^/]+/.test(pathname);
  const q = useClubDashboard();
  const live = (q.data?.live ?? []).filter((e) => e.door_open);
  if (onEvent || live.length === 0) return null;
  const one = live.length === 1 ? live[0]! : null;

  return (
    <div
      className={cn(
        "relative flex flex-col gap-2 overflow-hidden rounded-[var(--radius-lg)] p-3.5 text-white",
        "bg-[radial-gradient(120%_120%_at_0%_0%,var(--color-section-glow),var(--color-section)_70%)]",
        "shadow-[inset_0_0_0_1px_var(--color-section-ghost)]",
        className
      )}
    >
      <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-white/75">
        <span aria-hidden="true" className="size-2 rounded-full bg-[var(--color-accent-300)] shadow-[0_0_8px_var(--color-accent-300)]" />
        {one ? "DOOR OPEN" : `${live.length} DOORS OPEN`}
      </span>
      {one ? (
        <>
          <span className="line-clamp-2 text-[14px] font-medium leading-[1.3]">{one.name}</span>
          <span className="font-mono text-[11px] text-white/75 tabular-nums">
            {one.checked_in} of {one.registered} in
          </span>
          <Link href={`/gate/${one.event_id}`} className="mt-1 block w-full rounded-full bg-white/95 py-2 text-center text-[12.5px] font-semibold text-[var(--color-section)] transition-colors hover:bg-white">
            Open gate console
          </Link>
        </>
      ) : (
        <ul className="flex flex-col gap-1">
          {live.slice(0, 3).map((e) => (
            <li key={e.event_id}>
              <Link href={`/gate/${e.event_id}`} className="flex items-center gap-2 rounded-[10px] bg-white/10 px-2.5 py-1.5 transition-colors hover:bg-white/20">
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-[12px] font-medium">{e.name}</span>
                  <span className="block font-mono text-[10px] text-white/70 tabular-nums">
                    {e.checked_in} of {e.registered} in
                  </span>
                </span>
                <span aria-hidden="true" className="text-white/80">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
