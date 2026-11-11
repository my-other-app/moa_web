"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon, MegaphoneIcon } from "lucide-react";
import { Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, toast } from "@moa/ui";

import { useAnnounce, useEventPosts, useSocialAccounts, useSocialPlatforms, useSocialRole, useSocialSettings } from "../queries";
import { PLATFORM_LABEL, type SocialAccount } from "../schemas";
import { PlatformMark } from "./platform-mark";

/** The address the publish flows land on after publishing: the event, asking "Announce it?". */
export const ANNOUNCE_PARAM = "announce";
export const announceHref = (eventId: number) => `/events/${eventId}?${ANNOUNCE_PARAM}=1`;

/** Accounts the publish step offers: connected (not waiting to be reconnected), on a platform the club may post to. */
export function announceable(accounts: SocialAccount[], available: Set<string>): SocialAccount[] {
  return accounts.filter((a) => a.status === "connected" && available.has(a.platform));
}

/**
 * The publish step's last question. Right after an event is published (the
 * publish flows add `?announce=1`), a club with connected accounts is asked
 * "Announce it?" with those accounts ticked: one click makes the standard
 * announcement (now) and reminder (two days before) from the drafts; "Edit
 * posts" opens the editor on the Promote tab; "Not now" leaves it.
 *
 * Asked only when it can do something: the API has social posting, the role
 * may post, an account is connected, and the event has no posts yet. Any of
 * those false, the question quietly goes away.
 */
export function AnnouncePrompt({ eventId }: { eventId: number }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wanted = params.get(ANNOUNCE_PARAM) === "1";
  const role = useSocialRole();
  // Asked once the server has said who is signed in: door staff are never asked.
  const ask = wanted && role.known && role.post;
  const platforms = useSocialPlatforms(ask);
  const on = platforms.data != null;
  const accounts = useSocialAccounts(wanted && on);
  const posts = useEventPosts(eventId, wanted && on);
  const settings = useSocialSettings(wanted && on);
  const [dismissed, setDismissed] = React.useState(false);

  const available = React.useMemo(() => new Set((platforms.data ?? []).filter((p) => p.available).map((p) => p.platform as string)), [platforms.data]);
  const offer = announceable(accounts.data ?? [], available);
  const settled = !wanted || (role.known && !role.post) || platforms.data === null || platforms.isError || accounts.isError || posts.isError || (accounts.data !== undefined && posts.data !== undefined);
  const show = ask && !dismissed && on && offer.length > 0 && posts.data !== undefined && posts.data.posts.length === 0;

  // Nothing to ask (no accounts, posts already made, a role that can't post, an older API): take the flag off the address.
  React.useEffect(() => {
    if (wanted && settled && !show && !dismissed) router.replace(pathname);
  }, [wanted, settled, show, dismissed, router, pathname]);

  if (!show) return null;
  return (
    <AnnounceDialog
      eventId={eventId}
      accounts={offer}
      approval={Boolean(settings.data?.approval_required) && !role.manage}
      onClose={(next) => {
        setDismissed(true);
        router.replace(next ?? pathname);
      }}
    />
  );
}

export function AnnounceDialog({ eventId, accounts, approval, onClose }: { eventId: number; accounts: SocialAccount[]; approval: boolean; onClose: (next?: string) => void }) {
  const [picked, setPicked] = React.useState<Set<number>>(() => new Set(accounts.map((a) => a.id)));
  const announce = useAnnounce(eventId);
  const chosen = accounts.filter((a) => picked.has(a.id));
  const toggle = (id: number, on: boolean) => setPicked((s) => {
    const next = new Set(s);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });

  const go = () =>
    announce.mutate(
      { platforms: [...new Set(chosen.map((a) => a.platform))], account_ids: chosen.map((a) => a.id) },
      {
        onSuccess: () => {
          toast.success(approval ? "Sent for approval. Once an owner or admin approves, the announcement goes out and the reminder follows 2 days before." : "Announced. The reminder goes out 2 days before the event.");
          onClose(`/events/${eventId}/promote`);
        },
      },
    );

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <span className="bg-brand-soft text-brand mb-1 grid size-10 place-items-center rounded-xl">
            <MegaphoneIcon className="size-4" />
          </span>
          <DialogTitle>Announce it?</DialogTitle>
          <DialogDescription>
            The event is live. Post the announcement now on the accounts below, and a reminder 2 days before. Each post is drafted from the event, with its own poster and tracking link.
          </DialogDescription>
        </DialogHeader>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Accounts">
          {accounts.map((a) => (
            <li key={a.id}>
              <label className="border-line hover:bg-sunken flex cursor-pointer items-center gap-3 rounded-[var(--radius-field)] border px-3 py-2 text-[13px]">
                <Checkbox checked={picked.has(a.id)} onCheckedChange={(v) => toggle(a.id, v === true)} aria-label={`${PLATFORM_LABEL[a.platform]}${a.handle ? ` @${a.handle}` : ""}`} />
                <PlatformMark platform={a.platform} size="sm" />
                <span className="text-ink min-w-0 flex-1 truncate font-medium">{PLATFORM_LABEL[a.platform]}</span>
                <span className="text-ink-3 truncate text-[12px]">{a.handle ? `@${a.handle.replace(/^@/, "")}` : a.name}</span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter className="gap-2 sm:justify-between">
          <button type="button" className="btn btn-ghost" onClick={() => onClose()} disabled={announce.isPending}>
            Not now
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => onClose(`/events/${eventId}/promote?compose=announcement`)} disabled={announce.isPending}>
              Edit posts
            </button>
            <button type="button" className="btn btn-primary" onClick={go} disabled={announce.isPending || chosen.length === 0}>
              {announce.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} {approval ? "Send for approval" : "Announce it"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
