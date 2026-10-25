"use client";

import * as React from "react";
import { DownloadIcon, UsersRoundIcon } from "lucide-react";
import { formatDate, formatNumber } from "@moa/app-kit";
import { EmptyState, FigurePanel, Notice, Pager, SearchField, Skeleton, cn } from "@moa/ui";

import { contactsExportUrl } from "../api";
import { useContacts } from "../queries";
import { PAGE_SIZE, type ContactFilters } from "../schemas";

const field = "input h-9";
const label = "eyebrow mb-1.5 block";

type Came = "all" | "yes" | "no";

/**
 * The contact book: the guests each event's close-out kept for the club,
 * on events where "Keep contacts for the club" was switched on. Searchable,
 * filtered by event, by when the event ended and by whether they came, and
 * exported as a file with the same filters.
 */
export function ContactsPage() {
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  const [eventId, setEventId] = React.useState<string>("");
  const [came, setCame] = React.useState<Came>("all");
  const [since, setSince] = React.useState("");
  const [until, setUntil] = React.useState("");
  const [page, setPage] = React.useState(1);

  const filters: ContactFilters = {
    q: q || undefined,
    event_id: eventId ? Number(eventId) : null,
    attended: came === "all" ? null : came === "yes",
    since: since || undefined,
    until: until || undefined,
  };
  const list = useContacts(filters, page, PAGE_SIZE);
  const data = list.data;
  const filtered = Boolean(filters.q || filters.event_id || filters.attended !== null || filters.since || filters.until);
  // Any change of filter starts again from the first page.
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  if (data === null) {
    return (
      <div className="grid gap-5">
        <h1 className="page-title">Contacts</h1>
        <Notice tone="neutral">The contact book isn&apos;t available yet. It turns up here once MyOtherApp switches it on.</Notice>
      </div>
    );
  }

  const groups = data?.groups ?? [];
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const everKept = groups.reduce((n, g) => n + g.contacts, 0);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="text-ink-3 mt-1 max-w-[640px] text-[12.5px]">
            The guests you kept at close-out — only from events where “Keep contacts for the club” was on.
            {data ? ` ${formatNumber(everKept)} kept from ${formatNumber(groups.length)} ${groups.length === 1 ? "event" : "events"}.` : ""}
          </p>
        </div>
        {data && everKept > 0 ? (
          <a href={contactsExportUrl(filters)} className="btn btn-secondary" download>
            <DownloadIcon className="size-4" /> Export {filtered ? "these" : "all"} as CSV
          </a>
        ) : null}
      </div>

      <FigurePanel className="grid gap-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <span className={label}>Search</span>
            <SearchField
              value={search}
              onChange={setSearch}
              onCommit={(v) => change(setQ)(v.trim())}
              placeholder="Name, email, phone or event"
              label="Search contacts"
            />
          </div>
          <div>
            <label htmlFor="contacts-event" className={label}>
              Event
            </label>
            <select id="contacts-event" value={eventId} onChange={(e) => change(setEventId)(e.target.value)} className={cn(field, "w-[220px] py-0")}>
              <option value="">Every event</option>
              {groups.map((g) => (
                <option key={g.event_id} value={String(g.event_id)}>
                  {g.event_name} ({formatNumber(g.contacts)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="contacts-came" className={label}>
              Came
            </label>
            <select id="contacts-came" value={came} onChange={(e) => change(setCame)(e.target.value as Came)} className={cn(field, "w-[140px] py-0")}>
              <option value="all">Everyone</option>
              <option value="yes">Came</option>
              <option value="no">Didn&apos;t come</option>
            </select>
          </div>
          <div>
            <label htmlFor="contacts-since" className={label}>
              Event ended from
            </label>
            <input id="contacts-since" type="date" value={since} max={until || undefined} onChange={(e) => change(setSince)(e.target.value)} className={cn(field, "w-[160px]")} />
          </div>
          <div>
            <label htmlFor="contacts-until" className={label}>
              to
            </label>
            <input id="contacts-until" type="date" value={until} min={since || undefined} onChange={(e) => change(setUntil)(e.target.value)} className={cn(field, "w-[160px]")} />
          </div>
          {filtered ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch("");
                setQ("");
                setEventId("");
                setCame("all");
                setSince("");
                setUntil("");
                setPage(1);
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {list.isPending ? (
          <Skeleton className="h-[240px]" />
        ) : list.isError ? (
          <Notice tone="refuse">{list.error instanceof Error ? list.error.message : "Could not read the contact book."}</Notice>
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState tone="muted" title="No contacts match" description="Try another event, dates or search." />
          ) : (
            <EmptyState
              tone="muted"
              icon={<UsersRoundIcon />}
              title="No contacts kept yet"
              description="Switch on “Keep contacts for the club” in an event's Close-out. When the guest list is cleared after the event, each guest's name, email, phone and whether they came is kept here."
            />
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="text-ink-3 border-line-soft border-b text-[11.5px]">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium">Phone</th>
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="py-2 font-medium">Came</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-line-soft border-b last:border-0">
                      <td className="text-ink py-2 pr-3 font-medium">
                        {c.name || "—"}
                        {c.role !== "attendee" ? <span className="text-ink-3 ml-1.5 text-[11.5px] font-normal">{c.role}</span> : null}
                      </td>
                      <td className="text-ink-2 py-2 pr-3">{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "—"}</td>
                      <td className="text-ink-2 py-2 pr-3 font-mono text-[12px]">{c.phone || "—"}</td>
                      <td className="text-ink-2 py-2 pr-3">
                        {c.event_name}
                        {c.event_ended_at ? <span className="text-ink-3 ml-1.5 text-[11.5px]">{formatDate(c.event_ended_at)}</span> : null}
                      </td>
                      <td className="py-2">{c.attended ? <span className="text-admit">Yes</span> : <span className="text-ink-3">No</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={page}
              pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
              total={total}
              pageSize={PAGE_SIZE}
              noun={["contact", "contacts"]}
              onPage={setPage}
              busy={list.isFetching}
            />
          </>
        )}
      </FigurePanel>
    </div>
  );
}
