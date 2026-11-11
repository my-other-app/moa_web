"use client";

import * as React from "react";
import { CopyIcon, Loader2Icon, SparklesIcon, Undo2Icon } from "lucide-react";
import { pickImage } from "@moa/app-kit";
import { useDebouncedValue } from "@moa/ui/hooks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Chip,
  Notice,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Switch,
  TabRail,
  cn,
  toast,
} from "@moa/ui";

import { useAiGate } from "@/features/ai";
import { useMyClub } from "@/features/club";
import { useEventDetail } from "@/features/events";
import { LockBadge, toastError } from "@/features/plan";

import { useDrafts, usePosters, usePreview, useRewrite, useSavePoster, useSavePost, useSocialAccounts, useSocialRole, useSocialSettings } from "../queries";
import {
  BLOCKING_WARNINGS,
  FILL_INS,
  FILL_IN_LABEL,
  IG_MAX_HASHTAGS,
  PLATFORM_LABEL,
  POST_TEMPLATES,
  SIZES_FOR,
  fillIn,
  istLabel,
  localWarnings,
  mergeWarnings,
  postable,
  textStats,
  triggerTime,
  type EventClock,
  type FillIn,
  type Platform,
  type PlatformDraft,
  type PostTemplateKey,
  type PosterSize,
  type PosterVariant,
  type SocialAccount,
  type SocialPost,
  type Trigger,
} from "../schemas";
import { PhonePreview } from "./phone-preview";
import { PlatformMark } from "./platform-mark";
import { PosterPanel, previewImageFor, type PosterSettings } from "./poster-panel";
import { TriggerPicker } from "./trigger-picker";

/**
 * The post editor: a side sheet from "Add post" or any post on the Promote
 * tab. A tab per connected account, each with its own text (counters,
 * warnings, fill-in words, AI rewrite, hashtag ideas) and its own poster;
 * a phone preview beside it that follows the tab; at the foot, when it goes
 * out, Save draft and Schedule. "Copy to all" puts this tab's text on every
 * other one.
 */
export interface EditorRequest {
  post: SocialPost | null;
  template: PostTemplateKey;
  /** Open on this platform, and on its poster when the image needs fixing. */
  platform?: Platform | null;
  poster?: boolean;
}

interface TargetDraft {
  account: SocialAccount;
  enabled: boolean;
  text: string;
  size: PosterSize;
}

/** Warnings that would make the platform refuse the post: scheduling waits until they are gone. */
const BLOCKING = BLOCKING_WARNINGS;

export function PostEditorSheet({ eventId, request, onClose }: { eventId: number; request: EditorRequest | null; onClose: () => void }) {
  return (
    <Sheet open={request !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <SheetContent side="right" className="bg-surface w-full gap-0 p-0 sm:max-w-[1060px]">
        {request ? <EditorLoader eventId={eventId} request={request} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function EditorLoader({ eventId, request, onClose }: { eventId: number; request: EditorRequest; onClose: () => void }) {
  const accounts = useSocialAccounts();
  const usable = React.useMemo(() => postable(accounts.data ?? []), [accounts.data]);
  const platforms = React.useMemo(() => [...new Set(usable.map((a) => a.platform))], [usable]);
  const drafts = useDrafts(eventId, platforms);
  const posters = usePosters(eventId);
  const event = useEventDetail(eventId);
  const draftsSettled = platforms.length === 0 || drafts.data !== undefined || drafts.isError;
  const ready = accounts.data !== undefined && draftsSettled && (posters.data !== undefined || posters.isError) && event.data !== undefined;
  const title = request.post?.name ?? POST_TEMPLATES.find((t) => t.key === request.template)?.name ?? "New post";

  if (!ready) {
    return (
      <>
        <SheetHeader className="border-line-soft border-b px-5 py-4">
          <SheetTitle className="text-ink text-[16px]">{title}</SheetTitle>
          <SheetDescription className="text-ink-3 text-[12.5px]">Drafting a post per platform from the event…</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 p-5" aria-busy="true">
          <Skeleton className="h-9 w-72 rounded-xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </>
    );
  }
  if (usable.length === 0) {
    return (
      <>
        <SheetHeader className="border-line-soft border-b px-5 py-4">
          <SheetTitle className="text-ink text-[16px]">{title}</SheetTitle>
          <SheetDescription className="text-ink-3 text-[12.5px]">No connected account to post to.</SheetDescription>
        </SheetHeader>
        <div className="p-5">
          <Notice tone="neutral" tag="Accounts">
            Connect the club&apos;s accounts under Social accounts first. The share kit on this tab works meanwhile.
          </Notice>
        </div>
      </>
    );
  }
  return <EditorForm eventId={eventId} request={request} accounts={usable} drafts={drafts.data ?? []} variants={posters.data ?? []} onClose={onClose} />;
}

function sizeOfVariant(variants: PosterVariant[], id: string | null | undefined, platform: Platform): PosterSize {
  const v = id ? variants.find((x) => x.id === id) : undefined;
  return v && SIZES_FOR[platform].includes(v.size) ? v.size : SIZES_FOR[platform][0]!;
}

function initialTargets(request: EditorRequest, accounts: SocialAccount[], drafts: PlatformDraft[], variants: PosterVariant[]): TargetDraft[] {
  return accounts.map((account) => {
    const existing = request.post?.targets.find((t) => t.account_id === account.id) ?? request.post?.targets.find((t) => t.account_id == null && t.platform === account.platform);
    const draft = drafts.find((d) => d.platform === account.platform);
    if (existing) return { account, enabled: true, text: existing.text, size: sizeOfVariant(variants, existing.variant_id, account.platform) };
    // A new post goes to every account that can send now; one waiting to be reconnected starts off (its post would be held).
    return { account, enabled: request.post === null && account.status === "connected", text: draft?.text ?? "", size: sizeOfVariant(variants, draft?.variantId, account.platform) };
  });
}

/** The clock, read when something is pressed (never during render). */
const nowMs = () => Date.now();

const DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

function EditorForm({ eventId, request, accounts, drafts, variants, onClose }: { eventId: number; request: EditorRequest; accounts: SocialAccount[]; drafts: PlatformDraft[]; variants: PosterVariant[]; onClose: () => void }) {
  const role = useSocialRole();
  const settings = useSocialSettings();
  const event = useEventDetail(eventId).data!;
  const club = useMyClub();
  const template = POST_TEMPLATES.find((t) => t.key === request.template);
  const [name, setName] = React.useState(request.post?.name ?? template?.name ?? "Post");
  const [trigger, setTrigger] = React.useState<Trigger>(request.post?.trigger ?? template?.trigger ?? { mode: "on_publish" });
  const [targets, setTargets] = React.useState<TargetDraft[]>(() => initialTargets(request, accounts, drafts, variants));
  const [active, setActive] = React.useState<string>(() => {
    const wanted = request.platform ? targets.find((t) => t.account.platform === request.platform) : undefined;
    return (wanted ?? targets.find((t) => t.enabled) ?? targets[0]!).account.id;
  });
  // Unsaved poster settings, per size: they apply to every post of that size, so they live with the sizes, not the tabs.
  const [pendingPosters, setPendingPosters] = React.useState<Partial<Record<PosterSize, PosterSettings>>>({});
  const [posterAspect, setPosterAspect] = React.useState<number | null>(null);
  const [undo, setUndo] = React.useState<Record<string, string>>({});
  const [confirmNow, setConfirmNow] = React.useState(false);
  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const posterRef = React.useRef<HTMLDivElement>(null);
  const save = useSavePost(eventId);
  const savePoster = useSavePoster(eventId);
  const rewrite = useRewrite(eventId);
  const ai = useAiGate();

  React.useEffect(() => {
    if (request.poster) posterRef.current?.scrollIntoView({ block: "center" });
  }, [request.poster]);

  const current = targets.find((t) => t.account.id === active) ?? targets[0]!;
  const platform = current.account.platform;
  const draft = drafts.find((d) => d.platform === platform);
  const variant = variants.find((v) => v.size === current.size) ?? null;
  const poster = pickImage(event.poster, ["large", "original", "medium"]);
  const link = draft?.link ?? `https://myotherapp.in/events/${event.slug ?? event.id}`;
  const start = event.event_datetime ? new Date(event.event_datetime) : null;
  const values: Partial<Record<FillIn, string>> = {
    event_name: event.name,
    date: start ? DATE.format(start) : undefined,
    time: start ? TIME.format(start) : undefined,
    venue: event.is_online ? "Online" : (event.location_name ?? undefined),
    fee: event.has_fee && event.reg_fee ? `₹${event.reg_fee}` : "Free",
    link,
  };
  const clock: EventClock = { start: event.event_datetime, duration: event.duration, regClose: event.reg_enddate, status: event.status };

  const debounced = useDebouncedValue(current.text, 500);
  const preview = usePreview(eventId, platform, debounced, variant?.id ?? null);
  const fresh = preview.data && !preview.isPlaceholderData && debounced === current.text ? preview.data : null;
  const rendered = fresh?.text_rendered || fillIn(current.text, values);
  const local = textStats(platform, rendered);
  // The server counts as the platform does (wide characters on X count twice); its count wins once it has answered.
  const serverChars = typeof fresh?.counts?.characters === "number" ? fresh.counts.characters : null;
  const stats = serverChars === null ? local : { ...local, chars: serverChars, over: serverChars > local.limit };
  const warnings = mergeWarnings(localWarnings(platform, current.text, rendered), fresh?.warnings);

  const update = (id: string, patch: Partial<TargetDraft>) => setTargets((ts) => ts.map((t) => (t.account.id === id ? { ...t, ...patch } : t)));
  const setText = (text: string) => update(current.account.id, { text });

  const insert = (word: string) => {
    const el = textRef.current;
    const at = el ? el.selectionStart : current.text.length;
    const end = el ? el.selectionEnd : current.text.length;
    const next = current.text.slice(0, at) + word + current.text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + word.length, at + word.length);
    });
  };

  const copyToAll = () => {
    const others = targets.filter((t) => t.account.id !== current.account.id && t.enabled);
    if (!others.length) return toast.info("No other platform is switched on for this post.");
    setTargets((ts) => ts.map((t) => (t.enabled ? { ...t, text: current.text } : t)));
    toast.success(`Copied to ${others.map((t) => PLATFORM_LABEL[t.account.platform]).join(", ")}`);
  };

  const doRewrite = () =>
    rewrite.mutate(
      { platform, text: current.text },
      {
        onSuccess: (text) => {
          setUndo((u) => ({ ...u, [current.account.id]: current.text }));
          setText(text);
        },
      },
    );

  const enabled = targets.filter((t) => t.enabled);
  // Each switched-on platform's problems, from what the dashboard can tell (the tab open also has the server's word).
  const problems = enabled.flatMap((t) => {
    const r = t.account.id === current.account.id ? rendered : fillIn(t.text, { ...values, link: drafts.find((d) => d.platform === t.account.platform)?.link ?? link });
    const ws = t.account.id === current.account.id ? warnings : localWarnings(t.account.platform, t.text, r);
    return ws.filter((w) => BLOCKING.has(w.code)).map((w) => ({ target: t, warning: w }));
  });
  const approval = Boolean(settings.data?.approval_required) && !role.manage;
  const live = event.status !== "draft";
  const when = triggerTime(trigger, clock);
  // The backend refuses a time already past (422 TRIGGER_IN_PAST); "when published" on a live event is now, after asking.
  const [openedAt] = React.useState(() => Date.now());
  const past = trigger.mode !== "on_publish" && when.at !== null && when.at.getTime() < openedAt - 60_000;
  const busy = save.isPending || savePoster.isPending;

  async function submit(schedule: boolean) {
    if (!enabled.length) return toast.error("Switch on at least one platform for this post.");
    if (!name.trim()) return toast.error("Give the post a name, like “Announcement”.");
    try {
      // Poster changes not saved yet go first: the post uses the size's image as it is when it goes out.
      for (const [size, s] of Object.entries(pendingPosters) as [PosterSize, PosterSettings][]) {
        if (!enabled.some((t) => t.size === size)) continue;
        await savePoster.mutateAsync({ size, body: { mode: s.mode, focus: s.mode === "crop" ? s.focus : undefined, background: s.mode === "fit" ? s.background : undefined } });
      }
      const body = {
        name: name.trim(),
        trigger,
        targets: enabled.map((t) => {
          const v = variants.find((x) => x.size === t.size);
          return { platform: t.account.platform, account_id: t.account.id, text: t.text, ...(v ? { variant_id: v.id } : {}) };
        }),
      };
      const saved = await save.mutateAsync({ postId: request.post?.id ?? null, body, schedule });
      toast.success(
        !schedule
          ? "Saved as a draft"
          : saved.status === "needs_approval"
            ? "Sent for approval. An owner or admin approves it on this tab."
            : trigger.mode === "on_publish" && !live
              ? "Scheduled: it goes out when the event is published"
              : when.at && when.at.getTime() > nowMs() + 60_000
                ? `Scheduled for ${istLabel(when.at)}`
                : "Scheduled: going out now",
      );
      onClose();
    } catch (error) {
      toastError(error);
    }
  }

  const goesNow = trigger.mode === "on_publish" && live;
  const scheduleLabel = approval ? "Send for approval" : "Schedule";
  const accountName = current.account.name ?? club.data?.name ?? PLATFORM_LABEL[platform];
  const multi = (p: Platform) => targets.filter((t) => t.account.platform === p).length > 1;

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => e.preventDefault()} aria-label="Post editor">
      <SheetHeader className="border-line-soft gap-1 border-b px-5 py-3.5">
        <SheetTitle className="sr-only">{request.post ? `Edit ${request.post.name}` : "New post"}</SheetTitle>
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <label htmlFor="post-name" className="eyebrow">
            Post
          </label>
          <input id="post-name" className="input h-9 max-w-[280px] text-[15px] font-semibold" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        <SheetDescription className="text-ink-3 text-[12.5px]">Each platform gets its own words and its own poster. Fill-in words are filled at the moment it goes out.</SheetDescription>
      </SheetHeader>

      <div className="px-5 pt-1">
        <TabRail
          label="Platforms"
          value={current.account.id}
          onChange={setActive}
          items={targets.map((t) => ({
            key: t.account.id,
            label: (
              <span className={cn("inline-flex items-center gap-1.5", !t.enabled && "opacity-50")}>
                <PlatformMark platform={t.account.platform} size="sm" />
                {PLATFORM_LABEL[t.account.platform]}
                {multi(t.account.platform) && t.account.handle ? <span className="text-ink-3">@{t.account.handle}</span> : null}
                {problems.some((p) => p.target.account.id === t.account.id) ? <span aria-label="has a problem" className="bg-refuse size-1.5 rounded-full" /> : null}
              </span>
            ),
          }))}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <label className="text-ink-2 flex items-center gap-2.5 text-[13px]">
            <Switch checked={current.enabled} onCheckedChange={(on) => update(current.account.id, { enabled: on })} aria-label={`Post to ${PLATFORM_LABEL[platform]}`} />
            Post to {PLATFORM_LABEL[platform]} as <span className="text-ink font-medium">{accountName}</span>
            {current.account.status === "needs_reconnect" ? <span className="text-caution text-[12px] font-medium">· needs reconnecting: it will be held</span> : null}
          </label>

          <div className={cn("flex flex-col gap-1.5", !current.enabled && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="post-text" className="eyebrow">
                Text
              </label>
              <div className="flex flex-wrap items-center gap-1">
                {ai.visible ? (
                  <button type="button" className="btn btn-ghost btn-xs text-brand" onClick={ai.locked ? ai.prompt : doRewrite} disabled={rewrite.isPending || !current.text.trim()}>
                    {rewrite.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <SparklesIcon className="size-3.5" />} Rewrite for {PLATFORM_LABEL[platform]}
                    {ai.locked ? <LockBadge lock={ai.lock} /> : null}
                  </button>
                ) : null}
                {undo[current.account.id] !== undefined ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setText(undo[current.account.id]!);
                      setUndo(({ [current.account.id]: _gone, ...rest }) => rest);
                    }}
                  >
                    <Undo2Icon className="size-3.5" /> Undo rewrite
                  </button>
                ) : null}
                {targets.length > 1 ? (
                  <button type="button" className="btn btn-ghost btn-xs" onClick={copyToAll}>
                    <CopyIcon className="size-3.5" /> Copy to all
                  </button>
                ) : null}
              </div>
            </div>
            <textarea
              id="post-text"
              ref={textRef}
              className="input min-h-[170px] w-full resize-y py-2 text-[13.5px] leading-[1.55]"
              value={current.text}
              onChange={(e) => setText(e.target.value)}
              aria-describedby="post-counts"
              aria-invalid={stats.over || undefined}
            />
            <div id="post-counts" className="text-ink-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums" aria-live="polite">
              <span className={cn(stats.over && "text-refuse font-semibold")} data-testid="char-count">
                {stats.chars.toLocaleString("en-IN")} / {stats.limit.toLocaleString("en-IN")} characters
              </span>
              {platform === "instagram" ? (
                <span className={cn(stats.hashtags > IG_MAX_HASHTAGS && "text-refuse font-semibold")} data-testid="hashtag-count">
                  {stats.hashtags} / {IG_MAX_HASHTAGS} hashtags
                </span>
              ) : stats.hashtags ? (
                <span>{stats.hashtags} hashtags</span>
              ) : null}
              {platform === "x" ? <span>links count as 23</span> : null}
            </div>
            {warnings.length ? (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Warnings">
                {warnings.map((w) => (
                  <li key={w.code}>
                    <Notice
                      tone={BLOCKING.has(w.code) ? "refuse" : "caution"}
                      action={
                        w.fix ? (
                          <button type="button" className="btn btn-secondary btn-xs" onClick={() => setText(w.fix!.apply(current.text))}>
                            {w.fix.label}
                          </button>
                        ) : undefined
                      }
                    >
                      {w.message}
                    </Notice>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">Fill-in words</span>
            <div role="group" aria-label="Fill-in words" className="flex flex-wrap gap-1.5">
              {FILL_INS.map((w) => (
                <Chip key={w} onClick={() => insert(`{${w}}`)}>
                  {FILL_IN_LABEL[w]}
                </Chip>
              ))}
            </div>
          </div>

          {draft?.hashtags.length ? (
            <div className="flex flex-col gap-1.5">
              <span className="eyebrow">Hashtag ideas</span>
              <div role="group" aria-label="Hashtag ideas" className="flex flex-wrap gap-1.5">
                {draft.hashtags.map((h) => {
                  const used = new RegExp(`(^|\\s)#${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i").test(current.text);
                  return (
                    <Chip key={h} active={used} onClick={() => (used ? null : setText(`${current.text.trimEnd()}${current.text.trim() ? " " : ""}#${h}`))}>
                      #{h}
                    </Chip>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div ref={posterRef} className="border-line-soft border-t pt-3.5">
            <PosterPanel
              eventId={eventId}
              platform={platform}
              size={current.size}
              onSize={(size) => update(current.account.id, { size })}
              variants={variants}
              poster={poster}
              pending={pendingPosters[current.size] ?? null}
              onPending={(s) =>
                setPendingPosters((p) => {
                  const { [current.size]: _old, ...rest } = p;
                  return s ? { ...rest, [current.size]: s } : rest;
                })
              }
              onPosterAspect={setPosterAspect}
              canEdit={role.post}
            />
          </div>
        </div>

        <div className="lg:sticky lg:top-0 lg:self-start">
          <PhonePreview
            platform={platform}
            account={{ name: accountName, handle: current.account.handle, picture: current.account.picture_url }}
            text={rendered}
            image={previewImageFor(current.size, variant, poster, pendingPosters[current.size] ?? null, posterAspect)}
          />
        </div>
      </div>

      <SheetFooter className="border-line-soft flex-col items-stretch gap-3 border-t px-5 py-3 sm:flex-row sm:items-end sm:justify-between">
        <TriggerPicker value={trigger} onChange={setTrigger} clock={clock} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {problems.length ? (
            <span className="text-refuse max-w-[260px] text-[12px]" role="status">
              Fix {problems.map((p) => PLATFORM_LABEL[p.target.account.platform]).filter((v, i, a) => a.indexOf(v) === i).join(" and ")} first
            </span>
          ) : past ? (
            <span className="text-refuse max-w-[260px] text-[12px]" role="status">
              That time has passed. Pick a later one.
            </span>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          {request.post === null || request.post.status === "draft" ? (
            <button type="button" className="btn btn-secondary" onClick={() => void submit(false)} disabled={busy}>
              {busy && !save.variables?.schedule ? <Loader2Icon className="size-4 animate-spin" /> : null} Save draft
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => (goesNow && !approval ? setConfirmNow(true) : void submit(true))} disabled={busy || problems.length > 0 || past}>
            {busy && save.variables?.schedule ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {request.post && request.post.status !== "draft" && request.post.status !== "paused" ? "Save changes" : scheduleLabel}
          </button>
        </div>
      </SheetFooter>

      <AlertDialog open={confirmNow} onOpenChange={setConfirmNow}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post it now?</AlertDialogTitle>
            <AlertDialogDescription>
              The event is already live, so “when published” means now. It goes to{" "}
              {enabled.map((t) => PLATFORM_LABEL[t.account.platform]).join(", ")} as soon as you confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmNow(false);
                void submit(true);
              }}
            >
              Post now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
