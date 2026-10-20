"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  BotIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  CheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  IndianRupeeIcon,
  Loader2Icon,
  MapPinIcon,
  MegaphoneIcon,
  PlugZapIcon,
  RefreshCwIcon,
  SmartphoneIcon,
  UsersIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react";
import { ApiError } from "@moa/api";
import { formatDateTime, formatWindow, pickImage, timeUntil } from "@moa/app-kit";
import { FigurePanel, Notice, Skeleton, StatusBadge, cn, type StatusTone } from "@moa/ui";

import { PRODUCT } from "@/components/auth-frame";
import { useEventDetail } from "@/features/events";

import { useDecide, usePendingAction } from "../queries";
import {
  ACTION_NOT_FOUND,
  AUDIENCE_LABEL,
  TARGET_CHANGED,
  askLine,
  isMcpOff,
  personLabel,
  resultLine,
  upgradeHref,
  type ActionStatus,
  type AnnouncementTarget,
  type EventTarget,
  type PendingAction,
} from "../schemas";

/**
 * /confirm/{token}: where an assistant's "Confirm in dashboard" link lands.
 *
 * An assistant (Claude, ChatGPT…) can draft an event or an announcement but
 * never publish or send one; it asks, and this page is the asking. It says,
 * plainly enough for a volunteer opening it from a chat app on a phone,
 * what will happen, to what, who asked and until when, then offers Approve
 * and Turn down to someone whose role may decide. Once decided, expired or
 * replaced, it says what became of it instead.
 */
export function ConfirmPage({ token }: { token: string }) {
  const q = usePendingAction(token);
  const router = useRouter();
  const signIn = `/login?next=${encodeURIComponent(`/confirm/${token}`)}`;
  const unauthorised = q.error instanceof ApiError && q.error.isUnauthorized;

  // A session that ran out between the link and the page: sign in, then come back here.
  React.useEffect(() => {
    if (unauthorised) router.replace(signIn);
  }, [unauthorised, router, signIn]);

  return (
    <main className="bg-canvas min-h-dvh px-4 pt-4 pb-32 sm:px-6 sm:pt-8 sm:pb-12">
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/brand/icon.png" alt="" width={32} height={32} className="size-8 rounded-[9px]" priority unoptimized />
            <span className="leading-tight">
              <span className="text-ink block text-[14px] font-semibold tracking-[-0.01em]">{PRODUCT}</span>
              <span className="eyebrow text-ink-3 block">Clubs</span>
            </span>
          </Link>
          <Link href="/" className="btn btn-ghost btn-sm">
            Open the dashboard
          </Link>
        </header>

        {q.isPending || unauthorised ? <Loading /> : q.isError ? <LoadError error={q.error} onRetry={() => void q.refetch()} /> : <Request token={token} action={q.data} />}
      </div>
    </main>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <p className="sr-only" role="status">
        Loading the request…
      </p>
      <Skeleton className="h-6 w-40 rounded-full" />
      <Skeleton className="h-9 w-4/5" />
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
    </div>
  );
}

// ─── When the request cannot be read ─────────────────────────────────────

function Stop({
  icon: Icon,
  tone = "neutral",
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  tone?: "neutral" | "caution" | "refuse";
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <FigurePanel className="flex flex-col items-start gap-3 p-5 sm:p-6" role="region" aria-label={title}>
      <span
        className={cn("grid size-11 place-items-center rounded-full", tone === "caution" ? "bg-caution-soft text-caution" : tone === "refuse" ? "bg-refuse-soft text-refuse" : "bg-sunken text-ink-2")}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h1 className="text-ink m-0 text-[20px] leading-[1.25] font-semibold tracking-[-0.015em]">{title}</h1>
      <div className="text-ink-2 text-[14px] leading-[1.55]">{children}</div>
      {action}
    </FigurePanel>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (isMcpOff(error))
    return (
      <Stop icon={PlugZapIcon} title="AI connections are turned off">
        MyOtherApp has connected assistants switched off right now, so nothing they ask for can be approved. Nothing has been published or sent.
      </Stop>
    );
  if (error instanceof ApiError && error.errorCode === ACTION_NOT_FOUND)
    return (
      <Stop icon={AlertTriangleIcon} tone="caution" title="This link doesn't work">
        It may be cut short, or it&apos;s for another club. If you&apos;re on more than one club&apos;s team, sign in to the club the assistant works for, then open the link again.
      </Stop>
    );
  if (error instanceof ApiError && error.errorCode === "NOT_A_CLUB")
    return (
      <Stop icon={AlertTriangleIcon} tone="caution" title="This link is for a club's team">
        You&apos;re signed in with an account that doesn&apos;t belong to a club. Sign in with the club&apos;s login, or your own team login, to approve it.
      </Stop>
    );
  if (error instanceof ApiError && error.status === 429)
    return (
      <Stop icon={ClockIcon} title="Too many tries" action={<RetryButton onRetry={onRetry} />}>
        Wait a minute, then try again.
      </Stop>
    );
  return (
    <Stop icon={AlertTriangleIcon} tone="refuse" title="Couldn't load this request" action={<RetryButton onRetry={onRetry} />}>
      {error instanceof Error && error.message ? error.message : "Check your connection and try again."}
    </Stop>
  );
}

const RetryButton = ({ onRetry }: { onRetry: () => void }) => (
  <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
    <RefreshCwIcon className="size-3.5" /> Try again
  </button>
);

// ─── The request ─────────────────────────────────────────────────────────

const STATUS_BADGE: Record<ActionStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "Waiting for approval", tone: "warning" },
  confirmed: { label: "Approved", tone: "success" },
  rejected: { label: "Turned down", tone: "default" },
  expired: { label: "Expired", tone: "default" },
  superseded: { label: "Replaced", tone: "default" },
  failed: { label: "Couldn't be done", tone: "destructive" },
};

/** A decision the server refused, in the club's words. */
function refusalText(error: unknown): { text: string; plan?: boolean; off?: boolean } {
  if (isMcpOff(error)) return { text: "AI connections are turned off right now, so this can't be approved. Nothing has been published or sent.", off: true };
  if (!(error instanceof ApiError)) return { text: "That didn't go through. Check your connection and try again." };
  switch (error.errorCode) {
    case "ROLE_FORBIDDEN":
      return { text: "Your role can't approve this. Ask an admin or the club's owner." };
    case "PLAN_LIMIT_REACHED":
      return { text: "Your plan's announcements for this month are used up. Upgrade, then come back and approve: the request is still waiting.", plan: true };
    case "ACTION_DECIDED":
      return { text: "Someone has already decided this one. Here is what happened." };
    case "ACTION_EXPIRED":
      return { text: "This request expired before it was approved." };
  }
  if ((TARGET_CHANGED as readonly string[]).includes(error.errorCode ?? "")) return { text: `${error.message.replace(/\.$/, "")}. It changed while this was waiting, so nothing was done.` };
  if (error.status === 429) return { text: "Too many tries. Wait a minute, then try again." };
  return { text: error.message || "That didn't go through. Try again." };
}

function Request({ token, action: a }: { token: string; action: PendingAction }) {
  const decide = useDecide(token);
  const [choice, setChoice] = React.useState<"confirm" | "reject" | null>(null);
  const outcomeRef = React.useRef<HTMLHeadingElement>(null);
  const refused = decide.isError && !(decide.error instanceof ApiError && decide.error.isUnauthorized) ? refusalText(decide.error) : null;
  const router = useRouter();
  const pending = a.status === "pending";
  const showButtons = pending && a.can_decide && !refused?.off;

  React.useEffect(() => {
    if (decide.error instanceof ApiError && decide.error.isUnauthorized) router.replace(`/login?next=${encodeURIComponent(`/confirm/${token}`)}`);
  }, [decide.error, router, token]);

  const go = (d: "confirm" | "reject") => {
    setChoice(d);
    decide.mutate(d, {
      // The outcome replaces the buttons: take focus there, so it is what is read next.
      onSuccess: () => requestAnimationFrame(() => outcomeRef.current?.focus()),
    });
  };

  const badge = STATUS_BADGE[a.status];
  const refusedNotice = refused ? (
    <Notice
      tone={refused.plan ? "caution" : "refuse"}
      tag={refused.plan ? "Plan" : "Not done"}
      action={
        refused.plan ? (
          <Link href={upgradeHref(decide.error)} className="btn btn-secondary btn-sm">
            See plans
          </Link>
        ) : null
      }
    >
      {refused.text}
    </Notice>
  ) : null;
  // The refusal notice is an alert of its own; this only says the wait.
  const live = decide.isPending ? (choice === "confirm" ? "Approving…" : "Turning it down…") : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="bg-brand-soft text-brand inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium">
            <BotIcon className="size-3.5" aria-hidden="true" /> {pending ? `${a.requested.app} is asking` : `From ${a.requested.app}`}
          </span>
          <StatusBadge label={badge.label} tone={badge.tone} />
        </div>
        <h1 className="text-ink m-0 text-[24px] leading-[1.2] font-semibold tracking-[-0.02em] text-balance sm:text-[28px]">{a.title}</h1>
        {pending ? <p className="text-ink-2 m-0 text-[15px] leading-[1.5]">{askLine(a)}</p> : null}
      </div>

      {/* Decided, expired or replaced: what became of it comes first, then what it was about. */}
      {!pending ? <Outcome a={a} headingRef={outcomeRef} /> : null}

      {a.target?.type === "event" ? <EventCard event={a.target} /> : a.target?.type === "announcement" ? <AnnouncementCard note={a.target} /> : <GoneCard kind={a.kind} />}

      {pending && a.effects.length ? (
        <FigurePanel className="p-4 sm:p-5" role="region" aria-label="What approving does">
          <h2 className="eyebrow m-0">If you approve</h2>
          <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0">
            {a.effects.map((e) => (
              <li key={e} className="text-ink flex items-start gap-2.5 text-[14px] leading-[1.5]">
                <CheckIcon className="text-brand mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </FigurePanel>
      ) : null}

      <RequestFacts a={a} />

      {pending && !a.can_decide ? (
        <Notice tone="neutral" tag="Can't decide">
          {a.cannot_decide_reason ?? "You can't approve this one. Ask an admin or the club's owner."}
        </Notice>
      ) : null}

      {/* With the buttons gone, the refusal says why here; with them, it sits on their bar (below). */}
      {refused && !showButtons ? refusedNotice : null}

      <p className="sr-only" role="status" aria-live="polite">
        {live}
      </p>

      {/* Room under the content for the phone's bar when it carries a refusal too. */}
      {showButtons && refused ? <div aria-hidden="true" className="h-36 sm:hidden" /> : null}

      {showButtons ? (
        <div className="border-line-soft bg-surface/95 fixed inset-x-0 bottom-0 z-20 border-t px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-sm sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          {/* On a phone the bar is where the tap was: why it didn't go through shows right above the buttons. */}
          {refused ? <div className="mx-auto mb-2.5 w-full max-w-[620px] sm:mb-3">{refusedNotice}</div> : null}
          <div className="mx-auto flex w-full max-w-[620px] gap-2.5 sm:justify-end">
            <button type="button" className="btn btn-secondary btn-lg flex-1 sm:flex-none" disabled={decide.isPending} onClick={() => go("reject")}>
              {decide.isPending && choice === "reject" ? <Loader2Icon className="size-4 animate-spin" /> : <XCircleIcon className="size-4" />} Turn down
            </button>
            <button type="button" className="btn btn-primary btn-lg flex-[1.4] sm:flex-none" disabled={decide.isPending} onClick={() => go("confirm")}>
              {decide.isPending && choice === "confirm" ? <Loader2Icon className="size-4 animate-spin" /> : <CheckCircle2Icon className="size-4" />}{" "}
              {decide.isPending && choice === "confirm" ? "Approving…" : "Approve"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── What it is about ────────────────────────────────────────────────────

/** A dashboard address the server wrote absolute, as a path here (so it works on any of the dashboard's hosts). */
function localPath(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname;
  } catch {
    return url.startsWith("/") ? url : null;
  }
}

function Fact({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="text-ink flex items-start gap-2 text-[13.5px] leading-[1.45]">
      <Icon className="text-ink-3 mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function EventCard({ event: e }: { event: EventTarget }) {
  // The poster, when the event's own page has one; the card reads the same without it.
  const detail = useEventDetail(e.id);
  const poster = pickImage(detail.data?.poster ?? null, ["medium", "large", "thumbnail", "original"]);
  const dash = localPath(e.dashboard_url);
  return (
    <FigurePanel className="overflow-hidden p-0" role="region" aria-label="The event">
      <div className="flex gap-4 p-4 sm:p-5">
        <div className="bg-sunken relative aspect-[4/5] w-[84px] shrink-0 self-start overflow-hidden rounded-xl sm:w-[112px]">
          {poster ? (
            <Image src={poster} alt={`Poster for ${e.name}`} fill sizes="112px" className="object-cover" unoptimized />
          ) : (
            <CalendarDaysIcon className="text-ink-3 absolute inset-0 m-auto size-6" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow">Event</span>
            {e.deleted ? (
              <StatusBadge label="Deleted" tone="destructive" />
            ) : (
              <StatusBadge label={e.status === "draft" ? "Draft" : e.status[0]!.toUpperCase() + e.status.slice(1)} tone={e.status === "draft" ? "default" : "success"} />
            )}
          </div>
          <h2 className="text-ink m-0 mt-1 text-[17px] leading-[1.3] font-semibold tracking-[-0.01em] break-words">{e.name}</h2>
          <ul className="m-0 mt-2.5 flex list-none flex-col gap-1.5 p-0">
            <Fact icon={CalendarDaysIcon}>{e.starts_at ? formatWindow(e.starts_at, null) : "No date yet"}</Fact>
            <Fact icon={MapPinIcon}>{e.online ? "Online" : e.venue || "No venue yet"}</Fact>
            <Fact icon={IndianRupeeIcon}>
              {e.paid && e.fee ? `₹${e.fee.toLocaleString("en-IN")} entry` : "Free entry"}
              {" · "}
              {e.capacity ? `${e.capacity.toLocaleString("en-IN")} places` : "No limit on places"}
            </Fact>
          </ul>
        </div>
      </div>
      {dash ? (
        <div className="border-line-soft flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2.5 sm:px-5">
          <Link href={dash} className="text-brand inline-flex items-center gap-1 text-[13px] font-medium underline-offset-2 hover:underline">
            Check the whole event in the dashboard
          </Link>
        </div>
      ) : null}
    </FigurePanel>
  );
}

function AnnouncementCard({ note: n }: { note: AnnouncementTarget }) {
  return (
    <FigurePanel className="p-4 sm:p-5" role="region" aria-label="The announcement">
      <div className="flex items-center gap-1.5">
        <MegaphoneIcon className="text-ink-3 size-3.5" aria-hidden="true" />
        <span className="eyebrow">Announcement{n.event ? ` · ${n.event.name}` : ""}</span>
      </div>
      {/* As the phone shows it. Written by an assistant: plain text only. */}
      <div className="bg-sunken mt-3 rounded-[18px] p-3">
        <div className="bg-surface shadow-card rounded-2xl p-3.5">
          <p className="text-ink m-0 text-[14.5px] font-semibold break-words">{n.title}</p>
          <p className="text-ink-2 m-0 mt-1 text-[13.5px] leading-[1.5] break-words whitespace-pre-wrap">{n.body}</p>
        </div>
      </div>
      <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
        <Fact icon={UsersIcon}>
          To: {AUDIENCE_LABEL[n.audience]}
          {n.event ? ` of “${n.event.name}”` : ""}
        </Fact>
        <Fact icon={SmartphoneIcon}>
          Reaches {n.people.toLocaleString("en-IN")} {n.people === 1 ? "person" : "people"}, {n.reachable.toLocaleString("en-IN")} with the app
        </Fact>
      </ul>
    </FigurePanel>
  );
}

function GoneCard({ kind }: { kind: PendingAction["kind"] }) {
  return (
    <FigurePanel className="text-ink-2 p-4 text-[13.5px] sm:p-5" role="region" aria-label={kind === "publish_event" ? "The event" : "The announcement"}>
      {kind === "publish_event" ? "The event this was about no longer exists." : "The announcement draft this was about no longer exists."}
    </FigurePanel>
  );
}

// ─── Who asked, and until when ───────────────────────────────────────────

function RequestFacts({ a }: { a: PendingAction }) {
  const [now] = React.useState(() => new Date());
  const rows: { k: string; v: React.ReactNode }[] = [
    {
      k: "Asked by",
      v: (
        <>
          {a.requested.app}, for {personLabel(a.requested.by)}
          {a.requested.at ? <span className="text-ink-3"> · {formatDateTime(a.requested.at)}</span> : null}
        </>
      ),
    },
  ];
  if (a.status === "pending" && a.expires_at)
    rows.push({
      k: "Expires",
      v: (
        <>
          in {timeUntil(a.expires_at, now)} <span className="text-ink-3">· {formatDateTime(a.expires_at)}</span>
        </>
      ),
    });
  return (
    <dl className="m-0 grid gap-x-4 gap-y-1.5 px-1 text-[13px] sm:grid-cols-[max-content_1fr]">
      {rows.map((r) => (
        <React.Fragment key={r.k}>
          <dt className="eyebrow sm:pt-0.5">{r.k}</dt>
          <dd className="text-ink m-0">{r.v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

// ─── What became of it ───────────────────────────────────────────────────

const OUTCOME: Record<Exclude<ActionStatus, "pending">, { icon: LucideIcon; title: string; tone: "admit" | "neutral" | "caution" | "refuse" }> = {
  confirmed: { icon: CheckCircle2Icon, title: "Approved", tone: "admit" },
  rejected: { icon: XCircleIcon, title: "Turned down", tone: "neutral" },
  failed: { icon: AlertTriangleIcon, title: "This couldn't be done", tone: "refuse" },
  expired: { icon: ClockIcon, title: "This request expired", tone: "caution" },
  superseded: { icon: RefreshCwIcon, title: "A newer request replaced this one", tone: "neutral" },
};

const TONE_CLASS = {
  admit: "bg-admit-soft text-admit",
  neutral: "bg-sunken text-ink-2",
  caution: "bg-caution-soft text-caution",
  refuse: "bg-refuse-soft text-refuse",
} as const;

function Outcome({ a, headingRef }: { a: PendingAction; headingRef: React.Ref<HTMLHeadingElement> }) {
  const o = OUTCOME[a.status as Exclude<ActionStatus, "pending">];
  const line =
    a.status === "expired"
      ? "Nothing was done. Ask the assistant again; it will send you a new link."
      : a.status === "superseded"
        ? "Nothing was done with this one. Open the newest link the assistant gave you."
        : resultLine(a);
  const r = a.result ?? {};
  const publicUrl = typeof r.public_url === "string" ? r.public_url : a.target?.type === "event" && a.status === "confirmed" ? a.target.public_url : null;
  const eventId = typeof r.event_id === "number" ? r.event_id : null;
  return (
    <FigurePanel className="flex flex-col gap-3 p-4 sm:p-5" role="region" aria-label="What happened">
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", TONE_CLASS[o.tone])}>
          <o.icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 ref={headingRef} tabIndex={-1} className="text-ink m-0 text-[17px] font-semibold tracking-[-0.01em] outline-none">
            {o.title}
          </h2>
          {line ? <p className="text-ink-2 m-0 mt-0.5 text-[14px] leading-[1.5]">{line}</p> : null}
          {a.decided?.at ? (
            <p className="text-ink-3 m-0 mt-1 text-[12.5px]">
              {a.status === "failed" ? "Tried" : a.status === "confirmed" ? "Approved" : "Turned down"} by {personLabel(a.decided.by)} · {formatDateTime(a.decided.at)}
            </p>
          ) : null}
        </div>
      </div>
      {a.status === "confirmed" && (publicUrl || eventId) ? (
        <div className="flex flex-wrap gap-2">
          {publicUrl ? (
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
              <ExternalLinkIcon className="size-3.5" /> See the public page
            </a>
          ) : null}
          {eventId ? (
            <Link href={`/events/${eventId}`} className="btn btn-ghost btn-sm">
              Open the event
            </Link>
          ) : null}
        </div>
      ) : null}
    </FigurePanel>
  );
}
