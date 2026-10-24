import { sentryOptions, type SentryRuntime } from "@moa/observability";

/**
 * This app's Sentry options for one runtime, or null when Sentry is off.
 *
 * Each variable is spelled out in full on purpose: Next inlines a
 * NEXT_PUBLIC_ variable into the browser bundle only where it sees the whole
 * name, so reading them any other way leaves the browser with no DSN. The
 * environment and release are set by next.config.ts at build time.
 */
export function sentryOptionsFor(runtime: SentryRuntime) {
  return sentryOptions("admin", runtime, {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  });
}
