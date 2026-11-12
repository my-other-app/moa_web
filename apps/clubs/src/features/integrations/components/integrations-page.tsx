"use client";

import * as React from "react";
import { ExternalLinkIcon } from "lucide-react";
import { EmptyState, Notice, Skeleton, TabRail } from "@moa/ui";

import { useIntegrationsRole, useIntegrationsStatus } from "../queries";
import { DOCS_URL, integrationsVisible, type IntegrationsStatus } from "../schemas";
import { AppsPanel } from "./apps-panel";
import { KeysPanel } from "./keys-panel";
import { UsagePanel } from "./usage-panel";
import { WebhooksPanel } from "./webhooks-panel";

type Tab = "keys" | "webhooks" | "apps" | "usage";

const TIER_LABEL: Record<string, string> = { standard: "Standard", high: "High" };

/**
 * Settings → Integrations: the club's API keys, webhook endpoints, connected
 * partner apps and how much the API was used.
 *
 * Owners and admins only. It shows once the MyOtherApp team has given the
 * club API access (or the club connected a partner app, so it can be
 * disconnected here); before that, and on an API from before integrations,
 * the page says it isn't available rather than offering what would be
 * refused.
 */
export function IntegrationsPage() {
  const role = useIntegrationsRole();
  // Asked once the server has said who is signed in: an editor is never sent for what it would refuse.
  const status = useIntegrationsStatus(role.manage && role.known);

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">Integrations</h2>
          <p className="text-ink-2 mt-1 max-w-[70ch] text-[13px]">
            Connect your club&apos;s own systems, such as your website, an ERP or a college portal, so events, registrations, check-ins and certificates stay the same on both sides.
          </p>
        </div>
        <a href={DOCS_URL} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">
          Developer docs <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
        </a>
      </header>

      {role.known && !role.manage ? (
        <Notice tone="neutral" tag="Owners and admins">
          Only the club&apos;s owner or an admin can see and change integrations.
        </Notice>
      ) : status.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-10 w-2/3 rounded-xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : status.isError ? (
        <EmptyState tone="muted" title="Could not load integrations" description="Try reloading the page." />
      ) : !integrationsVisible(status.data) ? (
        <Notice tone="neutral" tag="Not on yet">
          API access isn&apos;t on for your club. The MyOtherApp team turns it on for clubs that need it: ask them through Help, and say what you&apos;d like to connect.
        </Notice>
      ) : (
        <Sections status={status.data!} />
      )}
    </div>
  );
}

function Sections({ status }: { status: IntegrationsStatus }) {
  const tabs: { key: Tab; label: string }[] = status.allocated
    ? [
        { key: "keys", label: "API keys" },
        { key: "webhooks", label: "Webhooks" },
        { key: "apps", label: "Connected apps" },
        { key: "usage", label: "Usage" },
      ]
    : [{ key: "apps", label: "Connected apps" }];
  const [tab, setTab] = React.useState<Tab>(tabs[0]!.key);
  const current = tabs.some((t) => t.key === tab) ? tab : tabs[0]!.key;

  return (
    <>
      {status.allocated ? (
        <p className="text-ink-3 m-0 text-[12.5px]">
          API access is on · {TIER_LABEL[status.rate_tier] ?? status.rate_tier} rate
          {status.rate_limit ? `: ${status.rate_limit.read_per_min.toLocaleString("en-IN")} reads and ${status.rate_limit.write_per_min.toLocaleString("en-IN")} changes a minute` : ""} · up to{" "}
          {status.max_keys} keys
        </p>
      ) : (
        <Notice tone="neutral" tag="Partner apps only">
          Your club has partner apps connected. API keys and webhooks of your own come with API access, which the MyOtherApp team turns on: ask them through Help.
        </Notice>
      )}
      {tabs.length > 1 ? <TabRail label="Integration sections" items={tabs} value={current} onChange={(k) => setTab(k as Tab)} /> : null}
      <div role={tabs.length > 1 ? "tabpanel" : undefined}>
        {current === "keys" ? <KeysPanel status={status} /> : null}
        {current === "webhooks" ? <WebhooksPanel /> : null}
        {current === "apps" ? <AppsPanel /> : null}
        {current === "usage" ? <UsagePanel status={status} /> : null}
      </div>
    </>
  );
}
