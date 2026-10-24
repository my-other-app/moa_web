import type { init } from "@sentry/nextjs";

import { scrubBreadcrumb, scrubEvent, scrubSpan } from "./scrub";

/** What `Sentry.init` takes, in any of the three runtimes. */
export type SentryInitOptions = NonNullable<Parameters<typeof init>[0]>;

export type SentryRuntime = "client" | "server" | "edge";
export type DashboardApp = "clubs" | "admin";

/**
 * The deployment's Sentry settings, as the app read them.
 *
 * The app reads each variable itself, by its full literal name
 * (`process.env.NEXT_PUBLIC_SENTRY_DSN`), and passes the values in. That is
 * not a style choice: Next inlines a NEXT_PUBLIC_ variable into the browser
 * bundle only where it sees the whole name, so reading it here through an
 * object would leave every browser without a DSN.
 */
export interface SentryEnv {
  dsn?: string;
  /** production, preview or development; next.config derives it from VERCEL_ENV. */
  environment?: string;
  /** Set at build so the browser, the server and the uploaded source maps agree. */
  release?: string;
  /** 0 to 1; anything else falls back to the default. */
  tracesSampleRate?: string;
}

/** One request in twenty is traced: enough to see the slow pages, cheap on the quota. */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.05;

/**
 * Collect nothing about the person: no user fields or IP, no cookies, no
 * request or response bodies, no headers beyond the harmless few, no query
 * parameters, no local variables from stack frames. Set in full rather than
 * left to defaults, because the defaults of `dataCollection` are permissive.
 */
export const PRIVATE_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { allow: ["accept", "content-type", "content-length", "user-agent"] },
    response: { allow: ["content-type", "content-length"] },
  },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  stackFrameVariables: false,
} satisfies NonNullable<SentryInitOptions["dataCollection"]>;

function tracesSampleRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_TRACES_SAMPLE_RATE;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : DEFAULT_TRACES_SAMPLE_RATE;
}

/**
 * The options to start Sentry with, or null when it must stay off.
 *
 * Off means off: with no DSN there are no options, so the caller never calls
 * `Sentry.init` -- nothing is patched, nothing is buffered, nothing is sent.
 */
export function sentryOptions(app: DashboardApp, runtime: SentryRuntime, env: SentryEnv): SentryInitOptions | null {
  const dsn = env.dsn?.trim();
  if (!dsn) return null;

  const environment = env.environment?.trim();
  const release = env.release?.trim();
  const options: SentryInitOptions = {
    dsn,
    // Left out rather than set to undefined, so the SDK's own fallbacks apply.
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    tracesSampleRate: tracesSampleRate(env.tracesSampleRate),
    dataCollection: PRIVATE_DATA_COLLECTION,
    initialScope: { tags: { app, runtime } },
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    beforeSendSpan: (span) => scrubSpan(span),
  };

  if (runtime !== "client") return options;
  return {
    ...options,
    // No session replay, not even on error: it records what is on screen,
    // which here is attendees' names, emails and phone numbers.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // The browser adds no sentry-trace or baggage headers to any request. The
    // gateway forwards request headers to the API, so they would leave with
    // every call.
    tracePropagationTargets: [],
  };
}
