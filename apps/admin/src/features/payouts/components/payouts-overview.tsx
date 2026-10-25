"use client";

import * as React from "react";
import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { formatCurrency, formatDate, formatNumber } from "@moa/app-kit";
import { Button, Checkbox, DataTable, Label, Pager, SearchField, StatCard, type DataTableColumn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { useFetchFees, usePayoutOverview } from "../queries";
import { feeRateLabel, type OverviewRow } from "../schemas";

const PAGE = 50;

export function Money({ value, muted = false, negative = false }: { value: number; muted?: boolean; negative?: boolean }) {
  return (
    <span className={muted ? "text-muted-foreground tabular-nums" : "tabular-nums"}>
      {negative && value > 0 ? "−" : ""}
      {formatCurrency(value)}
    </span>
  );
}

/**
 * What MyOtherApp owes each club for the tickets and store pieces it sold on
 * MyOtherApp's own Razorpay, biggest balance first. Fees not read from
 * Razorpay yet are estimated, and marked.
 */
export function PayoutsOverview() {
  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [owing, setOwing] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const { data, isPending, isError, isFetching } = usePayoutOverview({ q: search || undefined, owing, offset: (page - 1) * PAGE, limit: PAGE });
  const canMoney = useCan("manage_money");
  const fees = useFetchFees();
  const totals = data?.totals ?? {};
  const rate = feeRateLabel(data?.fee_rate_estimate ?? 0.0236);

  const columns: DataTableColumn<OverviewRow>[] = [
    {
      key: "club",
      header: "Club",
      cell: (row) => (
        <Link href={`/payouts/${row.club.id}`} className="font-medium underline-offset-4 hover:underline">
          {row.club.name}
          {row.club.is_deleted ? <span className="text-muted-foreground text-xs font-normal"> (deleted)</span> : null}
        </Link>
      ),
    },
    { key: "gross", header: "Gross", className: "text-right", headerClassName: "text-right", cell: (row) => <Money value={row.gross} /> },
    {
      key: "fees",
      header: "Fees",
      className: "text-right",
      headerClassName: "text-right",
      cell: (row) => (
        <span title={row.fees_estimated ? `${row.fees_estimated} payment(s) estimated at ${rate}` : undefined}>
          <Money value={row.fees} negative muted />
          {row.fees_estimated ? <span className="text-ink-3 ml-1 text-[11px]">est.</span> : null}
        </span>
      ),
    },
    { key: "refunds", header: "Refunds", className: "text-right", headerClassName: "text-right", cell: (row) => <Money value={row.refunds} negative muted /> },
    {
      key: "chargebacks",
      header: "Chargebacks",
      className: "hidden text-right lg:table-cell",
      headerClassName: "hidden text-right lg:table-cell",
      cell: (row) => <Money value={row.chargebacks} negative muted />,
    },
    { key: "net", header: "Net", className: "text-right", headerClassName: "text-right", cell: (row) => <Money value={row.net} /> },
    {
      key: "paid",
      header: "Paid out",
      className: "hidden text-right md:table-cell",
      headerClassName: "hidden text-right md:table-cell",
      cell: (row) => (
        <span>
          <Money value={row.paid_out} muted />
          {row.last_payout_on ? <span className="text-ink-3 block text-[11px]">last {formatDate(row.last_payout_on)}</span> : null}
        </span>
      ),
    },
    {
      key: "outstanding",
      header: "Outstanding",
      className: "text-right",
      headerClassName: "text-right",
      cell: (row) => <strong className={row.outstanding > 0 ? "text-ink tabular-nums" : "text-muted-foreground tabular-nums"}>{formatCurrency(row.outstanding)}</strong>,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Outstanding" value={formatCurrency(totals.outstanding ?? 0)} caption={`${formatNumber(data?.owing_clubs ?? 0)} clubs are owed`} />
        <StatCard label="Net of fees and refunds" value={formatCurrency(totals.net ?? 0)} caption={`${formatCurrency(totals.gross ?? 0)} gross`} />
        <StatCard
          label="Fees"
          value={formatCurrency(totals.fees ?? 0)}
          caption={totals.fees_estimated ? `${formatNumber(totals.fees_estimated)} estimated at ${rate}` : "All read from Razorpay"}
        />
        <StatCard label="Paid out" value={formatCurrency(totals.paid_out ?? 0)} caption={`${formatNumber(totals.payouts ?? 0)} payouts`} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            label="Search clubs"
            placeholder="Club name…"
            value={q}
            onChange={setQ}
            onCommit={(value) => {
              setSearch(value.trim());
              setPage(1);
            }}
            className="w-[240px]"
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="owing-only"
              checked={owing}
              onCheckedChange={(v) => {
                setOwing(v === true);
                setPage(1);
              }}
            />
            <Label htmlFor="owing-only">Only clubs owed money</Label>
          </div>
        </div>
        {canMoney ? (
          <Button size="sm" variant="outline" disabled={fees.isPending} onClick={() => fees.mutate()}>
            <RefreshCwIcon /> Fetch fees from Razorpay
          </Button>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        data={data?.items}
        rowKey={(row) => row.club.id}
        isLoading={isPending}
        isError={isError}
        emptyMessage={search || owing ? "No club matches." : "No sales on MyOtherApp's Razorpay yet."}
      />
      {data && data.total > 0 ? (
        <Pager page={page} pageCount={Math.max(1, Math.ceil(data.total / PAGE))} total={data.total} pageSize={PAGE} noun={["club", "clubs"]} busy={isFetching} onPage={setPage} />
      ) : null}
      <p className="text-ink-3 m-0 text-xs">
        Only tickets and store pieces paid through MyOtherApp&apos;s own Razorpay are owed to clubs; money taken on a
        club&apos;s own account is the club&apos;s already. A fee marked est. is {rate} of the payment until its Razorpay fee
        is fetched.
      </p>
    </div>
  );
}
