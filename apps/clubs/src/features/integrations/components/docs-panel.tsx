"use client";

import * as React from "react";
import { BookOpenIcon, ExternalLinkIcon, Loader2Icon, Share2Icon, Trash2Icon } from "lucide-react";
import { formatDate, formatDateTime, relativeTime } from "@moa/app-kit";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FigurePanel,
  Notice,
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
} from "@moa/ui";

import { docsTab, useDocsLinks, useOpenDocs, useRevokeDocsLink, useShareDocs } from "../queries";
import { DOCS_LABEL_MAX, DOCS_SELF_DAYS, DOCS_SHARE_DAYS, DOCS_SHARE_WARNING, docsLinkName, docsLinkStatus, personLabel, type DocsLink, type DocsLinkCreated } from "../schemas";
import { SecretOnce } from "./parts";

const STATUS_BADGE = {
  active: { label: "Working", tone: "success" },
  expired: { label: "Expired", tone: "default" },
  revoked: { label: "Revoked", tone: "default" },
} as const;

/**
 * Settings → Integrations → Developer docs. The guides, API reference and
 * Postman file are private: they open through a link made here. "Open
 * developer docs" makes one for the person asking (7 days) and opens it;
 * "Share with your developer" makes one for 30 days and shows it once to
 * copy. Every link is listed, and any that still works can be revoked.
 *
 * Only for a club with API access; on an API without docs links the card
 * isn't there.
 */
export function DocsPanel() {
  const links = useDocsLinks();
  const open = useOpenDocs();
  const [sharing, setSharing] = React.useState(false);
  const [showEnded, setShowEnded] = React.useState(false);
  const [now] = React.useState(() => new Date());

  if (links.data === null) return null;
  const list = links.data ?? [];
  const working = list.filter((l) => docsLinkStatus(l, now) === "active");
  const ended = list.filter((l) => docsLinkStatus(l, now) !== "active");

  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Developer docs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[62ch] min-w-0">
          <CardLabel>Developer docs</CardLabel>
          <p className="text-ink-3 m-0 mt-1.5 text-[12.5px] leading-[1.5]">
            The guides, API reference and Postman file are private. Open them yourself with a link that lasts {DOCS_SELF_DAYS} days, or share one with your developer that lasts{" "}
            {DOCS_SHARE_DAYS} days.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSharing(true)}>
            <Share2Icon className="size-3.5" /> Share with your developer
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => open.mutate(docsTab.open())} disabled={open.isPending}>
            {open.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <BookOpenIcon className="size-3.5" />} Open developer docs
            <ExternalLinkIcon className="size-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {links.isPending ? (
        <Skeleton className="h-12 rounded-xl" />
      ) : links.isError ? (
        <Notice tone="refuse" tag="Links">
          We couldn&apos;t load your docs links. Try reloading the page.
        </Notice>
      ) : list.length === 0 ? null : (
        <div className="flex flex-col">
          {working.length ? (
            <ul className="m-0 flex list-none flex-col p-0" aria-label="Docs links that work">
              {working.map((l) => (
                <LinkRow key={l.id} link={l} now={now} />
              ))}
            </ul>
          ) : (
            <p className="text-ink-3 m-0 text-[12.5px]">No link works now.</p>
          )}
          {ended.length ? (
            <>
              <button type="button" className="btn btn-ghost btn-xs mt-1 self-start" aria-expanded={showEnded} onClick={() => setShowEnded((v) => !v)}>
                {showEnded ? "Hide ended links" : `Show ended links (${ended.length})`}
              </button>
              {showEnded ? (
                <ul className="m-0 flex list-none flex-col p-0" aria-label="Ended docs links">
                  {ended.map((l) => (
                    <LinkRow key={l.id} link={l} now={now} />
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      {sharing ? <ShareDialog onClose={() => setSharing(false)} /> : null}
    </FigurePanel>
  );
}

function LinkRow({ link, now }: { link: DocsLink; now: Date }) {
  const revoke = useRevokeDocsLink();
  const [asking, setAsking] = React.useState(false);
  const st = docsLinkStatus(link, now);
  const name = docsLinkName(link);
  return (
    <li className="border-line-soft flex flex-col gap-1 border-b py-2.5 last:border-0" aria-label={name}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink text-[13.5px] font-medium">{name}</span>
        <StatusBadge label={STATUS_BADGE[st].label} tone={STATUS_BADGE[st].tone} />
        <span className="flex-1" />
        {st === "active" ? (
          <button type="button" className="btn btn-ghost btn-danger btn-xs" onClick={() => setAsking(true)} disabled={revoke.isPending}>
            {revoke.isPending ? <Loader2Icon className="size-3 animate-spin" /> : <Trash2Icon className="size-3" />} Revoke
          </button>
        ) : null}
      </div>
      <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">
        {link.created_at ? `Made ${formatDate(link.created_at)}` : "Made"}
        {link.created_by ? ` by ${personLabel(link.created_by)}` : ""}
        {link.revoked_at ? ` · revoked ${formatDate(link.revoked_at)}` : link.expires_at ? ` · ${st === "expired" ? "expired" : "expires"} ${formatDate(link.expires_at)}` : ""}
        {link.last_used_at ? (
          <>
            {" · last used "}
            <time dateTime={link.last_used_at} title={formatDateTime(link.last_used_at)}>
              {relativeTime(link.last_used_at, now)}
            </time>
          </>
        ) : (
          " · not used yet"
        )}
      </p>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke &ldquo;{name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>Anyone using this link loses the docs within 5 minutes. This can&apos;t be undone; you can make a new link.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() => {
                setAsking(false);
                revoke.mutate(link);
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** A 30-day link for the club's developer, with an optional label; the link is shown once. */
function ShareDialog({ onClose }: { onClose: () => void }) {
  const share = useShareDocs();
  const [label, setLabel] = React.useState("");
  const [made, setMade] = React.useState<DocsLinkCreated | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    share.mutate(label, { onSuccess: setMade });
  };

  return (
    // Not closed by a click outside once the link is shown: losing it by accident means making another.
    <Dialog open onOpenChange={(open) => !open && !share.isPending && onClose()}>
      <DialogContent className="sm:max-w-[520px]" onInteractOutside={(e) => made && e.preventDefault()}>
        {made ? (
          <>
            <DialogHeader>
              <DialogTitle>{made.link.label ? `Link for “${made.link.label}”` : "Your docs link"}</DialogTitle>
              <DialogDescription>Send it to your developer. It opens the guides, API reference and Postman file.</DialogDescription>
            </DialogHeader>
            <SecretOnce label="Docs link" secret={made.url} warning={DOCS_SHARE_WARNING} />
            <DialogFooter>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                I&apos;ve copied it
              </button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Share the docs with your developer</DialogTitle>
              <DialogDescription>Make a link to the private docs for whoever builds for your club. It lasts {DOCS_SHARE_DAYS} days.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <div>
                <label htmlFor="docs-label" className="eyebrow mb-1.5 block">
                  Who it&apos;s for (optional)
                </label>
                <input
                  id="docs-label"
                  className="input h-10 w-full"
                  value={label}
                  maxLength={DOCS_LABEL_MAX}
                  placeholder="Ravi, our web agency"
                  onChange={(e) => setLabel(e.target.value)}
                  aria-describedby="docs-label-hint"
                />
                <p id="docs-label-hint" className="text-ink-3 m-0 mt-1 text-[12px]">
                  Only your team sees it, in the list of links.
                </p>
              </div>
              <DialogFooter>
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={share.isPending}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={share.isPending}>
                  {share.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <Share2Icon className="size-4" />} Make link
                </button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
