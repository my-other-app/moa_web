"use client";

import * as React from "react";
import { CheckCheckIcon } from "lucide-react";
import { formatNumber, useListParams } from "@moa/app-kit";
import { InlineAlert, Pager, Skeleton, cn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { useMarkAllRead, useMarkRead, useNotifications } from "../queries";
import { NOTIFICATION_KINDS, kindLabel } from "../schemas";
import { NotificationRow } from "./notification-row";

const PAGE_SIZE = 20;

/**
 * Every notification, newest first: filtered by kind and by unread, paged,
 * each with its way to the club or the subscription. The filters live in
 * the URL, so "unread payment failures" is a link an admin can send.
 */
export function NotificationsPage() {
  const params = useListParams({ pageSize: PAGE_SIZE });
  const canMark = useCan("moderate");
  const [now] = React.useState(() => new Date());
  const kind = params.param("kind") ?? "";
  const unreadOnly = params.param("unread") === "1";
  const pageSize = params.pageSize;

  const list = useNotifications({ unread: unreadOnly || undefined, kind: kind || undefined, offset: (params.page - 1) * pageSize, limit: pageSize });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const data = list.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unread = data?.unread ?? 0;

  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-end gap-3.5">
        <div className="flex-1 basis-[300px]">
          <h2 className="m-0 text-[32px] leading-[1.12] tracking-[-0.015em]">Notifications</h2>
          <span className="text-ink-3 text-[13px]">
            {data ? `${formatNumber(unread)} unread · applications, payments, failed charges and plan changes` : "Applications, payments, failed charges and plan changes"}
          </span>
        </div>
        {canMark && unread > 0 ? (
          <button type="button" className="btn btn-secondary" disabled={markAll.isPending} onClick={() => markAll.mutate(kind || null)}>
            {/* Filtered to a kind, it marks only those. */}
            <CheckCheckIcon className="size-4" /> {kind ? `Mark all ${kindLabel(kind).toLowerCase()} read` : "Mark all read"}
          </button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { key: "", label: "All" },
          { key: "1", label: "Unread" },
        ].map((option) => {
          const active = (unreadOnly ? "1" : "") === option.key;
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={active}
              onClick={() => params.setParam("unread", option.key || undefined)}
              className={cn(
                "rounded-[999px] border px-3 py-1.5 text-[12.5px] whitespace-nowrap transition-colors",
                active ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-2 hover:text-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
        <select aria-label="Kind" className="input ml-auto h-9 w-auto min-w-[200px] py-0 text-[12.5px]" value={kind} onChange={(e) => params.setParam("kind", e.target.value || undefined)}>
          <option value="">Every kind</option>
          {NOTIFICATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k)}
            </option>
          ))}
        </select>
      </div>

      {list.isError ? (
        <InlineAlert tone="destructive" title="Could not load the notifications">
          {list.error instanceof Error ? list.error.message : "Try again in a moment."}
        </InlineAlert>
      ) : list.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-8">
          <span className="text-[16px]">{kind || unreadOnly ? "Nothing matches" : "Nothing yet"}</span>
          <span className="text-ink-2 text-[13px]">{kind || unreadOnly ? "Clear the filters to see the rest." : "Applications, payments and failed charges show up here as they happen."}</span>
        </div>
      ) : (
        <div className={cn("bg-surface shadow-card overflow-hidden rounded-[var(--radius-card)]", list.isPlaceholderData && "opacity-60 transition-opacity")}>
          <ul aria-label="Notifications" className="divide-line-soft divide-y">
            {items.map((n) => (
              <NotificationRow key={n.id} n={n} now={now} canMark={canMark} onRead={(id) => markRead.mutate(id)} />
            ))}
          </ul>
          <div className="border-line-soft border-t px-3 py-2.5">
            <Pager
              page={params.page}
              pageCount={Math.max(1, Math.ceil(total / pageSize))}
              total={total}
              pageSize={pageSize}
              noun={["notification", "notifications"]}
              busy={list.isFetching}
              onPage={params.setPage}
              onPageSize={params.setPageSize}
            />
          </div>
        </div>
      )}
    </div>
  );
}
