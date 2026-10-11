"use client";

import * as React from "react";
import { DownloadIcon } from "lucide-react";
import { PageHeader, formatDateTime } from "@moa/app-kit";
import { Button, EmptyState, Pagination, Skeleton, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { contactsCsvUrl } from "../api";
import { useContacts } from "../queries";

const CELL = "px-4 py-3 text-left align-top";
const chip = (on: boolean) => cn("rounded-full border px-2.5 py-1 text-[12px] transition-colors", on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted");
const ROLE: Record<string, string> = { attendee: "Attendee", speaker: "Speaker", staff: "Staff" };

/** What retention kept of each event's guests: the four fields an organiser needs to reach them again. */
export function ContactsPage() {
  const [q, setQ] = React.useState("");
  const [settled, setSettled] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setSettled(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const [eventId, setEventId] = React.useState<number | undefined>();
  const [attended, setAttended] = React.useState<boolean | undefined>();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const query = { q: settled || undefined, eventId, attended, page, pageSize };
  const contacts = useContacts(query);
  const total = contacts.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const reset = () => setPage(1);
  const groups = contacts.data?.groups ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Guests kept from past events: name, email, phone, role, and whether they came. Written as each event's guest data is scrubbed, for clubs that keep contacts."
        action={
          <Button variant="outline" asChild className={pressable}>
            <a href={contactsCsvUrl(query)} download>
              <DownloadIcon /> Export CSV
            </a>
          </Button>
        }
      />
      {groups.length ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Events">
            <button type="button" className={chip(eventId === undefined)} onClick={() => (setEventId(undefined), reset())}>
              Every event
            </button>
            {groups.map((g) => (
              <button key={g.event_id} type="button" className={chip(eventId === g.event_id)} onClick={() => (setEventId(g.event_id), reset())}>
                {g.event_name} <span className="font-mono text-[10px] opacity-70">{g.contacts}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Attendance">
            <button type="button" className={chip(attended === undefined)} onClick={() => (setAttended(undefined), reset())}>
              Everyone
            </button>
            <button type="button" className={chip(attended === true)} onClick={() => (setAttended(true), reset())}>
              Came
            </button>
            <button type="button" className={chip(attended === false)} onClick={() => (setAttended(false), reset())}>
              Did not come
            </button>
          </div>
        </div>
      ) : null}
      <input value={q} onChange={(e) => (setQ(e.target.value), reset())} placeholder="Search name, email, phone or event" aria-label="Search contacts" className="h-9 w-72 rounded-md border bg-transparent px-3 text-sm" />
      {contacts.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : contacts.isError ? (
        <EmptyState tone="muted" title="Could not load the contacts" description={contacts.error.message} />
      ) : !contacts.data.items.length ? (
        <EmptyState tone="muted" title={total || groups.length ? "Nobody matches" : "No contacts kept yet"} description={groups.length ? "Try a wider filter." : "Contacts are kept when an event's guest data is scrubbed on its closeout page, with “Keep contacts for the club” on."} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/70 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              <tr>
                <th className={cn(CELL, "font-medium")}>Guest</th>
                <th className={cn(CELL, "font-medium")}>Contact</th>
                <th className={cn(CELL, "font-medium")}>Event</th>
                <th className={cn(CELL, "font-medium")}>Came</th>
                <th className={cn(CELL, "font-medium")}>Kept</th>
              </tr>
            </thead>
            <tbody>
              {contacts.data.items.map((c) => (
                <tr key={c.id} className="border-t border-border/60">
                  <td className={CELL}>
                    <div className="font-medium">{c.name}</div>
                    <div className="font-mono text-[10.5px] text-muted-foreground">{ROLE[c.role] ?? c.role}</div>
                  </td>
                  <td className={cn(CELL, "font-mono text-xs")}>{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</td>
                  <td className={CELL}>
                    {c.event_name}
                    {c.event_ended_at ? <div className="text-[10.5px] text-muted-foreground">{formatDateTime(c.event_ended_at)}</div> : null}
                  </td>
                  <td className={CELL}>{c.attended ? "Yes" : "No"}</td>
                  <td className={cn(CELL, "whitespace-nowrap text-muted-foreground")}>{c.archived_at ? formatDateTime(c.archived_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > pageSize ? (
            <div className="border-t border-border/60 px-4 py-2">
              <Pagination page={page} pageCount={pages} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={(n) => (setPageSize(n), setPage(1))} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
