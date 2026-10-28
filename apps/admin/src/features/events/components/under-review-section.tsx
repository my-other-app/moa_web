"use client";

import * as React from "react";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { SectionTitle, formatDateTime, formatNumber } from "@moa/app-kit";
import {
  Button,
  DataTable,
  FigurePanel,
  Pager,
  SearchField,
  StatusBadge,
  TabRail,
  Toolbar,
  ToolbarEnd,
  type DataTableColumn,
  type StatusTone,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useCan } from "@/hooks/use-can";

import { useExportUnderReview, useUnderReview } from "../queries";
import {
  CLOSED_REASON,
  REVIEW_LABEL,
  type ReviewRow,
  type ReviewStatus,
  type ReviewTab,
} from "../schemas";

/** Where the events list's "N under review" lands. */
export const UNDER_REVIEW_ANCHOR = "under-review";

const PAGE_SIZES = [20, 50, 100];
/** A search is shown whole, up to the server's most per page. */
const SEARCH_LIMIT = 200;

const STATUS_TONE: Record<ReviewStatus, StatusTone> = {
  pending: "info",
  approved: "success",
  declined: "destructive",
  withdrawn: "default",
  lapsed: "warning",
  closed: "default",
};

/** Always offered, in the order a registration moves; Expired and Closed join once anyone is. */
const FIXED_TABS: readonly ReviewStatus[] = ["pending", "approved", "declined", "withdrawn"];
const OPTIONAL_TABS: readonly ReviewStatus[] = ["lapsed", "closed"];

/** What the status badge alone doesn't say. */
function statusNote(row: ReviewRow): string | null {
  if (row.status === "approved" && row.pay_by && !row.registration_id) {
    return `Paying · by ${formatDateTime(row.pay_by)}`;
  }
  if (row.status === "closed" && row.closed_reason) {
    return CLOSED_REASON[row.closed_reason] ?? null;
  }
  return null;
}

function emptyMessage(tab: ReviewTab, q: string): string {
  if (q) return `Nobody matches “${q}”.`;
  if (tab === "pending") return "No registrations to review.";
  if (tab === "all") return "Nobody has registered yet.";
  return `No ${REVIEW_LABEL[tab].toLowerCase()} registrations.`;
}

const columns: DataTableColumn<ReviewRow>[] = [
  {
    key: "name",
    header: "Name",
    cell: (row) => (
      <div className="min-w-0">
        <p className="text-ink m-0 max-w-[220px] truncate font-medium">{row.full_name}</p>
        {/* On a phone the contact and time columns are hidden; they sit under the name. */}
        <p className="text-ink-3 m-0 max-w-[220px] truncate text-xs md:hidden">
          {[row.email, row.phone].filter(Boolean).join(" · ") || "—"}
        </p>
        <p className="text-ink-3 m-0 text-[11px] tabular-nums md:hidden">{formatDateTime(row.submitted_at)}</p>
      </div>
    ),
  },
  {
    key: "email",
    header: "Email",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) => <span className="text-ink-2 block max-w-[240px] truncate">{row.email ?? "—"}</span>,
  },
  {
    key: "phone",
    header: "Phone",
    className: "hidden md:table-cell whitespace-nowrap",
    headerClassName: "hidden md:table-cell",
    cell: (row) => <span className="text-ink-2 tabular-nums">{row.phone ?? "—"}</span>,
  },
  {
    key: "ticket",
    header: "Ticket type",
    className: "hidden lg:table-cell",
    headerClassName: "hidden lg:table-cell",
    cell: (row) => <span className="text-ink-2 block max-w-[180px] truncate">{row.ticket_type?.name ?? "—"}</span>,
  },
  {
    key: "registered",
    header: "Registered",
    className: "hidden md:table-cell whitespace-nowrap",
    headerClassName: "hidden md:table-cell",
    cell: (row) => <span className="text-ink-2 text-xs tabular-nums">{formatDateTime(row.submitted_at)}</span>,
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => {
      const note = statusNote(row);
      return (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge tone={STATUS_TONE[row.status]} label={REVIEW_LABEL[row.status]} />
          {note ? <span className="text-ink-3 text-[11.5px]">{note}</span> : null}
        </div>
      );
    },
  },
];

/**
 * The people on an event that reviews registrations, for an admin: who is
 * under review, confirmed, declined, cancelled; searched, paged and exported.
 * Read-only -- the club confirms and declines in its own dashboard, and the
 * server refuses an admin who tries.
 *
 * Hidden altogether when the server won't show it (older, or refusing
 * admins): the query answers null, not an error.
 */
export function UnderReviewSection({ eventId }: { eventId: number }) {
  const canExport = useCan("export_data");
  const exporter = useExportUnderReview(eventId);
  const [tab, setTab] = React.useState<ReviewTab>("pending");
  const [searchInput, setSearchInput] = React.useState("");
  const [q, setQ] = React.useState("");
  const [pageSize, setPageSize] = React.useState(50);
  // The server pages by cursor: the `after` of each page seen, so Previous is free.
  const [cursors, setCursors] = React.useState<(string | null)[]>([null]);
  const [page, setPage] = React.useState(1);

  const list = useUnderReview(eventId, {
    status: tab,
    q: q || undefined,
    after: q ? null : (cursors[page - 1] ?? null),
    limit: q ? SEARCH_LIMIT : pageSize,
  });
  const data = list.data;

  const restart = () => {
    setCursors([null]);
    setPage(1);
  };

  // Arrived from the events list's "N under review": bring the section into view once it's there.
  const ref = React.useRef<HTMLElement>(null);
  const arrived = React.useRef(false);
  React.useEffect(() => {
    if (arrived.current || !data || typeof window === "undefined") return;
    arrived.current = true;
    if (window.location.hash === `#${UNDER_REVIEW_ANCHOR}`) ref.current?.scrollIntoView({ block: "start" });
  }, [data]);

  // An older server, or one that won't show an admin: nothing to show.
  if (data === null) return null;

  const counts = data?.counts;
  const countOf = (t: ReviewTab) => (counts ? (t === "all" ? data.total : counts[t]) : null);
  const tabs: ReviewTab[] = [
    ...FIXED_TABS,
    ...OPTIONAL_TABS.filter((s) => tab === s || (counts?.[s] ?? 0) > 0),
    "all",
  ];
  const rows = data?.items ?? [];
  const tabTotal = countOf(tab) ?? 0;
  const pageCount = data?.next ? Math.max(page + 1, Math.ceil(tabTotal / pageSize)) : page;

  return (
    <section
      ref={ref}
      id={UNDER_REVIEW_ANCHOR}
      aria-labelledby={`${UNDER_REVIEW_ANCHOR}-title`}
      className="scroll-mt-20 space-y-3"
    >
      <SectionTitle>
        <span id={`${UNDER_REVIEW_ANCHOR}-title`}>Registrations under review</span>
      </SectionTitle>
      <p className="text-ink-3 m-0 text-[12.5px]">
        Read-only. The club confirms and declines registrations in its own dashboard.
      </p>

      <FigurePanel className="overflow-hidden p-0">
        <div className="px-3 pt-1">
          <TabRail
            label="Registration status"
            value={tab}
            onChange={(key) => {
              setTab(key as ReviewTab);
              restart();
            }}
            items={tabs.map((t) => {
              const n = countOf(t);
              return { key: t, label: REVIEW_LABEL[t], count: n === null ? null : formatNumber(n) };
            })}
          />
        </div>

        <Toolbar>
          {/* The queue is oldest first (the order the club confirms in); the rest newest first. */}
          <span className="text-ink-3 hidden font-mono text-[11px] sm:inline">
            {tab === "pending" ? "Oldest first" : "Newest first"}
          </span>
          <ToolbarEnd className="w-full sm:w-auto">
            <SearchField
              label="Search registrations under review"
              placeholder="Name, email or phone"
              value={searchInput}
              onChange={setSearchInput}
              onCommit={(value) => {
                const next = value.trim();
                if (next === q) return;
                setQ(next);
                restart();
              }}
              size="sm"
              className="w-full sm:w-60"
            />
            {canExport ? (
              <Button
                size="sm"
                variant="secondary"
                className={pressable}
                disabled={exporter.isPending || !data || data.total === 0}
                onClick={() => exporter.mutate()}
              >
                {exporter.isPending ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Export CSV
              </Button>
            ) : null}
          </ToolbarEnd>
        </Toolbar>

        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          isLoading={list.isPending}
          isError={list.isError}
          loadingMessage="Loading registrations…"
          errorMessage="The registrations could not load. Try again in a moment."
          emptyMessage={emptyMessage(tab, q)}
          className={list.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}
        />

        {data && rows.length > 0 ? (
          <div className="border-line-soft border-t px-4 py-3">
            {q ? (
              <p className="text-muted-foreground m-0 font-mono text-[12px] tabular-nums">
                {data.next
                  ? `The first ${formatNumber(rows.length)} matches. Narrow the search to see the rest.`
                  : `${formatNumber(rows.length)} ${rows.length === 1 ? "match" : "matches"}`}
              </p>
            ) : (
              <Pager
                page={page}
                pageCount={pageCount}
                total={Math.max(tabTotal, (page - 1) * pageSize + rows.length)}
                pageSize={pageSize}
                sizes={PAGE_SIZES}
                noun={["person", "people"]}
                busy={list.isFetching}
                onPage={(next) => {
                  if (next > page) {
                    if (!data.next) return;
                    setCursors((c) => [...c.slice(0, page), data.next]);
                  }
                  setPage(next);
                }}
                onPageSize={(size) => {
                  setPageSize(size);
                  restart();
                }}
              />
            )}
          </div>
        ) : null}
      </FigurePanel>
    </section>
  );
}
