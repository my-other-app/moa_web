"use client";

import * as React from "react";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@moa/ui";
import * as Sentry from "@sentry/nextjs";

/**
 * What a club sees when a server render fails.
 *
 * Without this, Next serves its own black screen reading "A server error
 * occurred" over an opaque number. The admin app shipped without it and that
 * is exactly what an admin was shown when /auth/me started failing: the
 * dashboard layout verifies the session before sending any chrome, so an
 * unreachable API fails every page here. This app has the same gate and the
 * same exposure.
 */
export default function ClubsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Clubs render failed", error);
    // A server failure was reported where it happened (it carries a digest);
    // only a failure in the browser is reported from here. A no-op when
    // Sentry is off.
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="bg-card w-full max-w-md rounded-xl border p-6 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          <AlertTriangleIcon className="size-5" />
        </div>

        <h1 className="mt-4 text-lg font-semibold">This page could not load</h1>
        <p className="text-muted-foreground mt-2 text-sm text-pretty">
          We could not reach the server, or it returned an error. This is a
          fault on our side, not something you did — your sign-in is probably
          still fine.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset}>
            <RefreshCwIcon /> Try again
          </Button>
          <Button variant="outline" asChild>
            <a href="/login">Sign in again</a>
          </Button>
        </div>

        {error.digest ? (
          <p className="text-muted-foreground mt-5 border-t pt-4 text-xs">
            Reference{" "}
            <code className="bg-muted rounded px-1 py-0.5">{error.digest}</code>
            {" — quote this if you report it."}
          </p>
        ) : null}
      </div>
    </main>
  );
}
