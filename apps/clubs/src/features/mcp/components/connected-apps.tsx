"use client";

import * as React from "react";
import { BotIcon, CopyIcon, Loader2Icon, PlugIcon, UnplugIcon } from "lucide-react";
import { ApiError } from "@moa/api";
import { formatDateTime, relativeTime } from "@moa/app-kit";
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
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";

import { LockedNotice, useFeatureGate } from "@/features/plan";

import { useConnectedApps, useDisconnectApp } from "../queries";
import { HOW_TO, MCP_URL, appHost, connectedByLabel, isMcpOff, type ConnectedApp } from "../schemas";

/**
 * Connected apps, on the Security page: the AI assistants (Claude,
 * ChatGPT, Cursor…) connected to the club through MyOtherApp's MCP server,
 * who connected each, what it may do, and how many of its requests wait
 * for a person to approve them. Disconnecting ends its access at once and
 * turns those requests down.
 *
 * The club's owner and admins see every app (`can_manage_all`); anyone
 * else sees the ones they connected. With connected assistants switched
 * off (404, or 503 MCP_DISABLED) the section is not there at all. On a plan
 * without them (`mcp`, Growth and up) the list stays readable under the
 * plan's notice: a club that drops below Growth keeps its connections, and
 * the assistants say why they can't do anything.
 */
export function ConnectedAppsSection() {
  const q = useConnectedApps();
  const gate = useFeatureGate("mcp");
  if (q.isError && (isMcpOff(q.error) || (q.error instanceof ApiError && q.error.isForbidden))) return null;

  const data = q.data;
  return (
    <section id="connected-apps" aria-labelledby="connected-apps-title" className="flex scroll-mt-4 flex-col gap-3">
      <div>
        <h3 id="connected-apps-title" className="text-ink m-0 text-[15px] font-semibold tracking-[-0.01em]">
          Connected apps
        </h3>
        <p className="text-ink-2 m-0 mt-0.5 text-[13px]">
          {data && !data.can_manage_all
            ? "The AI assistants you connected. The club's owner and admins see every app."
            : "AI assistants that can read your events and draft for you. Publishing and sending always wait for someone here to approve."}
        </p>
      </div>

      <LockedNotice feature="mcp" dialog>
        {(lock) => (
          <>
            <strong className="font-semibold">
              {lock.label} {lock.requiredPlanName ? `is part of ${lock.requiredPlanName} and up.` : "isn't on your plan."}
            </strong>{" "}
            Apps already connected stay listed here, but they can&apos;t do anything for the club until you upgrade.
          </>
        )}
      </LockedNotice>

      {q.isError ? (
        <EmptyState tone="muted" size="sm" title="Could not load connected apps" description="Try reloading the page." />
      ) : !data ? (
        <Skeleton className="h-[132px] rounded-2xl" />
      ) : data.apps.length === 0 ? (
        <FigurePanel className="flex flex-col gap-4 p-4 sm:p-5" role="region" aria-label="No AI apps connected">
          <div className="flex items-start gap-3">
            <span className="bg-sunken text-ink-2 grid size-10 shrink-0 place-items-center rounded-xl">
              <PlugIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-ink m-0 text-[15px] font-semibold">No AI apps connected</p>
              <p className="text-ink-2 m-0 mt-0.5 text-[13px] leading-[1.55]">
                {gate.locked
                  ? "Upgrade first, then connect an assistant from its own settings."
                  : "Connect an assistant from its own settings, then ask it things like “how many people checked in last night?” or “draft next month's hack night”."}
              </p>
            </div>
          </div>
          {!gate.locked ? <HowTo /> : null}
        </FigurePanel>
      ) : (
        <>
          <ul className="m-0 grid list-none gap-3 p-0" aria-label="Connected apps">
            {data.apps.map((app) => (
              <AppRow key={app.id} app={app} />
            ))}
          </ul>
          {!gate.locked ? (
            <details className="group">
              <summary className="text-brand cursor-pointer text-[13px] font-medium select-none">Connect another assistant</summary>
              <FigurePanel className="mt-2 p-4">
                <HowTo />
              </FigurePanel>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function AppIcon({ app }: { app: ConnectedApp }) {
  const logo = app.app.logo_uri && /^https:\/\//i.test(app.app.logo_uri) ? app.app.logo_uri : null;
  return logo ? (
    // An app's own logo, from its registration; any https host, so not through next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" className="size-10 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" />
  ) : (
    <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl">
      <BotIcon className="size-4" aria-hidden="true" />
    </span>
  );
}

function When({ iso, now }: { iso: string | null; now: Date }) {
  if (!iso) return <>never</>;
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {relativeTime(iso, now)}
    </time>
  );
}

function AppRow({ app }: { app: ConnectedApp }) {
  const disconnect = useDisconnectApp();
  const [asking, setAsking] = React.useState(false);
  const [now] = React.useState(() => new Date());
  const host = appHost(app.app.uri);
  const waiting = app.pending_actions;

  const confirm = () => {
    setAsking(false);
    disconnect.mutate(app.id, {
      onSuccess: () => toast.success(`${app.app.name} is disconnected.${waiting ? ` Its ${waiting === 1 ? "waiting request was" : `${waiting} waiting requests were`} turned down.` : ""}`),
      onError: (error) =>
        toast.error(
          error instanceof ApiError && error.errorCode === "APP_NOT_FOUND"
            ? "That app is already disconnected."
            : error instanceof Error && error.message
              ? error.message
              : "Could not disconnect it. Try again.",
        ),
    });
  };

  return (
    <li>
      <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label={app.app.name}>
        <div className="flex items-start gap-3">
          <AppIcon app={app} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-ink m-0 text-[15px] font-semibold">{app.app.name}</p>
              {host ? <span className="text-ink-3 font-mono text-[11.5px]">{host}</span> : null}
              {waiting > 0 ? <StatusBadge label={`${waiting} ${waiting === 1 ? "request" : "requests"} waiting`} tone="warning" /> : null}
            </div>
            <p className="text-ink-2 m-0 mt-0.5 text-[12.5px]">Connected by {connectedByLabel(app.connected_by)}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm text-refuse shrink-0" onClick={() => setAsking(true)} disabled={disconnect.isPending} aria-label={`Disconnect ${app.app.name}`}>
            {disconnect.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <UnplugIcon className="size-3.5" />}
            <span className="max-sm:sr-only">Disconnect</span>
          </button>
        </div>

        {app.scopes.length ? (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={`What ${app.app.name} may do`}>
            {app.scopes.map((s) => (
              <li key={s.key} className="tag" title={s.key}>
                {s.label}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-ink-3 m-0 text-[12px]">
          Connected <When iso={app.connected_at} now={now} /> · Last used <When iso={app.last_used_at} now={now} />
        </p>
      </FigurePanel>

      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {app.app.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {app.app.name} loses access to the club at once.
              {waiting > 0 ? ` Its ${waiting === 1 ? "waiting request is" : `${waiting} waiting requests are`} turned down.` : " It has no requests waiting."} You can connect it again from{" "}
              {app.app.name} later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className={cn(buttonVariants({ variant: "destructive" }))} onClick={confirm}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Could not copy. Select it and copy by hand.");
  }
}

/** How to connect each assistant: docs/MCP.md, section 1. */
function HowTo() {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <CardLabel>The address to connect</CardLabel>
        <div className="bg-sunken mt-1.5 flex items-center gap-2 rounded-xl px-3 py-2">
          <code className="text-ink min-w-0 flex-1 text-[13px] break-all">{MCP_URL}</code>
          <button type="button" className="btn btn-ghost btn-xs shrink-0" onClick={() => void copy(MCP_URL)} aria-label="Copy the address">
            <CopyIcon className="size-3.5" /> Copy
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {HOW_TO.map((h) => (
          <section key={h.app} aria-label={`Connect ${h.app}`}>
            <h4 className="text-ink m-0 text-[13.5px] font-semibold">{h.app}</h4>
            <ol className="text-ink-2 m-0 mt-1 flex list-decimal flex-col gap-1 pl-5 text-[12.5px] leading-[1.5]">
              {h.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <p className="text-ink-3 m-0 text-[12px]">You sign in with your dashboard login and choose what the assistant may do. It can only do what your role can.</p>
    </div>
  );
}
