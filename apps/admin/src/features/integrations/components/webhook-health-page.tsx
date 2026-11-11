"use client";

import * as React from "react";
import Link from "next/link";
import { ExportMenu, downloadCsv, downloadXlsx, formatDateTime, timestampedName, toCsv, type CsvColumn, type ExportFormat } from "@moa/app-kit";
import { CardLabel, EmptyState, FigurePanel, Notice, Skeleton, StatTile, StatusBadge, toast } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useCan } from "@/hooks/use-can";

import { useWebhookHealth } from "../queries";
import { answeredText, type FailingEndpoint } from "../schemas";
import { DailyBars } from "./parts";

const n = (v: number) => v.toLocaleString("en-IN");

export const FAILING_COLUMNS: CsvColumn<FailingEndpoint>[] = [
  { header: "Endpoint", value: (e) => e.url },
  { header: "Club", value: (e) => e.club?.name ?? "" },
  { header: "Club ID", value: (e) => e.club?.id ?? "" },
  { header: "Partner app", value: (e) => e.partner_app?.name ?? "" },
  { header: "On", value: (e) => (e.enabled ? "Yes" : "No, turned off") },
  { header: "Failing since", value: (e) => e.failing_since ?? "" },
  { header: "Failures in a row", value: (e) => e.consecutive_failures },
  { header: "Last answer", value: (e) => answeredText(e) },
];

/**
 * Integrations → Webhook health: how many changes went out in the last week
 * and how many failed, and every endpoint failing now, with whose it is. An
 * endpoint failing three days running is turned off by the server and its
 * owner emailed; this is where an admin sees it coming.
 */
export function WebhookHealthPage() {
  const health = useWebhookHealth();
  const canExport = useCan("export_data");
  const [busy, setBusy] = React.useState(false);
  const h = health.data;

  async function onExport(format: ExportFormat) {
    if (!h?.failing.length) return void toast.info("No failing endpoints to export");
    setBusy(true);
    try {
      if (format === "xlsx") await downloadXlsx(timestampedName("failing-webhooks", "xlsx"), h.failing, FAILING_COLUMNS, { sheet: "Failing webhooks" });
      else downloadCsv(timestampedName("failing-webhooks"), toCsv(h.failing, FAILING_COLUMNS));
    } finally {
      setBusy(false);
    }
  }

  if (health.isPending) return <Skeleton className="h-64 w-full" />;
  if (health.isError || !h)
    return <EmptyState tone="muted" title="Couldn't load webhook health" description="Try again in a moment." />;

  const sent = h.totals.delivered + h.totals.failed;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Delivered, 7 days" value={n(h.totals.delivered)} />
        <StatTile label="Failed" value={n(h.totals.failed)} note={sent ? `${((h.totals.failed / sent) * 100).toFixed(1)}% of sent` : undefined} />
        <StatTile label="Waiting to retry" value={n(h.totals.pending)} />
        <StatTile label="Endpoints failing" value={n(h.endpoints.failing)} note={`${n(h.endpoints.active)} on · ${n(h.endpoints.disabled)} turned off`} />
      </div>
      <FigurePanel className="flex flex-col gap-2 p-4" role="region" aria-label="Deliveries per day">
        <CardLabel right={<span className="text-ink-3 text-[11px]">Failures in red</span>}>Deliveries per day</CardLabel>
        {h.days.some((d) => d.delivered + d.failed > 0) ? (
          <DailyBars days={h.days.map((d) => ({ date: d.date, total: d.delivered + d.failed, bad: d.failed }))} what="Webhook deliveries" bad="failed" />
        ) : (
          <p className="text-ink-3 m-0 py-6 text-center text-[12.5px]">Nothing sent in the last 7 days.</p>
        )}
      </FigurePanel>
      <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Failing endpoints">
        <CardLabel right={canExport ? <ExportMenu size="sm" variant="outline" className={pressable} busy={busy} disabled={!h.failing.length} label="Export" onExport={(f) => void onExport(f)} /> : null}>
          Failing endpoints · {h.failing.length}
        </CardLabel>
        {h.failing.length === 0 ? (
          <Notice tone="admit" tag="All well">
            No endpoint is failing.
          </Notice>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {h.failing.map((e) => (
              <li key={e.endpoint_id} className="border-line-soft flex flex-col gap-1 border-b py-3 last:border-0" aria-label={e.url}>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-ink text-[12.5px] break-all">{e.url}</code>
                  <StatusBadge tone={e.enabled ? "destructive" : "default"} label={e.enabled ? "Failing" : "Turned off"} />
                </div>
                <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">
                  {e.club ? (
                    <Link href={`/clubs/${e.club.id}`} className="text-ink-2 hover:underline">
                      {e.club.name}
                    </Link>
                  ) : (
                    "No club"
                  )}
                  {e.partner_app ? ` · via ${e.partner_app.name}` : ""}
                  {e.failing_since ? ` · failing since ${formatDateTime(e.failing_since)}` : ""}
                  {` · ${e.consecutive_failures} in a row · ${answeredText(e)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </FigurePanel>
    </div>
  );
}
