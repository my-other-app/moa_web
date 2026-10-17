"use client";

import * as React from "react";
import Link from "next/link";
import { formatDate, formatNumber } from "@moa/app-kit";
import { InlineAlert, NativeSelect, Pager, Skeleton, cn } from "@moa/ui";

import { ClubPicker, type PickedClub } from "@/components/club-picker";

import { formatPaise, monthLabel } from "../format";
import { useCharges } from "../queries";

const GRID = "grid grid-cols-[minmax(0,1fr)_auto] gap-3 md:grid-cols-[96px_minmax(160px,1.4fr)_minmax(120px,1fr)_110px_100px_100px_minmax(130px,1fr)]";
const WIDE = "hidden md:block";

const STATUS_TAG: Record<string, string> = {
  captured: "tag tag-accent",
  refunded: "tag tag-neutral",
  partially_refunded: "tag tag-outline",
  failed: "tag tag-outline",
};

/**
 * Every plan charge Razorpay took, newest first: by month, by club, paged,
 * with the sum of everything the filters match (the server's `sum_paise`,
 * not this page's rows added up).
 */
export function ChargesPanel({ months }: { months: string[] }) {
  const [month, setMonth] = React.useState("");
  const [club, setClub] = React.useState<PickedClub | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const charges = useCharges({ offset: (page - 1) * pageSize, limit: pageSize, month: month || undefined, clubId: club?.id });
  const rows = (charges.data?.items ?? []).slice(0, pageSize);
  const total = charges.data?.total ?? 0;
  const filtered = Boolean(month || club);

  return (
    <section aria-labelledby="charges-title" className="bg-surface border-line-soft shadow-card flex flex-col gap-3 rounded-[var(--radius-card)] border p-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 id="charges-title" className="text-ink m-0 text-[14.5px] font-semibold tracking-[-0.01em]">
            Charges
          </h3>
          <p className="text-ink-3 m-0 mt-0.5 text-[12.5px]" role="status">
            {charges.data
              ? `${formatPaise(charges.data.sum_paise)} across ${formatNumber(total)} ${total === 1 ? "charge" : "charges"}${filtered ? " matching the filters" : ""}`
              : "Plan payments Razorpay took"}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <NativeSelect
            size="sm"
            aria-label="Month"
            className="w-auto min-w-[140px]"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Every month</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </NativeSelect>
          <ClubPicker
            label="Club"
            value={club}
            onChange={(c) => {
              setClub(c);
              setPage(1);
            }}
            className="w-[240px]"
          />
        </div>
      </div>

      {charges.isError ? (
        <InlineAlert tone="destructive" title="Could not load the charges">
          {charges.error instanceof Error ? charges.error.message : "Try again in a moment."}
        </InlineAlert>
      ) : charges.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-ink-2 m-0 py-6 text-[13px]">{filtered ? "No charges match. Clear the filters to see the rest." : "No plan has been charged yet."}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div role="table" aria-label="Charges" className={cn("flex flex-col md:min-w-[860px]", charges.isPlaceholderData && "opacity-60 transition-opacity")}>
              <div role="row" className={cn(GRID, "micro px-1.5 py-2")}>
                <span role="columnheader" className={WIDE}>
                  Date
                </span>
                <span role="columnheader">Club</span>
                <span role="columnheader" className={WIDE}>
                  Plan
                </span>
                <span role="columnheader" className="text-right">
                  Amount
                </span>
                <span role="columnheader" className={cn(WIDE, "text-right")}>
                  Refunded
                </span>
                <span role="columnheader" className={WIDE}>
                  Status
                </span>
                <span role="columnheader" className={WIDE}>
                  Razorpay
                </span>
              </div>
              {rows.map((row) => (
                <div role="row" key={row.id} className={cn(GRID, "rule-fade items-center px-1.5 py-2 text-[13px]")}>
                  <span role="cell" className="text-ink-2 hidden text-[12.5px] md:block">
                    {formatDate(row.charged_at)}
                  </span>
                  <span role="cell" className="flex min-w-0 flex-col">
                    {row.club ? (
                      <Link href={`/clubs/${row.club.id}`} className="truncate hover:underline">
                        {row.club.name}
                      </Link>
                    ) : (
                      <span className="truncate">—</span>
                    )}
                    <span className="text-ink-3 truncate text-[11.5px] md:hidden">
                      {formatDate(row.charged_at)} · {row.plan_name ?? "—"}
                    </span>
                  </span>
                  <span role="cell" className={cn(WIDE, "text-ink-2 truncate text-[12.5px]")}>
                    {row.plan_name ?? "—"}
                    {row.cycle ? <span className="text-ink-3"> · {row.cycle}</span> : null}
                  </span>
                  <span role="cell" className="text-right tabular-nums">
                    {formatPaise(row.amount_paise)}
                  </span>
                  <span role="cell" className={cn(WIDE, "text-ink-2 text-right tabular-nums")}>
                    {row.refunded_paise > 0 ? `−${formatPaise(row.refunded_paise)}` : "—"}
                  </span>
                  <span role="cell" className={WIDE}>
                    <span className={STATUS_TAG[row.status] ?? "tag tag-neutral"}>{row.status.replace(/_/g, " ")}</span>
                  </span>
                  <span role="cell" className={cn(WIDE, "text-ink-3 truncate font-mono text-[11.5px]")}>
                    {row.razorpay_payment_id ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <Pager
            page={page}
            pageCount={Math.max(1, Math.ceil(total / pageSize))}
            total={total}
            pageSize={pageSize}
            noun={["charge", "charges"]}
            busy={charges.isFetching}
            onPage={setPage}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}
    </section>
  );
}
