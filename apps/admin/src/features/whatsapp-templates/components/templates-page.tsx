"use client";

import { RefreshCwIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import { Button, DataTable, Notice, Skeleton, StatusBadge, type DataTableColumn } from "@moa/ui";

import { usePlatformTemplates, useRefreshTemplates } from "../queries";
import { statusTone, type WhatsAppTemplate } from "../schemas";

const columns: DataTableColumn<WhatsAppTemplate>[] = [
  {
    key: "name",
    header: "Template",
    cell: (t) => (
      <div className="min-w-0">
        <code className="text-xs">{t.name ?? "—"}</code>
        {t.expected ? <span className="text-ink-3 ml-1 text-[11px]">· the platform sends it</span> : null}
        {t.body ? <p className="text-ink-3 m-0 line-clamp-2 text-xs">{t.body}</p> : null}
      </div>
    ),
  },
  { key: "language", header: "Language", cell: (t) => <span className="text-xs">{t.language ?? "—"}</span> },
  { key: "category", header: "Category", className: "hidden md:table-cell", headerClassName: "hidden md:table-cell", cell: (t) => <span className="text-xs">{t.category ?? "—"}</span> },
  {
    key: "status",
    header: "Meta says",
    cell: (t) => (
      <div className="flex flex-col gap-0.5">
        <StatusBadge tone={statusTone(t.status)} label={t.status ?? "unknown"} />
        {t.rejected_reason ? <span className="text-destructive text-xs">{t.rejected_reason.replace(/_/g, " ").toLowerCase()}</span> : null}
      </div>
    ),
  },
  { key: "quality", header: "Quality", className: "hidden md:table-cell", headerClassName: "hidden md:table-cell", cell: (t) => <span className="text-xs">{t.quality?.toLowerCase() ?? "—"}</span> },
];

/** The templates on MyOtherApp's own WhatsApp number, and Meta's verdict on each. */
export function TemplatesPage() {
  const { data, isPending, isError, error } = usePlatformTemplates();
  const refresh = useRefreshTemplates();
  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (isError) return <Notice tone="refuse">{error.message || "Could not read the templates"}</Notice>;
  if (!data.configured) {
    return (
      <Notice tone="caution" tag="Off">
        MyOtherApp&apos;s WhatsApp number is not set up on this server (APP_WHATSAPP_ACCESS_TOKEN and
        APP_WHATSAPP_PHONE_NUMBER_ID). The platform sends: {data.expected.map((e) => e.name).join(", ")}.
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-3 m-0 text-sm" role="status">
          {data.waba_id ? `Account ${data.waba_id} · ` : ""}
          {data.checked_at ? `asked Meta ${formatDateTime(data.checked_at)}` : "not asked yet"}
        </p>
        <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
          <RefreshCwIcon className={refresh.isPending ? "animate-spin" : undefined} /> Ask Meta again
        </Button>
      </div>
      {data.error ? <Notice tone="caution">{data.error}</Notice> : null}
      {data.missing.length ? (
        <Notice tone="refuse" tag="Missing">
          Meta has no template named {data.missing.map((m) => `${m.name} (${m.purpose.toLowerCase()})`).join(", ")}. Until one
          is approved, those messages go by email only.
        </Notice>
      ) : null}
      <DataTable columns={columns} data={data.templates} rowKey={(t) => `${t.id ?? t.name}-${t.language}`} emptyMessage="No templates on this account." />
    </div>
  );
}
