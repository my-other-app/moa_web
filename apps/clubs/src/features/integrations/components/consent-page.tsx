"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, ArrowLeftRightIcon, BlocksIcon, ClockIcon, Loader2Icon, PlugZapIcon, RefreshCwIcon, ShieldCheckIcon, type LucideIcon } from "lucide-react";
import { ApiError } from "@moa/api";
import { useLogout } from "@moa/app-kit";
import { FigurePanel, InitialsAvatar, Notice, Skeleton, cn } from "@moa/ui";

import { PRODUCT } from "@/components/auth-frame";

import { browser, useConsent, useDecideConsent } from "../queries";
import { consentPath, hostOf, isIntegrationsMissing, needsNoticeTick, refusalRedirect, safeRedirect, type Consent, type OAuthParams } from "../schemas";
import { ScopePicker } from "./parts";

/**
 * /integrations/connect?client_id=…: where a partner app's "Connect
 * MyOtherApp" lands.
 *
 * MyOtherApp's /partner/oauth/authorize checks the app and its request, then
 * sends the browser here with the request in the address; the API checks it
 * again on every read and on the answer. Signed out, the page goes to
 * sign-in and comes back (as the assistant approvals at /confirm do).
 * Signed in, it says plainly which app wants which club and what it may do,
 * each thing a tick the owner or admin may take off; people's details need
 * the club's word that its form tells them. Allow or Cancel sends the
 * browser back to the app, with a code or a refusal.
 */
export function ConsentPage({ params }: { params: OAuthParams }) {
  const q = useConsent(params);
  const router = useRouter();
  const signIn = `/login?next=${encodeURIComponent(consentPath(params))}`;
  const unauthorised = q.error instanceof ApiError && q.error.isUnauthorized;

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
        </header>
        {q.isPending || unauthorised ? (
          <Loading />
        ) : q.isError ? (
          <LoadError error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <Ask params={params} consent={q.data} signIn={signIn} />
        )}
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
      <Skeleton className="h-9 w-4/5" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function Stop({ icon: Icon, tone = "neutral", title, children, action }: { icon: LucideIcon; tone?: "neutral" | "caution" | "refuse"; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <FigurePanel className="flex flex-col items-start gap-3 p-5 sm:p-6" role="region" aria-label={title}>
      <span className={cn("grid size-11 place-items-center rounded-full", tone === "caution" ? "bg-caution-soft text-caution" : tone === "refuse" ? "bg-refuse-soft text-refuse" : "bg-sunken text-ink-2")}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h1 className="text-ink m-0 text-[20px] leading-[1.25] font-semibold tracking-[-0.015em]">{title}</h1>
      <div className="text-ink-2 text-[14px] leading-[1.55]">{children}</div>
      {action}
    </FigurePanel>
  );
}

/** "Go back to the app": where the API says the person should land, with the refusal for the app to read. */
const BackToApp = ({ error }: { error: unknown }) => {
  const to = refusalRedirect(error);
  return to ? (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => browser.go(to)}>
      Go back to the app
    </button>
  ) : null;
};

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = error instanceof ApiError ? error.errorCode : null;
  if (isIntegrationsMissing(error))
    return (
      <Stop icon={PlugZapIcon} title="Connecting apps isn't available yet">
        MyOtherApp can&apos;t connect partner apps to clubs yet. Nothing was connected.
      </Stop>
    );
  if (code === "OAUTH_REQUEST_INVALID")
    return (
      <Stop icon={ClockIcon} tone="caution" title="This link doesn't work" action={<BackToApp error={error} />}>
        {error instanceof Error && error.message ? `${error.message.replace(/\.$/, "")}. ` : ""}Go back to the app and choose Connect MyOtherApp again.
      </Stop>
    );
  if (code === "NOT_ALLOCATED")
    return (
      <Stop icon={PlugZapIcon} tone="caution" title="API access isn't on for your club" action={<BackToApp error={error} />}>
        No app can connect to your club until the MyOtherApp team turns API access on. Ask them through Help, and say which app you&apos;d like to connect.
      </Stop>
    );
  if (code === "ROLE_FORBIDDEN" || (error instanceof ApiError && error.status === 403))
    return (
      <Stop icon={AlertTriangleIcon} tone="caution" title="Only the club's owner or an admin can connect an app">
        You&apos;re signed in with a role that can&apos;t. Ask the club&apos;s owner or an admin to open this link, or sign in with the club&apos;s own login.
      </Stop>
    );
  if (code === "NOT_A_CLUB")
    return (
      <Stop icon={AlertTriangleIcon} tone="caution" title="This is for a club's team">
        You&apos;re signed in with an account that doesn&apos;t belong to a club. Sign in with the club&apos;s login, or your own team login, to connect the app.
      </Stop>
    );
  if (code === "PARTNER_SUSPENDED")
    return (
      <Stop icon={AlertTriangleIcon} tone="refuse" title="This app can't connect right now">
        MyOtherApp has paused this app. Nothing was connected.
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

function Ask({ params, consent: c, signIn }: { params: OAuthParams; consent: Consent; signIn: string }) {
  const decide = useDecideConsent(params);
  const logout = useLogout();
  const router = useRouter();
  const [scopes, setScopes] = React.useState<string[]>(c.scopes);
  const [ticked, setTicked] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const [leaving, setLeaving] = React.useState<"allow" | "deny" | null>(null);
  const partner = c.app;
  const host = hostOf(partner.website);
  const live = c.mode === "live";
  const noScopes = scopes.length === 0;
  const noTick = needsNoticeTick(scopes) && !ticked;

  const go = (decision: "allow" | "deny") => {
    if (decision === "allow") {
      setTried(true);
      if (noScopes || noTick) return;
    }
    setLeaving(decision);
    decide.mutate(
      { decision, scopes: decision === "allow" ? scopes : [], attendees_disclosure_ack: decision === "allow" && needsNoticeTick(scopes) && ticked },
      {
        onSuccess: ({ redirect_to }) => {
          const to = safeRedirect(redirect_to);
          if (to) browser.go(to);
        },
        onError: () => setLeaving(null),
      },
    );
  };

  const otherClub = async () => {
    try {
      await logout.mutateAsync();
    } finally {
      router.replace(signIn);
    }
  };

  const refused = decide.error instanceof ApiError ? decide.error : decide.isError ? null : undefined;
  const busy = decide.isPending || decide.isSuccess;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="bg-brand-soft text-brand inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[12px] font-medium">
          <BlocksIcon className="size-3.5" aria-hidden="true" /> Connect an app
        </span>
        <h1 className="text-ink m-0 text-[24px] leading-[1.2] font-semibold tracking-[-0.02em]">
          {partner.name} wants to connect to {c.club.name}
        </h1>
        <p className="text-ink-2 m-0 text-[14px] leading-[1.55]">It will work for your club on MyOtherApp, within what you allow below. You can disconnect it any time from Settings → Integrations.</p>
      </div>

      <FigurePanel className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          {partner.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- the partner's own logo, from its address
            <img src={partner.logo_url} alt="" className="border-line-soft size-11 shrink-0 rounded-xl border object-cover" />
          ) : (
            <InitialsAvatar name={partner.name} size={44} />
          )}
          <ArrowLeftRightIcon className="text-ink-3 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-ink m-0 truncate text-[14px] font-semibold">{partner.name}</p>
            <p className="text-ink-3 m-0 truncate text-[12.5px]">
              {host ? (
                <a href={partner.website!} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {host}
                </a>
              ) : (
                "Approved by MyOtherApp"
              )}
            </p>
          </div>
        </div>
        <div className="border-line-soft flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[12.5px]">
          <span className="text-ink-2">
            For <strong className="text-ink font-semibold">{c.club.name}</strong>, the club you&apos;re signed in to
          </span>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => void otherClub()} disabled={logout.isPending || busy}>
            Use another club
          </button>
        </div>
      </FigurePanel>

      {!live ? (
        <Notice tone="caution" tag="Test">
          A test connection: it sees and changes only test events, which nobody else sees and which send no emails.
        </Notice>
      ) : null}
      {c.already_connected ? (
        <Notice tone="neutral" tag="Connected">
          {partner.name} is already connected to your club. Allowing replaces what it may do with what you tick here.
        </Notice>
      ) : null}

      {c.scopes.length ? (
        <FigurePanel className="p-4">
          <ScopePicker
            idPrefix="consent"
            value={scopes}
            offered={c.scopes}
            onChange={setScopes}
            recipient={partner.name}
            noticeTicked={ticked}
            onNoticeTicked={setTicked}
            error={tried && noScopes ? "Leave at least one ticked, or choose Cancel." : undefined}
            noticeError={tried && noTick ? "Tick this to give it people's details, or untick See people's details." : undefined}
          />
        </FigurePanel>
      ) : (
        <Notice tone="caution" tag="Nothing to allow">
          The app asked for nothing your club can give. Cancel, and tell the app.
        </Notice>
      )}

      {refused !== undefined ? (
        <Notice tone="refuse" tag="Not connected" action={<BackToApp error={decide.error} />}>
          {refused?.errorCode === "OAUTH_REQUEST_INVALID"
            ? "This link has run out. Go back to the app and choose Connect MyOtherApp again."
            : refused?.message || "That didn't go through. Check your connection and try again."}
        </Notice>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {c.scopes.length ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => go("allow")} disabled={busy}>
              {leaving === "allow" && busy ? <Loader2Icon className="size-4 animate-spin" /> : <ShieldCheckIcon className="size-4" />} Allow
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => go("deny")} disabled={busy}>
            {leaving === "deny" && busy ? <Loader2Icon className="size-4 animate-spin" /> : null} Cancel
          </button>
        </div>
        <p className="text-ink-3 m-0 text-[12px]" role="status">
          {decide.isSuccess
            ? `Taking you back to ${partner.name}…`
            : c.redirect_target
              ? `Either way, you go back to ${c.redirect_target}.`
              : `Either way, you go back to ${partner.name}.`}
        </p>
      </div>
    </div>
  );
}
