"use client";

import * as React from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button, FigurePanel, Skeleton, StatusBadge, toast } from "@moa/ui";

import { errorText } from "../lib/errors";
import { useFeed, useSetFeedHidden } from "../queries";

/**
 * What the venue screen's ticker says: the latest events, newest first, each
 * with Hide / Show. A hidden event stays in this list (so it can come back)
 * and leaves the screen at once.
 */
export function FeedPanel({ eventId, canEdit }: { eventId: number; canEdit: boolean }) {
  const feed = useFeed(eventId);
  const set = useSetFeedHidden(eventId);
  const items = (feed.data ?? []).slice(0, 12);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const toggle = (id: string, hidden: boolean) => {
    setBusyId(id);
    set.mutate(
      { feedId: id, hidden },
      {
        onSuccess: () => toast.success(hidden ? "Hidden from the screen" : "Showing on the screen again"),
        onError: (err) => toast.error(errorText(err)),
        onSettled: () => setBusyId(null),
      },
    );
  };

  return (
    <FigurePanel className="p-0">
      <div className="p-4">
        <span className="text-ink block text-[15px] font-semibold">Screen feed</span>
        <span className="text-ink-3 mt-0.5 block text-[12.5px] leading-[1.5]">The latest things the venue screen&apos;s ticker has said. Hide one that shouldn&apos;t be up there.</span>
      </div>
      <div className="border-line-soft border-t">
        {feed.isPending ? (
          <div className="p-4">
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : feed.isError ? (
          <p className="text-ink-3 m-0 p-4 text-[13px]">Could not load the feed.</p>
        ) : items.length ? (
          <ul className="m-0 list-none p-0" aria-label="Screen feed">
            {items.map((f) => (
              <li key={f.id} className="border-line-soft flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2.5 first:border-t-0">
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13.5px] ${f.hidden ? "text-ink-3 line-through" : ""}`}>{f.message}</span>
                  {f.created_at ? <span className="text-ink-3 block text-[11.5px]">{new Date(f.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : null}
                </span>
                {f.hidden ? <StatusBadge tone="default" label="Hidden" /> : null}
                {canEdit ? (
                  <Button size="sm" variant="secondary" disabled={busyId === f.id} aria-label={`${f.hidden ? "Show" : "Hide"}: ${f.message}`} onClick={() => toggle(f.id, !f.hidden)}>
                    {f.hidden ? <EyeIcon /> : <EyeOffIcon />} {f.hidden ? "Show" : "Hide"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-3 m-0 p-4 text-[13px]">Nothing on the feed yet. It fills as players reveal heroes and find codes.</p>
        )}
      </div>
    </FigurePanel>
  );
}
