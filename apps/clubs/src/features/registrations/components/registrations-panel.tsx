"use client";

import * as React from "react";
import {
  CheckIcon,
  DownloadIcon,
  IdCardIcon,
  Loader2Icon,
  EyeIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  UploadIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { formatCurrency, formatNumber, pct, useListParams } from "@moa/app-kit";
import { pageCount } from "@moa/api";
import {
  Button,
  Chip,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  FigurePanel,
  IconButton,
  NativeSelect,
  Notice,
  Pager,
  SearchField,
  Skeleton,
  StatTile,
  StatusBadge,
  Toolbar,
  ToolbarEnd,
} from "@moa/ui";

import { useEventSummary } from "@/features/console";
import { DeliveryBar, TicketCell } from "@/features/deliveries";
import { useEventDetail } from "@/features/events";
import { cardPdfUrl, openPdf } from "@/features/idcards";

import { exportUrl } from "../api";
import { useEventAnalytics, useImports, useMarkAttendance, useRegistrations, useSetRegistrationRole } from "../queries";
import { REGISTRATION_ROLES, eventFieldSchema, type EventField, type Registration, type RegistrationDetail, type RegistrationRole } from "../schemas";
import { AttendeeDetailDialog } from "./attendee-detail-dialog";
import { AttendeeFormDialog } from "./attendee-form-dialog";
import { ImportDialog, ImportRecord, importFileName } from "./import-panel";
import { RemoveAttendeeDialog } from "./remove-attendee-dialog";

const ROLE_LABELS: Record<RegistrationRole, string> = {
  attendee: "Attendee",
  speaker: "Speaker",
  staff: "Staff",
};
const ROLE_PLURAL: Record<RegistrationRole, string> = {
  attendee: "Attendees",
  speaker: "Speakers",
  staff: "Staff",
};

/** The filters the list reads from the URL; clearing them clears the search too. */
const FILTER_KEYS = ["role", "in", "delivery", "paid", "q"];

const CELL = "px-4 py-2.5 text-left align-middle";
const HEAD = "text-ink-3 px-4 py-2 text-left font-mono text-[10px] font-normal tracking-[0.06em] uppercase";

type DialogState =
  | { kind: "add" }
  | { kind: "import" }
  | { kind: "edit"; row: RegistrationDetail }
  | { kind: "remove"; row: { id: string; name: string } }
  | { kind: "detail"; id: string }
  | null;

const nameOf = (row: Registration) => row.full_name || row.name || row.user?.full_name || "Unknown";

function CheckInCell({ eventId, row }: { eventId: number; row: Registration }) {
  const mark = useMarkAttendance(eventId);
  if (row.is_attended) return <StatusBadge tone="success" label="Checked in" />;
  return (
    <Button
      size="xs"
      variant="secondary"
      // A revoked ticket is refused at the door; the API answers 409 to say so.
      disabled={mark.isPending || !!row.ticket_revoked_at}
      onClick={() => mark.mutate(row.id)}
      // The API has no un-mark endpoint, so this is one-way.
      title={row.ticket_revoked_at ? "This ticket was revoked — reinstate it first" : "Marks them as checked in — this cannot be undone here"}
    >
      {mark.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
      Check in
    </Button>
  );
}

/**
 * Which role someone is attending as. It decides which ticket and
 * certificate variant they are issued, so an event with a speaker design
 * needs this to reach anyone. The pick shows at once and holds while it saves.
 */
function RoleSelect({ eventId, row, name }: { eventId: number; row: Registration; name: string }) {
  const setRole = useSetRegistrationRole(eventId);
  const value = setRole.isPending && setRole.variables ? setRole.variables.role : row.role;
  return (
    <NativeSelect
      size="sm"
      value={value}
      disabled={setRole.isPending}
      aria-label={`Role for ${name}`}
      className="w-[7.5rem]"
      onChange={(e) => setRole.mutate({ registrationId: row.id, role: e.target.value as RegistrationRole })}
    >
      {REGISTRATION_ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </NativeSelect>
  );
}

function GuestRow({
  eventId,
  row,
  paidEvent,
  onOpen,
  onRemove,
}: {
  eventId: number;
  row: Registration;
  paidEvent: boolean;
  onOpen: () => void;
  onRemove: (name: string) => void;
}) {
  const name = nameOf(row);
  const contact = [row.email, row.phone].filter(Boolean).join(" · ");
  return (
    <tr className="border-line-soft hover:bg-sunken/40 border-t transition-colors">
      <td className={CELL}>
        <button type="button" onClick={onOpen} className="group block max-w-[260px] min-w-0 text-left" aria-label={`Open ${name}`}>
          <span className="text-ink group-hover:text-brand block truncate text-[13px] font-medium">{name}</span>
          <span className={cn("block truncate font-mono text-[11px]", contact ? "text-ink-3" : "text-caution")}>{contact || "no contact on file"}</span>
        </button>
        {row.email_bounced_at ? (
          <span className="mt-1 inline-flex" title={row.email_bounce_reason ?? "That address bounced"}>
            <StatusBadge tone="destructive" label="Email bounced · correct it to send again" />
          </span>
        ) : null}
      </td>
      <td className={CELL}>
        <span className="text-ink-2 block max-w-[220px] truncate text-[12.5px]" title={row.institution ?? ""}>
          {row.institution || <span className="text-ink-3">—</span>}
        </span>
      </td>
      <td className={CELL}>
        <RoleSelect eventId={eventId} row={row} name={name} />
      </td>
      <td className={CELL}>
        <span className="text-ink block font-mono text-[12px]">{row.ticket_id || "—"}</span>
        {row.admission_no ? <span className="text-ink-3 block font-mono text-[10.5px]">{row.admission_no}</span> : null}
      </td>
      <td className={CELL}>
        <TicketCell eventId={eventId} row={row} />
      </td>
      {paidEvent ? (
        <td className={cn(CELL, "whitespace-nowrap")}>
          {row.is_paid ? <StatusBadge tone="success" label="Paid" /> : <StatusBadge tone="warning" label="Unpaid" />}
          {row.is_paid && row.paid_amount ? (
            <span className="text-ink-3 mt-0.5 block font-mono text-[11px]">{formatCurrency(row.paid_amount)}</span>
          ) : !row.is_paid && row.actual_amount ? (
            <span className="text-ink-3 mt-0.5 block font-mono text-[11px]">{formatCurrency(row.actual_amount)} due</span>
          ) : null}
        </td>
      ) : null}
      <td className={cn(CELL, "whitespace-nowrap")}>
        <CheckInCell eventId={eventId} row={row} />
      </td>
      <td className={cn(CELL, "text-right")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={`Actions for ${name}`} variant="quiet" size="xs">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={onOpen}>
              <EyeIcon />
              <span className="flex flex-col">
                <span>Open in full</span>
                <span className="text-ink-3 text-[11.5px]">Contact, answers, ticket, deliveries, check-in — and correct them.</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openPdf(cardPdfUrl(eventId, row.id, { source: "manual", record: true }))}>
              <IdCardIcon /> Print ID card
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onRemove(name)}>
              <Trash2Icon />
              <span className="flex flex-col">
                <span>Remove from the list</span>
                <span className="text-[11.5px] opacity-80">Deletes the registration, ticket and check-in.</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

/**
 * The Attendees tab: everyone registered, to find, filter, act on and export.
 *
 * One line and four figures on the list — who is on it, who is in, who holds
 * a ticket, and who has yet to pay (or arrive) — each figure a way into the
 * list filtered to those people. What needs a look (an import running, an
 * address that bounced) is said once. Tickets are sent from the bar above
 * the list. The list itself carries the filters a desk actually uses, a
 * search across name, contact and ticket, and per guest: their role, their
 * ticket and its delivery, payment, check-in, and a menu to open them in
 * full, print their card, or take them off the list. Importing is a dialog
 * from the header; its permanent record closes the page.
 */
export function RegistrationsPanel({ eventId }: { eventId: number }) {
  const params = useListParams();
  const event = useEventDetail(eventId);
  const summary = useEventSummary(eventId);
  const analytics = useEventAnalytics(eventId);
  const imports = useImports(eventId);
  const listRef = React.useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [openImport, setOpenImport] = React.useState<string | null>(null);

  const roleParam = params.param("role");
  const role = roleParam && (REGISTRATION_ROLES as readonly string[]).includes(roleParam) ? (roleParam as RegistrationRole) : undefined;
  const checkedIn = params.param("in");
  const delivery = params.param("delivery") === "not_delivered" ? "not_delivered" : undefined;
  const paid = params.param("paid");

  const fields: EventField[] = React.useMemo(() => {
    const raw = (event.data as { additional_details?: unknown } | undefined)?.additional_details;
    return Array.isArray(raw) ? raw.flatMap((f) => (eventFieldSchema.safeParse(f).success ? [eventFieldSchema.parse(f)] : [])) : [];
  }, [event.data]);
  const slug = event.data?.slug ?? "";
  const paidEvent = !!event.data?.has_fee;

  const list = useRegistrations({
    eventId,
    search: params.search || undefined,
    isAttended: checkedIn === "yes" ? true : checkedIn === "no" ? false : undefined,
    isPaid: paid === "yes" ? true : paid === "no" ? false : undefined,
    role,
    delivery,
    offset: params.offset,
    limit: params.pageSize,
  });
  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? null;
  const pages = pageCount(total, params.pageSize) ?? 1;
  const filtered = !!(params.search || role || checkedIn || delivery || paid);
  const empty = !list.isPending && !list.isError && rows.length === 0 && !filtered;

  const s = summary.data;
  const a = analytics.data;
  const t = s?.tickets;
  const running = imports.data?.find((j) => j.status === "STARTED");
  const bounced = s?.analytics.contacts.bounced ?? 0;
  const roleCount = (r: RegistrationRole) => s?.analytics.by_type.find((ty) => ty.role === r)?.registered;
  const payment = a?.payment_status;

  // The export takes the check-in and payment filters; the others are the list's alone.
  const exportFilter = {
    ...(checkedIn === "yes" ? { isAttended: true } : checkedIn === "no" ? { isAttended: false } : {}),
    ...(paid === "yes" ? { isPaid: true } : paid === "no" ? { isPaid: false } : {}),
  };
  const exportScope = [checkedIn === "yes" ? "checked in" : checkedIn === "no" ? "not yet in" : null, paid === "yes" ? "paid" : paid === "no" ? "unpaid" : null].filter(Boolean).join(", ");

  /** A figure that leads into the list: set the one filter and bring the list into view. */
  const show = (key: string, value: string) => {
    params.setParam(key, value);
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const toggle = (key: string, value: string, current: string | undefined) => params.setParam(key, current === value ? undefined : value);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">Attendees</h2>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {s
              ? `${formatNumber(s.registered)} on the list · ${formatNumber(s.checked_in)} checked in · ${formatNumber(s.tickets.issued)} with a ticket${s.capacity ? ` · room for ${formatNumber(s.capacity)}` : ""}`
              : "Everyone registered for this event: find them, check them in, send their tickets, export the list."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setDialog({ kind: "import" })}>
            <UploadIcon /> Import
          </Button>
          <Button asChild variant="secondary">
            {/* A real navigation, not fetch: the browser handles the file and the cookie
                rides along because the gateway is same-origin. It is an xlsx workbook. */}
            <a
              href={exportUrl(eventId, exportFilter)}
              download
              title={`An Excel workbook of ${exportScope ? `the ${exportScope} guests` : "everyone on the list"}. Search, role and delivery filters are not applied to it.`}
            >
              <DownloadIcon /> Export{exportScope ? ` ${exportScope}` : ""} to Excel
            </a>
          </Button>
          <Button variant={empty ? "secondary" : "primary"} onClick={() => setDialog({ kind: "add" })}>
            <UserPlusIcon /> Add a guest
          </Button>
        </div>
      </header>

      {summary.isError ? null : !s ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[126px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <section aria-label="The list in figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="On the list"
            value={formatNumber(s.registered)}
            note={
              s.capacity
                ? s.registered >= s.capacity
                  ? `full · capacity ${formatNumber(s.capacity)}`
                  : `${formatNumber(s.capacity - s.registered)} of ${formatNumber(s.capacity)} places left`
                : s.registered
                  ? REGISTRATION_ROLES.map((r) => [r, roleCount(r) ?? 0] as const)
                      .filter(([, n]) => n > 0)
                      .map(([r, n]) => `${formatNumber(n)} ${(n === 1 ? ROLE_LABELS[r] : ROLE_PLURAL[r]).toLowerCase()}`)
                      .join(" · ") || "no capacity set"
                  : "nobody yet"
            }
          />
          <StatTile
            label="Checked in"
            value={formatNumber(s.checked_in)}
            note={s.registered ? `${pct(s.checked_in, s.registered)}% of the list` : "nobody on the list yet"}
            action={s.checked_in > 0 ? { label: "Show them", onClick: () => show("in", "yes") } : undefined}
          />
          <StatTile
            label="Have a ticket"
            value={formatNumber(t?.issued ?? 0)}
            note={
              !t || s.registered === 0
                ? "nothing to send yet"
                : s.status === "draft"
                  ? "tickets go out once it is published"
                  : t.missing > 0
                    ? `${formatNumber(t.missing)} still without one${t.pending ? ` · ${formatNumber(t.pending)} sending` : ""}`
                    : "everyone on the list"
            }
            action={t && t.missing > 0 ? { label: "Show who is not reached", onClick: () => show("delivery", "not_delivered") } : undefined}
          />
          {paidEvent ? (
            <StatTile
              label="Yet to pay"
              value={payment ? formatNumber(payment.unpaid) : "—"}
              note={payment ? `${formatNumber(payment.paid)} paid · ${a ? formatCurrency(a.total_revenue) : "—"} in` : "payments load with the sign-ups"}
              action={payment && payment.unpaid > 0 ? { label: "Show them", onClick: () => show("paid", "no") } : undefined}
            />
          ) : (
            <StatTile
              label="Not yet in"
              value={formatNumber(Math.max(0, s.registered - s.checked_in))}
              note={
                s.door_open
                  ? "still to arrive · door open"
                  : s.from_report || s.status === "closed" || s.status === "archived"
                    ? "did not come through the door"
                    : s.checked_in
                      ? "still to arrive"
                      : "everyone, until the door opens"
              }
              action={s.registered - s.checked_in > 0 ? { label: "Show them", onClick: () => show("in", "no") } : undefined}
            />
          )}
        </section>
      )}

      {running || bounced > 0 ? (
        <div className="grid gap-2">
          {running ? (
            <Notice tone="accent" tag="Importing">
              {importFileName(running)} is being read row by row. Guests appear on the list as they pass, and the import&apos;s record below says what happened to each. You can keep working.
            </Notice>
          ) : null}
          {bounced > 0 ? (
            <Notice
              tone="caution"
              tag="Bounced"
              action={
                <Button variant="secondary" size="sm" onClick={() => show("delivery", "not_delivered")}>
                  Show them
                </Button>
              }
            >
              {formatNumber(bounced)} {bounced === 1 ? "email address" : "email addresses"} bounced. Nothing more is sent to {bounced === 1 ? "it" : "them"} until the address is corrected — open the guest and correct their details.
            </Notice>
          ) : null}
        </div>
      ) : null}

      {s && s.registered === 0 ? null : <DeliveryBar eventId={eventId} />}

      <div ref={listRef} className="scroll-mt-4">
        <FigurePanel className="overflow-hidden p-0">
          <Toolbar>
            <div role="group" aria-label="Role" className="flex flex-wrap gap-1.5">
              <Chip active={!role} onClick={() => params.setParam("role", undefined)}>
                Everyone{s ? ` ${formatNumber(s.registered)}` : ""}
              </Chip>
              {REGISTRATION_ROLES.map((r) => {
                const n = roleCount(r);
                return (
                  <Chip key={r} active={role === r} onClick={() => toggle("role", r, role)}>
                    {ROLE_PLURAL[r]}
                    {n ? ` ${formatNumber(n)}` : ""}
                  </Chip>
                );
              })}
            </div>
            <span aria-hidden="true" className="bg-line-soft mx-1 hidden h-5 w-px sm:block" />
            <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
              <Chip active={checkedIn === "yes"} tone="admit" onClick={() => toggle("in", "yes", checkedIn)}>
                Checked in{s ? ` ${formatNumber(s.checked_in)}` : ""}
              </Chip>
              <Chip active={checkedIn === "no"} onClick={() => toggle("in", "no", checkedIn)}>
                Not yet in{s ? ` ${formatNumber(Math.max(0, s.registered - s.checked_in))}` : ""}
              </Chip>
              <Chip active={!!delivery} tone="refuse" onClick={() => toggle("delivery", "not_delivered", delivery)}>
                Not delivered
              </Chip>
              {paidEvent ? (
                <>
                  <Chip active={paid === "yes"} onClick={() => toggle("paid", "yes", paid)}>
                    Paid{payment ? ` ${formatNumber(payment.paid)}` : ""}
                  </Chip>
                  <Chip active={paid === "no"} tone="caution" onClick={() => toggle("paid", "no", paid)}>
                    Unpaid{payment ? ` ${formatNumber(payment.unpaid)}` : ""}
                  </Chip>
                </>
              ) : null}
            </div>
            <ToolbarEnd>
              {filtered ? (
                <Button variant="ghost" size="sm" onClick={() => params.clearParams(FILTER_KEYS)}>
                  Clear
                </Button>
              ) : null}
              <SearchField
                value={params.searchInput}
                onChange={params.setSearchInput}
                onCommit={params.commitSearch}
                placeholder="Name, email, phone or ticket"
                label="Search guests"
                className="w-full sm:w-64"
              />
            </ToolbarEnd>
          </Toolbar>
          {delivery ? (
            <p className="text-ink-3 border-line-soft border-b px-4 py-2 text-[12px]">
              Not delivered: nothing sent, nothing that worked, or something that came back. A guest reached by email is not here.
            </p>
          ) : null}

          {list.isPending ? (
            <div aria-busy="true" className="grid gap-2 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-11 rounded-lg" />
              ))}
            </div>
          ) : list.isError ? (
            <EmptyState
              size="sm"
              title="The guest list could not load"
              description="Nothing on it has changed. Try again in a moment."
              action={
                <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            filtered ? (
              <EmptyState
                size="sm"
                title="Nobody matches"
                description="Try a shorter search, or clear the filters."
                action={
                  <Button variant="secondary" size="sm" onClick={() => params.clearParams(FILTER_KEYS)}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<UsersIcon />}
                title="No guests on the list yet"
                description="People who register on the event page appear here as they sign up. Bring a list you already have, or add someone at the desk."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" onClick={() => setDialog({ kind: "import" })}>
                      <UploadIcon /> Import a list
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "add" })}>
                      <UserPlusIcon /> Add a guest
                    </Button>
                  </div>
                }
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className={HEAD}>
                      Guest
                    </th>
                    <th scope="col" className={HEAD}>
                      Institution
                    </th>
                    <th scope="col" className={HEAD}>
                      Role
                    </th>
                    <th scope="col" className={HEAD}>
                      Ticket
                    </th>
                    <th scope="col" className={HEAD}>
                      Delivery
                    </th>
                    {paidEvent ? (
                      <th scope="col" className={HEAD}>
                        Payment
                      </th>
                    ) : null}
                    <th scope="col" className={HEAD}>
                      Check-in
                    </th>
                    <th scope="col" className={cn(HEAD, "text-right")}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <GuestRow
                      key={row.id}
                      eventId={eventId}
                      row={row}
                      paidEvent={paidEvent}
                      onOpen={() => setDialog({ kind: "detail", id: row.id })}
                      onRemove={(name) => setDialog({ kind: "remove", row: { id: row.id, name } })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!list.isPending && rows.length > 0 ? (
            <div className="border-line-soft border-t px-4 py-2.5">
              <Pager
                page={params.page}
                pageCount={pages}
                total={total ?? rows.length}
                pageSize={params.pageSize}
                noun={["guest", "guests"]}
                busy={list.isFetching}
                onPage={params.setPage}
                onPageSize={params.setPageSize}
              />
            </div>
          ) : null}
        </FigurePanel>
      </div>

      {imports.data && imports.data.length > 0 ? (
        <ImportRecord imports={imports.data} openId={openImport} onToggle={(id) => setOpenImport(openImport === id ? null : id)} />
      ) : null}

      <ImportDialog
        eventId={eventId}
        eventSlug={slug}
        fields={fields}
        open={dialog?.kind === "import"}
        onOpenChange={(o) => !o && setDialog(null)}
        onStarted={setOpenImport}
      />
      <AttendeeFormDialog
        key={dialog?.kind === "edit" ? dialog.row.id : "add"}
        eventId={eventId}
        fields={fields}
        existing={dialog?.kind === "edit" ? dialog.row : null}
        open={dialog?.kind === "add" || dialog?.kind === "edit"}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <RemoveAttendeeDialog
        eventId={eventId}
        eventSlug={slug}
        attendee={dialog?.kind === "remove" ? dialog.row : null}
        open={dialog?.kind === "remove"}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <AttendeeDetailDialog
        eventId={eventId}
        registrationId={dialog?.kind === "detail" ? dialog.id : null}
        fields={fields}
        open={dialog?.kind === "detail"}
        onOpenChange={(o) => !o && setDialog(null)}
        onEdit={(row) => setDialog({ kind: "edit", row })}
        onRemove={(row) => setDialog({ kind: "remove", row: { id: row.id, name: row.full_name ?? row.name ?? "this guest" } })}
      />
    </div>
  );
}
