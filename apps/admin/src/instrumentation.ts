import type { Instrumentation } from "next";

import { sentryOptionsFor } from "./sentry";

/**
 * Starts Sentry on the server. With no DSN this returns before the SDK is
 * even loaded, so nothing is patched or sent.
 */
export async function register() {
  const options = sentryOptionsFor(process.env.NEXT_RUNTIME === "edge" ? "edge" : "server");
  if (!options) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init(options);
}

/**
 * Errors thrown while rendering, in route handlers and in server actions.
 * The request's headers and cookies are stripped by the scrubber before
 * anything is sent.
 */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!sentryOptionsFor("server")) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
