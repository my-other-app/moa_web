import * as Sentry from "@sentry/nextjs";

import { sentryOptionsFor } from "./sentry";

// Runs in the browser before the app hydrates. With no DSN there are no
// options and Sentry is never started.
const options = sentryOptionsFor("client");
if (options) Sentry.init(options);

/** Lets Sentry time client-side navigations; nothing to do when it is off. */
export function onRouterTransitionStart(href: string, navigationType: string) {
  if (options) Sentry.captureRouterTransitionStart(href, navigationType);
}
