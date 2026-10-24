"use client";

import * as React from "react";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { Button, EmptyState } from "@moa/ui";
import * as Sentry from "@sentry/nextjs";

/**
 * A failure inside one dashboard page, caught without losing the shell.
 *
 * The boundary one level up replaces the entire screen, including the nav --
 * which is the right thing when the session check itself failed, and the wrong
 * thing when a single page threw. Here the admin keeps the sidebar and can go
 * somewhere else instead of being stranded.
 */
export default function DashboardSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Dashboard section failed", error);
    // A server failure was reported where it happened (it carries a digest);
    // only a failure in the browser is reported from here. A no-op when
    // Sentry is off.
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <EmptyState
      tone="muted"
      icon={<AlertTriangleIcon />}
      title="This section could not load"
      description={
        error.digest
          ? `Something went wrong fetching it. Reference ${error.digest}.`
          : "Something went wrong fetching it."
      }
      action={
        <Button onClick={reset}>
          <RefreshCwIcon /> Try again
        </Button>
      }
    />
  );
}
