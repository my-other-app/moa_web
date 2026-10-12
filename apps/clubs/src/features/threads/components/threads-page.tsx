"use client";

import * as React from "react";
import Image from "next/image";
import { BarChart3Icon, EyeIcon, HeartIcon, ImagePlusIcon, Loader2Icon, MessageCircleIcon, PinIcon, PinOffIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";
import { formatDateTime, initials, pickImage, relativeTime } from "@moa/app-kit";
import { Chip, EmptyState, FigurePanel, InitialsAvatar, Pager, ProgressBar, Skeleton, cn, toast } from "@moa/ui";
import { useObjectUrl } from "@moa/ui/hooks";

import { useMyClub } from "@/features/club";

import { useComments, useCreateThread, useDeleteComment, useDeleteThread, useReplyAsClub, useSetPinned, useThreads } from "../queries";
import { MAX_BODY, MAX_POLL_OPTIONS, composeSchema, type Thread } from "../schemas";

/**
 * Threads: posts on the club's page and in followers' feeds.
 *
 * One composer — text, a photo, a poll, and whether followers are told —
 * and the posts beneath it, newest first with the pinned one on top. Each
 * shows what it earned (likes, comments, views), a poll shows its shares,
 * and the comments open under the post, where the club can reply or
 * remove one.
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
            <textarea
              aria-label="Share an update"
              className="input min-h-[88px] w-full resize-y py-2"
              placeholder={`Share an update with your ${followers.toLocaleString("en-IN")} ${followers === 1 ? "follower" : "followers"}…`}
              value={body}
              maxLength={MAX_BODY}
              onChange={(e) => setBody(e.target.value)}
              disabled={create.isPending}
            />
            {preview && (
              <div className="relative mt-2 h-[160px] w-full overflow-hidden rounded-xl">
                <Image src={preview} alt="" fill className="object-cover" unoptimized />
                <button type="button" aria-label="Remove photo" className="btn btn-secondary absolute top-2 right-2 h-7 px-2" onClick={() => setPhoto(null)}>
                  <XIcon className="size-3.5" />
                </button>
              </div>
            )}
            {poll && (
              <div className="bg-sunken mt-2 flex flex-col gap-2 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Poll · {poll.length} options</span>
                  <button type="button" className="btn btn-ghost h-7 px-2 text-[12px]" onClick={() => setPoll(null)}>
                    <XIcon className="size-3.5" /> Remove poll
                  </button>
                </div>
                {poll.map((opt, i) => (
                  <input key={i} aria-label={`Option ${i + 1}`} className="input h-9 w-full" placeholder={`Option ${i + 1}`} value={opt} maxLength={60} onChange={(e) => setPoll(poll.map((o, j) => (j === i ? e.target.value : o)))} />
                ))}
                {poll.length < MAX_POLL_OPTIONS && (
                  <button type="button" className="btn btn-ghost text-brand h-7 self-start px-2 text-[12px]" onClick={() => setPoll([...poll, ""])}>
                    + Add option
                  </button>
                )}
                <p className="micro text-ink-3">Votes close with the post; one vote per follower. The text above is the question.</p>
              </div>
            )}
            {error && <p className="text-refuse mt-1.5 text-[12px]">{error}</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-[52px]">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-ghost h-8 px-2 text-[12.5px]" onClick={() => fileRef.current?.click()} disabled={create.isPending}>
              <ImagePlusIcon className="size-4" /> Photo
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
            <button type="button" className={cn("btn btn-ghost h-8 px-2 text-[12.5px]", poll && "text-brand")} onClick={() => setPoll(poll ? null : ["", ""])} disabled={create.isPending}>
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
            <button type="submit" className="btn btn-primary h-9" disabled={create.isPending || body.trim().length === 0}>
              {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />} Post
            </button>
          </div>
        </div>
        <p className="micro text-ink-3 mt-2 pl-[52px]">Posted as {clubName}, on your club page and in followers&apos; feeds.</p>
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
              <button type="button" aria-label={`Remove comment by ${c.author.name}`} className="btn btn-ghost h-7 px-2" onClick={() => remove.mutate(c.id)} disabled={remove.isPending}>
                <Trash2Icon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input aria-label="Reply as the club" className="input h-9 flex-1" placeholder="Reply as the club…" value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} disabled={reply.isPending} />
        <button type="submit" className="btn btn-secondary h-9" disabled={reply.isPending || draft.trim().length === 0}>
          Reply
        </button>
      </form>
    </div>
  );
}

function ThreadCard({ t, clubName }: { t: Thread; clubName: string }) {
  const pin = useSetPinned();
  const remove = useDeleteThread();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [now] = React.useState(() => new Date());
  const photo = pickImage(t.image, ["medium", "large", "original", "thumbnail"]);
  const stat = "text-ink-3 inline-flex items-center gap-1 text-[12.5px] tabular-nums";
  return (
    <FigurePanel className={cn("p-4", t.pinned && "border-brand-line")}>
      <div className="flex items-start gap-3">
        <InitialsAvatar name={clubName} size={40} className="shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink text-[14px] font-medium">{clubName}</span>
            <Chip tone="accent">Club</Chip>
            {t.pinned && (
              <Chip tone="admit">
                <PinIcon className="mr-1 inline size-3" />
                Pinned
              </Chip>
            )}
          </div>
          <p className="text-ink-3 text-[12px]" title={formatDateTime(t.created_at)}>
            {relativeTime(t.created_at, now)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label={t.pinned ? "Unpin" : "Pin to top"} title={t.pinned ? "Unpin" : "Pin to top"} className="btn btn-ghost h-8 px-2" onClick={() => pin.mutate({ id: t.id, pinned: !t.pinned })} disabled={pin.isPending}>
            {t.pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
          </button>
          <button
            type="button"
            aria-label={confirm ? "Confirm removing this post" : "Remove this post"}
            className={cn("btn btn-ghost h-8 px-2", confirm && "text-refuse")}
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
      <div className="mt-3 flex items-center gap-4">
        <span className={stat}>
          <HeartIcon className="size-4" /> {t.likes.toLocaleString("en-IN")}
        </span>
        <button type="button" className={cn(stat, "hover:text-ink")} onClick={() => setOpen(!open)} aria-expanded={open}>
          <MessageCircleIcon className="size-4" /> {t.comments.toLocaleString("en-IN")}
        </button>
        <span className={stat}>
          <EyeIcon className="size-4" /> {t.views.toLocaleString("en-IN")}
        </span>
        {!t.notify_followers && <span className="micro text-ink-3 ml-auto">Followers were not notified</span>}
      </div>
      {open && <Comments thread={t} />}
    </FigurePanel>
  );
}

export function ThreadsPage() {
  const { data: club } = useMyClub();
  const [page, setPage] = React.useState(1);
  const q = useThreads({ offset: (page - 1) * PAGE, limit: PAGE });
  const clubName = club?.name ?? "Your club";
  const followers = club?.followers_count ?? 0;
  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  return (
    <div className="flex flex-col gap-3.5">
      <header>
        <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">Threads</h2>
        <p className="text-ink-2 mt-1 text-[13px]">Posts on your club page and in followers&apos; feeds</p>
      </header>
      <Composer clubName={clubName} followers={followers} />
      {q.isError ? (
        <EmptyState tone="muted" title="Could not load your posts" description="Try reloading the page." />
      ) : q.isPending ? (
        <Skeleton className="h-[160px] rounded-2xl" />
      ) : items.length === 0 ? (
        <EmptyState tone="muted" title="Nothing posted yet" description="Your first post lands on your club page and in every follower's feed." />
      ) : (
        <>
          {items.map((t) => (
            <ThreadCard key={t.id} t={t} clubName={clubName} />
          ))}
          {total > PAGE && <Pager page={page} pageCount={Math.max(1, Math.ceil(total / PAGE))} total={total} pageSize={PAGE} noun={["post", "posts"]} onPage={setPage} />}
        </>
      )}
    </div>
  );
}
