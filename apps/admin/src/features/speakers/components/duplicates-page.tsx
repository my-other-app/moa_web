"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, GitMergeIcon, SplitIcon } from "lucide-react";
import { PersonAvatar, formatDate } from "@moa/app-kit";
import { Button, EmptyState, Skeleton, StatusBadge } from "@moa/ui";

import { useCan } from "@/hooks/use-can";
import { ConfirmAction } from "@/features/ops";

import { useDismissDuplicate, useDuplicates, useMergeSpeakers } from "../queries";
import { LINK_LABEL, reasonLabel, safeLink, type Duplicate, type DuplicateSide } from "../schemas";

/** One side of a pair, laid out the same as the other so the eye compares line by line. */
function Side({ s }: { s: DuplicateSide }) {
  const links = Object.entries(s.links).flatMap(([k, v]) => (safeLink(v) ? [{ kind: k, url: safeLink(v)! }] : []));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={s.name} photo={s.photo?.thumbnail ?? s.photo?.medium ?? null} className="size-10" />
        <div className="min-w-0">
          <Link href={`/speakers/${s.id}`} className="block truncate text-[14px] font-medium hover:underline">
            {s.name}
          </Link>
          <p className="text-ink-3 m-0 truncate text-[12px]">{s.headline ?? "No headline"}</p>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[12.5px]">
        <dt className="text-ink-3">City</dt>
        <dd className="m-0">{s.city ?? "—"}</dd>
        <dt className="text-ink-3">Clubs</dt>
        <dd className="m-0">{s.clubs.map((c) => c.name).join(", ") || "—"}</dd>
        <dt className="text-ink-3">Talks</dt>
        <dd className="m-0">
          {s.talks_count}
          {s.talks.length > 0 ? (
            <ul className="text-ink-3 m-0 list-none p-0">
              {s.talks.map((t) => (
                <li key={t.event_id} className="truncate">
                  {t.event_name}
                  {t.date ? ` · ${formatDate(t.date)}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </dd>
        <dt className="text-ink-3">Links</dt>
        <dd className="m-0 [overflow-wrap:anywhere]">
          {links.length === 0
            ? "—"
            : links.map((l) => (
                <a key={l.kind} href={l.url} target="_blank" rel="noreferrer" className="text-brand mr-2">
                  {LINK_LABEL[l.kind] ?? l.kind}
                </a>
              ))}
        </dd>
      </dl>
      {s.bio ? <p className="text-ink-2 m-0 line-clamp-3 text-[12.5px]">{s.bio}</p> : null}
      {s.claimed ? <StatusBadge tone="info" label="Claimed by the speaker" /> : null}
    </div>
  );
}

function Pair({ d, canChange, onMerge }: { d: Duplicate; canChange: boolean; onMerge: (keep: DuplicateSide, gone: DuplicateSide) => void }) {
  const dismiss = useDismissDuplicate();
  return (
    <li className="border-line-soft bg-surface flex flex-col gap-3 rounded-2xl border p-4" aria-label={`${d.a.name} and ${d.b.name}`}>
      <div className="flex items-center gap-2 text-[12px]">
        <StatusBadge tone="warning" label={reasonLabel(d.reason)} />
        {d.score ? <span className="text-ink-3">likeness {Math.round(d.score * 100)}%</span> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Side s={d.a} />
        <div className="md:border-line-soft md:border-l md:pl-4">
          <Side s={d.b} />
        </div>
      </div>
      {canChange ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onMerge(d.a, d.b)} aria-label={`Keep ${d.a.name} (left), merge the other in`}>
            <GitMergeIcon /> Keep left
          </Button>
          <Button size="sm" variant="outline" onClick={() => onMerge(d.b, d.a)} aria-label={`Keep ${d.b.name} (right), merge the other in`}>
            <GitMergeIcon /> Keep right
          </Button>
          <Button size="sm" variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate(d.id)}>
            <SplitIcon /> Different people
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * The merge queue: pairs that may be one person (the same name at another
 * club, the same link under another name), side by side. Merge keeps one
 * profile with both sets of talks and can be undone from the profile;
 * "Different people" takes the pair out of the queue.
 */
export function DuplicatesPage() {
  const { data, isPending, isError } = useDuplicates("open");
  const canChange = useCan("manage_content");
  const merge = useMergeSpeakers();
  const [asking, setAsking] = React.useState<{ keep: DuplicateSide; gone: DuplicateSide } | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/speakers" className="text-ink-3 hover:text-ink inline-flex items-center gap-1 text-[12.5px]">
        <ArrowLeftIcon className="size-3.5" /> Speakers
      </Link>
      {isPending ? <Skeleton className="h-64 w-full" /> : null}
      {isError ? <EmptyState tone="muted" title="The merge queue could not be read" /> : null}
      {data && data.length === 0 ? <EmptyState tone="muted" title="Nothing to check" description="No possible duplicates wait for a decision." /> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {(data ?? []).map((d) => (
          <Pair key={d.id} d={d} canChange={canChange} onMerge={(keep, gone) => setAsking({ keep, gone })} />
        ))}
      </ul>
      <ConfirmAction
        open={asking !== null}
        onOpenChange={(open) => (open ? null : setAsking(null))}
        title={asking ? `Merge ${asking.gone.name} into ${asking.keep.name}?` : "Merge"}
        description="One profile stays, with both sets of talks; each event keeps the copy its club published. Unmerge on the profile takes it back."
        confirmLabel="Merge"
        pending={merge.isPending}
        onConfirm={() => asking && merge.mutate({ keepId: asking.keep.id, mergeId: asking.gone.id }, { onSuccess: () => setAsking(null) })}
      />
    </div>
  );
}
