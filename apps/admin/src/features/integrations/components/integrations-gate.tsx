"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ServerOffIcon } from "lucide-react";
import { EmptyState, Skeleton, TabRail } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { useDocsOnServer, useIntegrationsOnServer } from "../queries";

const TABS = [
  { key: "clubs", label: "Clubs with access", href: "/integrations" },
  { key: "partners", label: "Partner apps", href: "/integrations/partner-apps" },
  { key: "webhooks", label: "Webhook health", href: "/integrations/webhooks" },
];
/** Only for a role that may manage content, on an API that has docs links. */
const DOCS_TAB = { key: "docs", label: "Docs links", href: "/integrations/docs-links" };

/** An integrations screen: shown once the API has integrations, a quiet note on one from before them. */
export function IntegrationsGate({ children }: { children: React.ReactNode }) {
  const on = useIntegrationsOnServer();
  const manage = useCan("manage_content");
  const docs = useDocsOnServer(manage);
  const pathname = usePathname();
  const tabs = docs ? [...TABS, DOCS_TAB] : TABS;
  const current = tabs.slice().reverse().find((t) => pathname.startsWith(t.href))?.key ?? "clubs";
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
        items={tabs}
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
