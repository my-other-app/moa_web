"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ServerOffIcon } from "lucide-react";
import { EmptyState, Skeleton, TabRail } from "@moa/ui";

import { useIntegrationsOnServer } from "../queries";

const TABS = [
  { key: "clubs", label: "Clubs with access", href: "/integrations" },
  { key: "partners", label: "Partner apps", href: "/integrations/partner-apps" },
  { key: "webhooks", label: "Webhook health", href: "/integrations/webhooks" },
];

/** An integrations screen: shown once the API has integrations, a quiet note on one from before them. */
export function IntegrationsGate({ children }: { children: React.ReactNode }) {
  const on = useIntegrationsOnServer();
  const pathname = usePathname();
  const current = TABS.slice().reverse().find((t) => pathname.startsWith(t.href))?.key ?? "clubs";
  if (on === undefined) return <Skeleton className="h-64 w-full" />;
  if (!on) {
    return (
      <EmptyState
        tone="muted"
        icon={<ServerOffIcon />}
        title="Not available on this server yet"
        description="Integrations arrive with a newer version of the API. Once the server is updated they appear here on their own."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <TabRail
        label="Integration sections"
        items={TABS}
        value={current}
        renderLink={(item, props) => (
          <Link href={item.href!} className={props.className} aria-current={props["aria-current"]}>
            {props.children}
          </Link>
        )}
      />
      {children}
    </div>
  );
}
