"use client";

import * as React from "react";
import { ServerOffIcon } from "lucide-react";
import { EmptyState, Skeleton } from "@moa/ui";

import { useSpeakersOnServer } from "../queries";

/** A speakers screen: shown once the API has the directory, a quiet note on one from before it. */
export function SpeakersGate({ children }: { children: React.ReactNode }) {
  const on = useSpeakersOnServer();
  if (on === undefined) return <Skeleton className="h-64 w-full" />;
  if (!on) {
    return (
      <EmptyState
        tone="muted"
        icon={<ServerOffIcon />}
        title="Not available on this server yet"
        description="The speakers directory arrives with a newer version of the API. Once the server is updated it appears here on its own."
      />
    );
  }
  return <>{children}</>;
}
