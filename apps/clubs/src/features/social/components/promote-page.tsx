"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  ImageIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Share2Icon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  CardLabel,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FigurePanel,
  Notice,
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";

import { useEventDetail } from "@/features/events";

import { previewPost } from "../api";
import { useEventPosts, usePostAction, useRetryTarget, useShareKit, useSocialAccounts, useSocialOnServer, useSocialRole, useSocialSettings } from "../queries";
import {
  PLATFORMS,
  PLATFORM_LABEL,
  POST_STATUS_LABEL,
  POST_TEMPLATES,
  cancellable,
  editable,
  fillIn,
  isPlatform,
  postable,
  targetChip,
  triggerLabel,
  type FailureAction,
  type Platform,
  type PostTarget,
  type PostTemplateKey,
  type SocialAccount,
  type SocialPost,
} from "../schemas";
import { copyText, downloadImage, posterName, shareManually } from "../share";
import { PlatformMark } from "./platform-mark";
import { PostEditorSheet, type EditorRequest } from "./post-editor";

/**
 * Event → Promote: the event's campaign.
 *
 * Above, the registrations each platform's link brought. Then every post,
 * newest first, with when it goes out and a status per platform: Draft,
 * Needs approval, Scheduled, Posting, Posted (with the link), Failed (with
 * the reason and Retry, Reconnect, Share manually or Fix image), Cancelled,
 * or Paused when the event changed under it. Last, the share kit: each
 * platform's text and poster, ready to post by hand, on every plan.
 *
 * Owners, admins and editors open it; door staff don't (the tab is not
 * theirs). Only owners and admins approve; a co-host club sees and posts
 * only its own.
 */
export function PromotePage({ eventId }: { eventId: number }) {
  const role = useSocialRole();
  const on = useSocialOnServer(role.see);
  const live = on === true;
  const posts = useEventPosts(eventId, live);
  const accounts = useSocialAccounts(live);
  const settings = useSocialSettings(live);
  const event = useEventDetail(eventId);
  const [editor, setEditor] = React.useState<EditorRequest | null>(null);
  useComposeParam(live, setEditor);

  const usable = postable(accounts.data ?? []);
  const held = (accounts.data ?? []).filter((a) => a.status === "needs_reconnect");
  const cohost = event.data?.viewer_role === "cohost";
  const open = (template: PostTemplateKey) => setEditor({ post: null, template });

  if (on === false) {
    return (
      <Notice tone="neutral" tag="Promote">
        Posting to social media isn&apos;t available yet. This tab fills in by itself once it is.
      </Notice>
    );
  }
  if (on === undefined || posts.data === undefined || accounts.data === undefined) {
    if (posts.isError || accounts.isError) return <Notice tone="refuse" tag="Promote">We couldn&apos;t load this event&apos;s posts. Try reloading the page.</Notice>;
    return (
      <div className="grid gap-3.5" aria-busy="true">
        <Skeleton className="h-[96px] rounded-2xl" />
        <Skeleton className="h-[220px] rounded-2xl" />
      </div>
    );
  }

  const list = posts.data.posts;
  const approval = Boolean(settings.data?.approval_required);

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-ink m-0 text-[18px] font-semibold tracking-[-0.01em]">Promote</h2>
          <p className="text-ink-2 m-0 mt-1 max-w-[70ch] text-[13px]">
            The posts that announce this event on your club&apos;s accounts, and when each goes out.
            {approval ? " Editors' posts wait for an owner or admin to approve them." : ""}
          </p>
        </div>
        {role.post && usable.length ? <AddPostMenu onPick={open} /> : null}
      </header>

      {cohost ? (
        <Notice tone="neutral" tag="Co-host">
          Your posts go out from your club&apos;s own accounts. The host club posts from theirs; neither sees the other&apos;s.
        </Notice>
      ) : null}

      {usable.length === 0 ? (
        <Notice
          tone="neutral"
          tag="Accounts"
          action={
            <Link href="/social" className="btn btn-secondary btn-sm">
              {role.manage ? "Connect accounts" : "See accounts"}
            </Link>
          }
        >
          No social account is connected yet. {role.manage ? "Connect the club's Instagram, Facebook, LinkedIn or X once, and this event's posts go out by themselves." : "Ask the club's owner or an admin to connect the club's accounts."} The share kit below works meanwhile.
        </Notice>
      ) : null}

      {held.map((a) => (
        <Notice
          key={a.id}
          tone="caution"
          tag="Reconnect"
          action={
            role.manage ? (
              <Link href="/social" className="btn btn-secondary btn-sm">
                Reconnect {PLATFORM_LABEL[a.platform]}
              </Link>
            ) : undefined
          }
        >
          {PLATFORM_LABEL[a.platform]} needs reconnecting{a.waiting_posts ? ` — ${a.waiting_posts} ${a.waiting_posts === 1 ? "post" : "posts"} waiting` : ""}. {role.manage ? "" : "Ask the club's owner or an admin."}
        </Notice>
      ))}

      <Attribution attribution={posts.data.attribution} />

      <FigurePanel className="flex flex-col gap-0 overflow-hidden p-0">
        <div className="border-line-soft flex items-center justify-between border-b px-4 py-3">
          <CardLabel>Campaign</CardLabel>
          <span className="text-ink-3 font-mono text-[11px] tabular-nums">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <p className="text-ink-2 m-0 max-w-[52ch] text-[13px]">
              No posts yet. A campaign is usually an announcement when the event is published, a reminder two days before and a last call on the morning.
            </p>
            {role.post && usable.length ? (
              <div className="flex flex-wrap justify-center gap-2">
                {POST_TEMPLATES.slice(0, 3).map((t) => (
                  <button key={t.key} type="button" className="btn btn-secondary btn-sm" onClick={() => open(t.key)}>
                    <PlusIcon className="size-3.5" /> {t.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <ol className="m-0 list-none p-0">
            {list.map((p) => (
              <PostRow key={p.id} eventId={eventId} post={p} accounts={accounts.data ?? []} onEdit={(platform, poster) => setEditor({ post: p, template: "custom", platform, poster })} />
            ))}
          </ol>
        )}
      </FigurePanel>

      <ShareKitPanel eventId={eventId} />

      <PostEditorSheet eventId={eventId} request={editor} onClose={() => setEditor(null)} />
    </div>
  );
}

/** `?compose=announcement` (from the publish step's "Edit posts") opens the editor once. */
function useComposeParam(live: boolean, open: (r: EditorRequest) => void) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const done = React.useRef(false);
  React.useEffect(() => {
    const compose = params.get("compose");
    if (done.current || !live || !compose) return;
    done.current = true;
    const known = POST_TEMPLATES.some((t) => t.key === compose);
    open({ post: null, template: known ? (compose as PostTemplateKey) : "custom" });
    router.replace(pathname);
  }, [params, live, open, router, pathname]);
}

function AddPostMenu({ onPick }: { onPick: (t: PostTemplateKey) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="btn btn-primary">
          <PlusIcon className="size-4" /> Add post <ChevronDownIcon className="size-4 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        {POST_TEMPLATES.map((t) => (
          <DropdownMenuItem key={t.key} onSelect={() => onPick(t.key)}>
            <span className="flex flex-col">
              <span className="text-ink text-[13px]">{t.name}</span>
              <span className="text-ink-3 text-[11.5px]">{t.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => onPick("custom")}>
          <span className="flex flex-col">
            <span className="text-ink text-[13px]">Another post</span>
            <span className="text-ink-3 text-[11.5px]">Your own name and time</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Registrations per platform ──────────────────────────────────────────

function Attribution({ attribution }: { attribution: Record<string, number> }) {
  const rows = Object.entries(attribution)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || (PLATFORMS as readonly string[]).indexOf(a[0]) - (PLATFORMS as readonly string[]).indexOf(b[0]));
  const total = rows.reduce((s, [, n]) => s + n, 0);
  return (
    <FigurePanel className="p-4" role="region" aria-label="Registrations by platform">
      <CardLabel right={total ? <span className="text-ink-3 font-mono text-[11px] tabular-nums">{formatNumber(total)} in all</span> : null}>Registrations by platform</CardLabel>
      {rows.length === 0 ? (
        <p className="text-ink-3 m-0 mt-2 text-[12.5px]">Each post carries its own tracking link. Registrations through them show here, per platform.</p>
      ) : (
        <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-x-6 gap-y-2.5 p-0">
          {rows.map(([key, n]) => (
            <li key={key} className="flex items-center gap-2">
              {isPlatform(key) ? <PlatformMark platform={key} size="sm" /> : null}
              <span className="text-ink-2 text-[12.5px]">{isPlatform(key) ? PLATFORM_LABEL[key] : key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")}</span>
              <span className="text-ink font-mono text-[15px] font-semibold tabular-nums">{formatNumber(n)}</span>
            </li>
          ))}
        </ul>
      )}
    </FigurePanel>
  );
}

// ─── A post and its platforms ────────────────────────────────────────────

type Confirm = { kind: "cancel" | "delete"; post: SocialPost } | null;

function PostRow({ eventId, post, accounts, onEdit }: { eventId: number; post: SocialPost; accounts: SocialAccount[]; onEdit: (platform?: Platform | null, poster?: boolean) => void }) {
  const role = useSocialRole();
  const action = usePostAction(eventId);
  const [confirm, setConfirm] = React.useState<Confirm>(null);
  const status = POST_STATUS_LABEL[post.status];
  const paused = post.status === "paused";
  const by = [post.created_by?.name ? `By ${post.created_by.name}` : null, post.approved_by?.name ? `approved by ${post.approved_by.name}` : null].filter(Boolean).join(" · ");

  return (
    <li className="border-line-soft border-t px-4 py-3.5 first:border-t-0" data-testid={`post-${post.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-ink m-0 text-[14px] font-semibold">{post.name}</h3>
            <span className="text-ink-3 bg-sunken rounded-full px-2 py-0.5 font-mono text-[10.5px]">{triggerLabel(post.trigger)}</span>
            <StatusBadge label={status.label} tone={status.tone} />
          </div>
          {by ? <p className="text-ink-3 m-0 mt-0.5 text-[11.5px]">{by}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {post.status === "needs_approval" && role.manage ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => action.mutate({ action: "approve", postId: post.id })} disabled={action.isPending}>
              <CheckIcon className="size-3.5" /> Approve
            </button>
          ) : null}
          {role.post && editable(post) ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit()}>
              <PencilIcon className="size-3.5" /> {paused ? "Review" : "Edit"}
            </button>
          ) : null}
          {role.post && post.status === "draft" ? (
            <button type="button" className="btn btn-ghost btn-sm text-refuse" onClick={() => setConfirm({ kind: "delete", post })} aria-label={`Delete ${post.name}`}>
              <Trash2Icon className="size-3.5" />
            </button>
          ) : null}
          {role.post && cancellable(post) ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm({ kind: "cancel", post })}>
              <XIcon className="size-3.5" /> Cancel
            </button>
          ) : null}
        </div>
      </div>

      {paused ? (
        <Notice tone="caution" tag="Paused" className="mt-2.5">
          {post.paused_reason === "event_changed" || post.reason === "event_changed" || (!post.paused_reason && !post.reason)
            ? "The event changed — review this post. It mentions a detail that changed (the date, time, venue or fee), so it waits until someone looks."
            : `Paused: ${(post.paused_reason ?? post.reason ?? "").replace(/_/g, " ")}.`}
        </Notice>
      ) : null}
      {post.status === "needs_approval" ? (
        <p className="text-ink-3 m-0 mt-2 text-[12px]">{role.manage ? "An editor wrote this. Approve it to send it at its time." : "Waiting for an owner or admin to approve it."}</p>
      ) : null}

      <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0">
        {post.targets.map((t) => (
          <TargetRow key={t.id} eventId={eventId} post={post} target={t} account={accounts.find((a) => a.id === t.account_id) ?? null} onFixImage={() => onEdit(t.platform, true)} />
        ))}
      </ul>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => (o ? null : setConfirm(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "delete" ? `Delete the draft “${post.name}”?` : `Cancel “${post.name}”?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete" ? "It hasn't gone anywhere; it's simply removed." : "Nothing more goes out from this post. Anything already posted stays on the platform."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() => {
                if (confirm) action.mutate({ action: confirm.kind, postId: post.id });
                setConfirm(null);
              }}
            >
              {confirm?.kind === "delete" ? "Delete" : "Cancel post"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

const ACTION_LABEL: Record<FailureAction, string> = { retry: "Retry", reconnect: "Reconnect", share_manually: "Share manually", fix_image: "Fix image" };

function TargetRow({ eventId, post, target: t, account, onFixImage }: { eventId: number; post: SocialPost; target: PostTarget; account: SocialAccount | null; onFixImage: () => void }) {
  const role = useSocialRole();
  const retry = useRetryTarget(eventId);
  const event = useEventDetail(eventId);
  const [sharing, setSharing] = React.useState(false);
  const chip = targetChip(post, t);

  const share = async () => {
    setSharing(true);
    try {
      let text = fillIn(t.text, { event_name: event.data?.name });
      try {
        text = (await previewPost(eventId, { platform: t.platform, text: t.text, variant_id: t.variant_id })).text_rendered || text;
      } catch {
        // The words as stored, with what the dashboard can fill: better than nothing to paste.
      }
      await shareManually({ platform: t.platform, text, imageUrl: t.image_url ?? null, filename: posterName({ slug: event.data?.slug, name: event.data?.name, id: eventId }, t.platform) });
    } finally {
      setSharing(false);
    }
  };

  const button = (a: FailureAction) => {
    switch (a) {
      case "retry":
        return role.post ? (
          <button key={a} type="button" className="btn btn-secondary btn-xs" onClick={() => retry.mutate(t.id)} disabled={retry.isPending}>
            {retry.isPending ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />} {ACTION_LABEL[a]}
          </button>
        ) : null;
      case "reconnect":
        return role.manage ? (
          <Link key={a} href="/social" className="btn btn-secondary btn-xs">
            <RefreshCwIcon className="size-3" /> Reconnect {PLATFORM_LABEL[t.platform]}
          </Link>
        ) : (
          <span key={a} className="text-ink-3 text-[11.5px]">
            Ask an owner or admin to reconnect {PLATFORM_LABEL[t.platform]}
          </span>
        );
      case "share_manually":
        return (
          <button key={a} type="button" className="btn btn-ghost btn-xs" onClick={() => void share()} disabled={sharing}>
            {sharing ? <Loader2Icon className="size-3 animate-spin" /> : <Share2Icon className="size-3" />} {ACTION_LABEL[a]}
          </button>
        );
      case "fix_image":
        return role.post && editable(post) ? (
          <button key={a} type="button" className="btn btn-secondary btn-xs" onClick={onFixImage}>
            <ImageIcon className="size-3" /> {ACTION_LABEL[a]}
          </button>
        ) : null;
    }
  };

  return (
    <li className="bg-sunken flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2" data-testid={`target-${t.id}`}>
      <PlatformMark platform={t.platform} size="sm" />
      <span className="text-ink min-w-[96px] text-[12.5px] font-medium">
        {PLATFORM_LABEL[t.platform]}
        {account?.handle ? <span className="text-ink-3 font-normal"> @{account.handle.replace(/^@/, "")}</span> : null}
      </span>
      <StatusBadge label={chip.label} tone={chip.tone} />
      {chip.detail ? <span className={cn("min-w-0 flex-1 text-[12px]", chip.tone === "destructive" ? "text-refuse" : "text-ink-3")}>{chip.detail}</span> : <span className="flex-1" />}
      <span className="flex flex-wrap items-center gap-1">
        {t.status === "posted" && t.post_url ? (
          <a href={t.post_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs text-brand">
            View post <ExternalLinkIcon className="size-3" />
          </a>
        ) : null}
        {chip.actions.map(button)}
      </span>
    </li>
  );
}

// ─── The share kit ───────────────────────────────────────────────────────

/** Each platform's text and poster, ready to post by hand: on every plan, connected or not. */
function ShareKitPanel({ eventId }: { eventId: number }) {
  const kit = useShareKit(eventId);
  const event = useEventDetail(eventId);
  if (kit.isError) return null;
  const rows = kit.data?.platforms ?? [];
  return (
    <FigurePanel className="p-4" role="region" aria-label="Share kit">
      <CardLabel>Share kit</CardLabel>
      <p className="text-ink-3 m-0 mt-1 text-[12.5px]">The text and the right poster for each platform, to post by hand from your own profile or the club&apos;s.</p>
      {!kit.data ? (
        <div className="mt-3 grid gap-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-ink-3 m-0 mt-3 text-[12.5px]">Publish the event to get its share kit.</p>
      ) : (
        <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.platform} className="border-line-soft flex gap-3 rounded-xl border p-3">
              {r.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- the poster on the media CDN
                <img src={r.image_url} alt="" className="bg-sunken size-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="bg-sunken grid size-16 shrink-0 place-items-center rounded-lg">
                  <PlatformMark platform={r.platform} />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-ink inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
                  <PlatformMark platform={r.platform} size="sm" /> {PLATFORM_LABEL[r.platform]}
                </span>
                <p className="text-ink-2 m-0 line-clamp-2 text-[12px] whitespace-pre-line">{r.text}</p>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={async () => {
                      const ok = await copyText(r.text);
                      if (ok) toast.success(`${PLATFORM_LABEL[r.platform]} text copied`);
                      else toast.error("Couldn't copy. Select the text and copy by hand.");
                    }}
                  >
                    <CopyIcon className="size-3" /> Copy text
                  </button>
                  {r.image_url ? (
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => void downloadImage(r.image_url!, posterName({ slug: event.data?.slug, name: event.data?.name, id: eventId }, r.platform))}>
                      <DownloadIcon className="size-3" /> Poster
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </FigurePanel>
  );
}
