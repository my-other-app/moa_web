"use client";

import * as React from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { BarChart3Icon, EyeIcon, HeartIcon, ImagePlusIcon, Loader2Icon, MessageCircleIcon, PinIcon, PinOffIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";
import { formatDateTime, formatNumber, pickImage, relativeTime, useListParams } from "@moa/app-kit";
import { CardLabel, Chip, EmptyState, FigurePanel, InitialsAvatar, Notice, Pager, ProgressBar, Skeleton, StatTile, cn, toast } from "@moa/ui";
import { useObjectUrl } from "@moa/ui/hooks";

import { useMyClub } from "@/features/club";

import { useComments, useCreateThread, useDeleteComment, useDeleteThread, useReplyAsClub, useSetPinned, useThreadInsights, useThreadsPage } from "../queries";
import { MAX_BODY, MAX_POLL_OPTIONS, SCOPE_LABEL, SORT_LABEL, THREAD_SCOPES, THREAD_SORTS, composeSchema, type Thread, type ThreadInsights, type ThreadScope, type ThreadSort } from "../schemas";

/**
 * Threads, rebuilt around what a club posts for.
 *
 * One line and four figures on the month — posts, reach, how much of the
 * reach reacted, what waits for a reply — then the composer, then twelve
 * weeks of reach and reactions beside what kind of post works. The posts
 * follow in scopes a club can act on (awaiting a reply first), each
 * saying what it earned in one number, with its comments a click away.
 */
const MAX_BYTES = 5 * 1024 * 1024;
const PAGE = 10;

function Composer({ clubName, followers }: { clubName: string; followers: number }) {
  const create = useCreateThread();
  const [body, setBody] = React.useState("");
  const [notify, setNotify] = React.useState(true);
  const [poll, setPoll] = React.useState<string[] | null>(null);
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const preview = useObjectUrl(photo);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return void toast.error("Choose an image file");
    if (f.size > MAX_BYTES) return void toast.error("The photo must be under 5 MB");
    setPhoto(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = composeSchema.safeParse({ body, notify_followers: notify, poll_options: poll ?? [] });
    if (!parsed.success) return void setError(parsed.error.issues[0]?.message ?? "Check the post");
    setError(null);
    await create.mutateAsync({ input: parsed.data, photo });
    setBody("");
    setPoll(null);
    setPhoto(null);
  };

  const length = body.length;
  return (
    <FigurePanel className="p-4">
      <form onSubmit={submit} noValidate>
        <div className="flex gap-3">
          <InitialsAvatar name={clubName} size={40} className="shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <textarea aria-label="Share an update" className="input min-h-[88px] w-full resize-y py-2" placeholder={`Share an update with your ${followers.toLocaleString("en-IN")} ${followers === 1 ? "follower" : "followers"}…`} value={body} maxLength={MAX_BODY} onChange={(e) => setBody(e.target.value)} disabled={create.isPending} />
            {preview && (
              <div className="relative mt-2 h-[160px] w-full overflow-hidden rounded-xl">
                <Image src={preview} alt="" fill className="object-cover" unoptimized />
                <button type="button" aria-label="Remove photo" className="btn btn-secondary btn-xs absolute top-2 right-2" onClick={() => setPhoto(null)}>
                  <XIcon className="size-3.5" />
                </button>
              </div>
            )}
            {poll && (
              <div className="bg-sunken mt-2 flex flex-col gap-2 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Poll · {poll.length} options</span>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPoll(null)}>
                    <XIcon className="size-3.5" /> Remove poll
                  </button>
                </div>
                {poll.map((opt, i) => (
                  <input key={i} aria-label={`Option ${i + 1}`} className="input h-9 w-full" placeholder={`Option ${i + 1}`} value={opt} maxLength={60} onChange={(e) => setPoll(poll.map((o, j) => (j === i ? e.target.value : o)))} />
                ))}
                {poll.length < MAX_POLL_OPTIONS && (
                  <button type="button" className="btn btn-ghost btn-xs text-brand self-start" onClick={() => setPoll([...poll, ""])}>
                    + Add option
                  </button>
                )}
                <p className="micro text-ink-3">One vote per follower. The text above is the question.</p>
              </div>
            )}
            {error && <p className="text-refuse mt-1.5 text-[12px]">{error}</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-[52px]">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={create.isPending}>
              <ImagePlusIcon className="size-4" /> Photo
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
            <button type="button" className={cn("btn btn-ghost btn-sm", poll && "text-brand")} onClick={() => setPoll(poll ? null : ["", ""])} disabled={create.isPending}>
              <BarChart3Icon className="size-4" /> Poll
            </button>
            <label className="ml-1 flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input type="checkbox" role="switch" aria-label="Notify followers" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-[var(--brand)] size-4" />
              Notify followers
            </label>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("micro tabular-nums", length > MAX_BODY - 40 ? "text-caution" : "text-ink-3")}>
              {length}/{MAX_BODY}
            </span>
            <button type="submit" className="btn btn-primary" disabled={create.isPending || body.trim().length === 0}>
              {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />} Post
            </button>
          </div>
        </div>
      </form>
    </FigurePanel>
  );
}

function Comments({ thread }: { thread: Thread }) {
  const q = useComments(thread.id, true);
  const remove = useDeleteComment(thread.id);
  const reply = useReplyAsClub(thread.id);
  const [draft, setDraft] = React.useState("");
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    await reply.mutateAsync(text);
    setDraft("");
  };
  return (
    <div className="border-line-soft mt-3 border-t pt-3">
      {q.isPending ? (
        <Skeleton className="h-10 rounded-xl" />
      ) : !q.data || q.data.length === 0 ? (
        <p className="text-ink-3 text-[12.5px]">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {q.data.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <InitialsAvatar name={c.author.name} size={28} tone={c.author.is_club ? "accent" : "muted"} className="shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-ink text-[13px] font-medium">{c.author.name}</span>
                  {c.author.is_club && <Chip tone="accent">Club</Chip>}
                  <span className="text-ink-3 text-[11.5px]">{formatDateTime(c.created_at)}</span>
                </div>
                <p className="text-ink-2 text-[13px] whitespace-pre-wrap">{c.body}</p>
              </div>
              <button type="button" aria-label={`Remove comment by ${c.author.name}`} className="btn btn-ghost btn-xs" onClick={() => remove.mutate(c.id)} disabled={remove.isPending}>
                <Trash2Icon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input aria-label="Reply as the club" className="input h-9 flex-1" placeholder="Reply as the club…" value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} disabled={reply.isPending} />
        <button type="submit" className="btn btn-secondary" disabled={reply.isPending || draft.trim().length === 0}>
          Reply
        </button>
      </form>
    </div>
  );
}

function ThreadCard({ t, clubName, now, openByDefault }: { t: Thread; clubName: string; now: Date; openByDefault?: boolean }) {
  const pin = useSetPinned();
  const remove = useDeleteThread();
  const [open, setOpen] = React.useState(Boolean(openByDefault));
  const [confirm, setConfirm] = React.useState(false);
  const photo = pickImage(t.image, ["medium", "large", "original", "thumbnail"]);
  const rate = t.views > 0 ? Math.round((100 * t.engagement) / t.views) : null;
  const stat = "text-ink-3 inline-flex items-center gap-1 text-[12.5px] tabular-nums";
  return (
    <FigurePanel className={cn("p-4", t.pinned && "border-brand-line", t.awaiting_reply && "border-caution-line")}>
      <div className="flex items-start gap-3">
        <InitialsAvatar name={clubName} size={36} className="shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink text-[13.5px] font-medium">{clubName}</span>
            <span className="text-ink-3 text-[12px]" title={formatDateTime(t.created_at)}>
              {relativeTime(t.created_at, now)}
            </span>
            {t.pinned && (
              <Chip tone="admit">
                <PinIcon className="mr-1 inline size-3" />
                Pinned
              </Chip>
            )}
            {t.kind === "poll" && <span className="text-ink-3 font-mono text-[10px] tracking-[0.06em] uppercase">Poll</span>}
            {t.awaiting_reply && <Chip tone="caution">Awaiting your reply</Chip>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label={t.pinned ? "Unpin" : "Pin to top"} title={t.pinned ? "Unpin" : "Pin to top"} className="btn btn-ghost btn-sm" onClick={() => pin.mutate({ id: t.id, pinned: !t.pinned })} disabled={pin.isPending}>
            {t.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
          </button>
          <button
            type="button"
            aria-label={confirm ? "Confirm removing this post" : "Remove this post"}
            className={cn("btn btn-ghost btn-sm", confirm && "text-refuse")}
            onClick={() => {
              if (confirm) remove.mutate(t.id);
              setConfirm(!confirm);
            }}
            disabled={remove.isPending}
          >
            {confirm ? <span className="text-[12px]">Remove?</span> : <Trash2Icon className="size-4" />}
          </button>
        </div>
      </div>
      <p className="text-ink mt-3 text-[15px] leading-6 whitespace-pre-wrap">{t.body}</p>
      {photo && (
        <div className="relative mt-3 h-[240px] w-full overflow-hidden rounded-xl">
          <Image src={photo} alt="" fill sizes="(max-width: 1024px) 100vw, 760px" className="object-cover" unoptimized />
        </div>
      )}
      {t.poll && (
        <div className="mt-3 flex flex-col gap-2">
          {t.poll.options.map((o) => (
            <div key={o.id}>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="text-ink">{o.label}</span>
                <span className="text-ink-2 tabular-nums">{o.share}%</span>
              </div>
              <ProgressBar value={o.share} max={100} tone="accent" height={8} className="mt-1" label={`${o.label} ${o.share}%`} />
            </div>
          ))}
          <p className="micro text-ink-3">{t.poll.votes.toLocaleString("en-IN")} {t.poll.votes === 1 ? "vote" : "votes"}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span className={stat} title="Seen by">
          <EyeIcon className="size-4" /> {t.views.toLocaleString("en-IN")}
        </span>
        <span className={stat} title="Likes">
          <HeartIcon className="size-4" /> {t.likes.toLocaleString("en-IN")}
        </span>
        <button type="button" className={cn(stat, "hover:text-ink", t.awaiting_reply && "text-caution")} onClick={() => setOpen(!open)} aria-expanded={open} title="Comments">
          <MessageCircleIcon className="size-4" /> {t.comments.toLocaleString("en-IN")}
        </button>
        {rate !== null && <span className="text-ink-3 font-mono text-[11px]">{rate}% reacted</span>}
        {!t.notify_followers && <span className="micro text-ink-3 ml-auto">Followers were not notified</span>}
      </div>
      {open && <Comments thread={t} />}
    </FigurePanel>
  );
}

function Weeks({ weeks }: { weeks: ThreadInsights["weeks"] }) {
  const max = Math.max(1, ...weeks.map((w) => w.reach));
  return (
    <FigurePanel className="p-4">
      <CardLabel right={<span className="text-ink-3 font-mono text-[11px]">reach · reactions, by week</span>}>The last twelve weeks</CardLabel>
      <div className="mt-3 flex h-[88px] items-end gap-1.5" aria-label="Reach per week">
        {weeks.map((w) => (
          <div key={w.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`Week of ${w.week}: ${w.posts} posts, ${w.reach} seen, ${w.reactions} reactions`}>
            <span className="text-ink-3 font-mono text-[9.5px] tabular-nums">{w.reactions || ""}</span>
            <span className={cn("w-full rounded-t-[3px]", w.reach ? "bg-brand" : w.posts ? "bg-brand/40" : "bg-sunken")} style={{ height: `${Math.max(4, (w.reach / max) * 64)}px` }} />
          </div>
        ))}
      </div>
      <div className="text-ink-3 mt-1.5 flex justify-between font-mono text-[9.5px] tracking-[0.06em] uppercase">
        <span>{weeks[0]?.week.slice(5)}</span>
        <span>this week</span>
      </div>
    </FigurePanel>
  );
}

function WhatWorks({ i }: { i: ThreadInsights }) {
  const kinds = i.kinds.filter((k) => k.posts > 0);
  const max = Math.max(1, ...kinds.map((k) => k.avg_reach ?? 0));
  const told = i.notify.told.avg_reach;
  const quiet = i.notify.quiet.avg_reach;
  return (
    <FigurePanel className="p-4">
      <CardLabel>What works</CardLabel>
      {kinds.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">Post a few things and this says which kind your followers open.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {kinds.map((k) => (
            <li key={k.kind}>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-ink">
                  {k.label} <span className="text-ink-3">· {k.posts}</span>
                </span>
                <span className="text-ink-3 font-mono text-[11px] tabular-nums">
                  {formatNumber(k.avg_reach ?? 0)} seen · {k.avg_engagement ?? 0} reactions
                </span>
              </div>
              <ProgressBar value={k.avg_reach ?? 0} max={max} tone="accent" className="mt-1" />
            </li>
          ))}
        </ul>
      )}
      {told !== null && told !== undefined && quiet !== null && quiet !== undefined ? (
        <p className="text-ink-3 mt-3 text-[12px]">
          Telling followers: {formatNumber(told)} seen on average against {formatNumber(quiet)} when not.
        </p>
      ) : null}
    </FigurePanel>
  );
}

export function ThreadsPage() {
  const { data: club } = useMyClub();
  const params = useListParams({ pageSize: PAGE });
  const search = useSearchParams();
  const scope: ThreadScope = (THREAD_SCOPES as readonly string[]).includes(search.get("scope") ?? "") ? (search.get("scope") as ThreadScope) : "all";
  const sort: ThreadSort = (THREAD_SORTS as readonly string[]).includes(search.get("sort") ?? "") ? (search.get("sort") as ThreadSort) : "newest";
  const [now] = React.useState(() => new Date());
  const insights = useThreadInsights();
  const page = useThreadsPage({ scope, sort, offset: (params.page - 1) * PAGE, limit: PAGE });
  const clubName = club?.name ?? "Your club";
  const followers = club?.followers_count ?? 0;
  const items = page.data?.items ?? [];
  const total = page.data?.total ?? 0;
  const counts = page.data?.counts ?? {};
  const i = insights.data;
  const delta = (d: number | null | undefined, unit = "") => (d === null || d === undefined || d === 0 ? undefined : `${d > 0 ? "+" : "−"}${formatNumber(Math.abs(d))}${unit} vs prior 30`);
  const trend = (d: number | null | undefined): "up" | "down" | "none" => (d ? (d > 0 ? "up" : "down") : "none");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Threads</h1>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {i ? `${i.posts} ${i.posts === 1 ? "post" : "posts"} in 30 days · seen ${formatNumber(i.reach)} times · ${i.all_time.posts} all time` : "Posts on your club page and in followers' feeds."}
          </p>
        </div>
      </div>

      {insights.isPending ? (
        <Skeleton className="h-[108px]" />
      ) : i ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Posts, 30 days" value={formatNumber(i.posts)} note={i.posts === 0 ? "nothing posted this month" : "on your page and in feeds"} delta={delta(i.posts_delta)} trend={trend(i.posts_delta)} />
          <StatTile label="Seen, 30 days" value={formatNumber(i.reach)} note={i.reach_per_follower !== null && i.reach_per_follower !== undefined ? `${i.reach_per_follower}× your ${formatNumber(i.followers)} followers per post` : `${formatNumber(i.followers)} followers`} delta={delta(i.reach_delta)} trend={trend(i.reach_delta)} />
          <StatTile label="Reacted" value={i.engagement_rate === null || i.engagement_rate === undefined ? "—" : `${i.engagement_rate}%`} note="likes, comments and votes per view" delta={i.engagement_rate !== null && i.engagement_rate !== undefined && i.engagement_rate_prev !== null && i.engagement_rate_prev !== undefined && i.engagement_rate !== i.engagement_rate_prev ? `${i.engagement_rate > i.engagement_rate_prev ? "+" : "−"}${Math.abs(Math.round((i.engagement_rate - i.engagement_rate_prev) * 10) / 10)} pts` : undefined} trend={i.engagement_rate !== null && i.engagement_rate !== undefined && i.engagement_rate_prev !== null && i.engagement_rate_prev !== undefined ? trend(i.engagement_rate - i.engagement_rate_prev) : "none"} />
          <StatTile label="Awaiting your reply" value={formatNumber(i.awaiting)} note={i.awaiting === 0 ? "every comment answered" : "followers asked something"} scale={i.awaiting > 0 ? "hero" : "sm"} action={i.awaiting > 0 ? { label: "See them", onClick: () => params.setParam("scope", "awaiting") } : undefined} />
        </div>
      ) : null}

      {i?.best ? (
        <Notice tone="admit" tag="Best this month" action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => params.setParam("sort", "engaged")}>Sort by engagement</button>}>
          “{i.best.body}” — seen {formatNumber(i.best.views)} times, {formatNumber(i.best.engagement)} reactions.
        </Notice>
      ) : null}

      <Composer clubName={clubName} followers={followers} />

      {i ? (
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <Weeks weeks={i.weeks} />
          <WhatWorks i={i} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which posts">
          {THREAD_SCOPES.map((s) => (
            <Chip key={s} active={scope === s} tone={s === "awaiting" && (counts.awaiting ?? 0) > 0 ? "caution" : "accent"} onClick={() => params.setParam("scope", s === "all" ? undefined : s)}>
              {SCOPE_LABEL[s]}
              {counts[s] ? ` ${counts[s]}` : ""}
            </Chip>
          ))}
        </div>
        <select className="input ml-auto" aria-label="Sort" value={sort} onChange={(e) => params.setParam("sort", e.target.value === "newest" ? undefined : e.target.value)}>
          {THREAD_SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {page.isError ? (
        <EmptyState tone="muted" title="Could not load your posts" description="Try reloading the page." />
      ) : page.isPending ? (
        <Skeleton className="h-[160px] rounded-2xl" />
      ) : items.length === 0 ? (
        <EmptyState tone="muted" title={scope === "all" ? "Nothing posted yet" : scope === "awaiting" ? "Nothing waits for a reply" : "Nothing here"} description={scope === "all" ? "Your first post lands on your club page and in every follower's feed." : scope === "awaiting" ? "Every comment from a follower has a reply from the club." : "Try another scope."} />
      ) : (
        <>
          {items.map((t) => (
            <ThreadCard key={t.id} t={t} clubName={clubName} now={now} openByDefault={scope === "awaiting"} />
          ))}
          {total > PAGE && <Pager page={params.page} pageCount={Math.max(1, Math.ceil(total / PAGE))} total={total} pageSize={PAGE} noun={["post", "posts"]} onPage={params.setPage} busy={page.isFetching} />}
        </>
      )}
    </div>
  );
}
