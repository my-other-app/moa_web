"use client";

import * as React from "react";
import { ServerOffIcon } from "lucide-react";
import { EmptyState, Skeleton } from "@moa/ui";

import { useOpsMe } from "../queries";
import { hasFeature, type OpsFeature } from "../schemas";

/**
 * A screen of an operator tool: shown once the backend says it has the tool,
 * a quiet note when it does not (a page opened directly against a server that
 * predates it), a skeleton while it is asked.
 */
export function OpsGate({ feature, children }: { feature: OpsFeature; children: React.ReactNode }) {
  const { data, isPending } = useOpsMe();
  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (!hasFeature(data, feature)) {
    return (
      <EmptyState
        tone="muted"
        icon={<ServerOffIcon />}
        title="Not available on this server yet"
        description="This tool arrives with a newer version of the API. Once the server is updated it appears here on its own."
      />
    );
  }
  return <>{children}</>;
}
