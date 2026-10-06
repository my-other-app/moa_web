"use client";

import * as React from "react";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { Button, EmptyState } from "@moa/ui";

/**
 * A failure inside one page, caught without losing the rail.
 *
 * The boundary above replaces the whole screen, which is right when the
 * session check itself failed and wrong when a single page threw -- a club
 * should be able to navigate away rather than be stranded.
 */
export default function ClubsSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Clubs section failed", error);
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
