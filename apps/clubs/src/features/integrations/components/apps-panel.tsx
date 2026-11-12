"use client";

import * as React from "react";
import { BlocksIcon, Loader2Icon, UnplugIcon } from "lucide-react";
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
  EmptyState,
  FigurePanel,
  InitialsAvatar,
  Notice,
  Skeleton,
  buttonVariants,
  cn,
} from "@moa/ui";

import { useConnections, useDisconnectPartner } from "../queries";
import { hostOf, personLabel, type Connection } from "../schemas";
import { ScopeTags } from "./parts";

/**
 * Partner apps connected to the club: other platforms MyOtherApp has
 * approved, which the club's owner or an admin let in from the app's own
 * "Connect MyOtherApp" button. Each acts only within what was allowed, and
 * disconnecting ends its access at once.
 */
export function AppsPanel() {
  const apps = useConnections();
  const list = apps.data ?? [];
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Connected apps">
      <CardLabel>Connected apps</CardLabel>
      <p className="text-ink-3 m-0 text-[12.5px] leading-[1.5]">
        Other platforms working for your club, connected from their own &ldquo;Connect MyOtherApp&rdquo; button. Each sees and changes only what was allowed when it was connected.
      </p>
      {apps.isPending ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : apps.isError ? (
        <Notice tone="refuse" tag="Apps">
          We couldn&apos;t load the connected apps. Try reloading the page.
        </Notice>
      ) : list.length === 0 ? (
        <EmptyState size="sm" tone="muted" icon={<BlocksIcon />} title="No apps connected" description="When your club connects another platform to MyOtherApp, it shows here." />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {list.map((c) => (
            <AppRow key={c.id} c={c} />
          ))}
        </ul>
      )}
    </FigurePanel>
  );
}

function AppRow({ c }: { c: Connection }) {
  const disconnect = useDisconnectPartner();
  const [asking, setAsking] = React.useState(false);
  const [now] = React.useState(() => new Date());
  const host = hostOf(c.partner.website);
  return (
    <li className="border-line-soft flex flex-col gap-2 border-b py-3 last:border-0" aria-label={c.partner.name}>
      <div className="flex items-center gap-3">
        {c.partner.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- the partner's own logo, from its address
          <img src={c.partner.logo_url} alt="" className="border-line-soft size-9 shrink-0 rounded-[10px] border object-cover" />
        ) : (
          <InitialsAvatar name={c.partner.name} size={36} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-ink m-0 truncate text-[14px] font-medium">{c.partner.name}</p>
          {host ? <p className="text-ink-3 m-0 truncate text-[12px]">{host}</p> : null}
        </div>
        <button type="button" className="btn btn-ghost btn-danger btn-sm" onClick={() => setAsking(true)} disabled={disconnect.isPending}>
          {disconnect.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <UnplugIcon className="size-3.5" />} Disconnect
        </button>
      </div>
      <ScopeTags scopes={c.scopes} />
      <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">
        {c.connected_at ? `Connected ${formatDate(c.connected_at)}` : "Connected"}
        {c.connected_by ? ` by ${personLabel(c.connected_by)}` : ""}
        {c.last_used_at ? (
          <>
            {" · last used "}
            <time dateTime={c.last_used_at} title={formatDateTime(c.last_used_at)}>
              {relativeTime(c.last_used_at, now)}
            </time>
          </>
        ) : (
          " · not used yet"
        )}
      </p>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {c.partner.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It loses access to your club at once, and the webhooks it added stop. What it already made here (events, registrations, check-ins) stays. To use it again, connect it from {c.partner.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connected</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() => {
                setAsking(false);
                disconnect.mutate(c);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
