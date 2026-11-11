"use client";

import * as React from "react";
import { ServerOffIcon } from "lucide-react";
import { EmptyState, Skeleton } from "@moa/ui";

import { useHelpOnServer } from "../queries";

/** A Help screen: shown once the API has the help desk, a quiet note on one from before it. */
export function HelpGate({ children }: { children: React.ReactNode }) {
  const on = useHelpOnServer();
  if (on === undefined) return <Skeleton className="h-64 w-full" />;
  if (!on) {
    return <EmptyState tone="muted" icon={<ServerOffIcon />} title="Help isn't available yet" description="Write to support@myotherapp.in for now. Help arrives here with the next update." />;
  }
  return <>{children}</>;
}
