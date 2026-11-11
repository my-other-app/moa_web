"use client";

import * as React from "react";
import { ServerOffIcon } from "lucide-react";
import { EmptyState, Skeleton } from "@moa/ui";

import { useTeamworkOnServer } from "../queries";

/**
 * A Team work screen: shown once the API has Team work, a quiet note when it
 * does not (a page opened directly against a server from before it), a
 * skeleton while it is asked. The side menu hides the group the same way.
 */
export function TeamworkGate({ children }: { children: React.ReactNode }) {
  const on = useTeamworkOnServer();
  if (on === undefined) return <Skeleton className="h-64 w-full" />;
  if (!on) {
    return (
      <EmptyState
        tone="muted"
        icon={<ServerOffIcon />}
        title="Not available on this server yet"
        description="Team work arrives with a newer version of the API. Once the server is updated it appears here on its own."
      />
    );
  }
  return <>{children}</>;
}
