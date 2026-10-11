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
    <div className={cn("shadow-hero relative overflow-hidden rounded-[var(--radius-panel)] bg-[linear-gradient(150deg,var(--hero-from)_0%,var(--hero-to)_100%)] p-4 pt-[18px] text-white", className)}>
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_8%,rgba(255,255,255,0.2)_0%,transparent_62%)]" />
      <div className="relative">
        <span className="mb-3 flex items-center gap-2">
          <span className="relative grid size-[26px] place-items-center rounded-full bg-white/15">
            <span aria-hidden="true" className="size-[9px] rounded-full bg-white [animation:pulse-ring_2.4s_infinite] motion-reduce:[animation:none]" />
          </span>
          <span className="font-mono text-[10px] tracking-[0.12em] text-white/75">{one ? "DOOR OPEN" : `${live.length} DOORS OPEN`}</span>
        </span>
        {one ? (
          <>
            <div className="line-clamp-2 text-[15px] leading-[1.3] font-semibold tracking-[-0.02em]">{one.name}</div>
            <div className="mt-1.5 font-mono text-[11px] text-white/75 tabular-nums">
              {one.checked_in} of {one.registered} in
            </div>
            <Link href={`/gate/${one.event_id}`} className="mt-3.5 block w-full rounded-full bg-white/95 py-[10px] text-center text-[13px] font-semibold text-[var(--hero-to)] transition-colors hover:bg-white">
              Open gate console
            </Link>
          </>
        ) : (
          <>
            <div className="text-[15px] leading-[1.3] font-semibold tracking-[-0.02em]">Open a gate console</div>
            <ul className="mt-2.5 flex flex-col gap-1">
              {live.slice(0, 3).map((e) => (
                <li key={e.event_id}>
                  <Link href={`/gate/${e.event_id}`} className="flex items-center gap-2 rounded-[10px] bg-white/10 px-2.5 py-2 transition-colors hover:bg-white/20">
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[12.5px] leading-[1.3] font-medium">{e.name}</span>
                      <span className="mt-0.5 block font-mono text-[10.5px] text-white/70 tabular-nums">
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
          </>
        )}
      </div>
    </div>
  );
}
