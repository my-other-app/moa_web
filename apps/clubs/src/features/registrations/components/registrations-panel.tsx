"use client";

import * as React from "react";
import {
  CheckIcon,
  IdCardIcon,
  Loader2Icon,
  MoreHorizontalIcon,
} from "lucide-react";
import { useListParams } from "@moa/app-kit";
import { pageCount } from "@moa/api";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Pager,
  SearchField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { Icon } from "@/components/icon";
import { DeliveryBar, TicketCell } from "@/features/deliveries";
import { cardPdfUrl, openPdf } from "@/features/idcards";
import { useEventDetail } from "@/features/events";

import { exportUrl } from "../api";
import {
  useMarkAttendance,
  useRegistrations,
  useSetRegistrationRole,
} from "../queries";
import {
  REGISTRATION_ROLES,
  eventFieldSchema,
  type EventField,
  type Registration,
  type RegistrationDetail,
  type RegistrationRole,
} from "../schemas";
import { AttendeeDetailDialog } from "./attendee-detail-dialog";
import { AttendeeFormDialog } from "./attendee-form-dialog";
import { ImportPanel } from "./import-panel";
import { RemoveAttendeeDialog } from "./remove-attendee-dialog";

const ROLE_LABELS: Record<RegistrationRole, string> = {
  attendee: "Attendee",
  speaker: "Speaker",
  staff: "Staff",
};

/** A filter as a chip: pressed is on, pressed again is off. */
function Chip({
  active,
  onClick,
  tone = "default",
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone?: "default" | "success" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1.5 font-mono text-[11px] font-medium tracking-[0.05em] transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : tone === "success"
            ? "border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
            : tone === "destructive"
              ? "border-destructive/40 text-destructive hover:bg-destructive/10"
              : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function CheckInButton({
  eventId,
  row,
}: {
  eventId: number;
  row: Registration;
}) {
  const mark = useMarkAttendance(eventId);
  if (row.is_attended) return <StatusBadge tone="success" label="Attended" />;
  return (
    <Button
      size="xs"
      variant="outline"
      className={pressable}
      // A revoked ticket is refused at the door; the API answers 409 to say so.
      disabled={mark.isPending || !!row.ticket_revoked_at}
      onClick={() => mark.mutate(row.id)}
      // The API has no un-mark endpoint, so this is one-way.
      title={
        row.ticket_revoked_at
          ? "This ticket was revoked — reinstate it first"
          : "Marks attendance — this cannot be undone here"
      }
    >
      {mark.isPending ? (
        <Loader2Icon className="animate-spin" />
      ) : (
        <CheckIcon />
      )}
      Check in
    </Button>
  );
}

/**
 * Which role someone is attending as. It decides which ticket and
 * certificate variant they are issued, so an event with a speaker design
 * needs this to reach anyone.
 */
function RoleSelect({ eventId, row }: { eventId: number; row: Registration }) {
  const setRole = useSetRegistrationRole(eventId);
  return (
    <Select
      value={row.role}
      disabled={setRole.isPending}
      onValueChange={(role) =>
        setRole.mutate({
          registrationId: row.id,
          role: role as RegistrationRole,
        })
      }
    >
      <SelectTrigger
        size="sm"
        aria-label={`Role for ${row.full_name ?? "this person"}`}
        className="w-[7.5rem]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {REGISTRATION_ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const CELL = "px-4 py-3 text-left align-middle";

type DialogState =
  | { kind: "add" }
  | { kind: "edit"; row: RegistrationDetail }
  | { kind: "remove"; row: { id: string; name: string } }
  | { kind: "detail"; id: string }
  | null;

/**
 * The guest list, ported from Muster's attendees tab: the delivery bar and
 * the import above it; search and filter chips a desk actually uses; a row
 * per guest with their contact, role, ticket and check-in; and a menu that
 * opens the guest in full, corrects them, or takes them off the list.
 */
export function RegistrationsPanel({ eventId }: { eventId: number }) {
  const params = useListParams();
  const event = useEventDetail(eventId);
  const role = params.param("role") as RegistrationRole | undefined;
  const checkedIn = params.param("in");
  const delivery =
    params.param("delivery") === "not_delivered" ? "not_delivered" : undefined;
  const [dialog, setDialog] = React.useState<DialogState>(null);

  const fields: EventField[] = React.useMemo(() => {
    const raw = (event.data as { additional_details?: unknown } | undefined)
      ?.additional_details;
    return Array.isArray(raw)
      ? raw.flatMap((f) =>
          eventFieldSchema.safeParse(f).success
            ? [eventFieldSchema.parse(f)]
            : [],
        )
      : [];
  }, [event.data]);
  const slug = event.data?.slug ?? "";

  const { data, isPending, isError } = useRegistrations({
    eventId,
    search: params.search || undefined,
    isAttended:
      checkedIn === "yes" ? true : checkedIn === "no" ? false : undefined,
    role:
      role && (REGISTRATION_ROLES as readonly string[]).includes(role)
        ? role
        : undefined,
    delivery,
    offset: params.offset,
    limit: params.pageSize,
  });
  const rows = data?.items ?? [];
  const pages = pageCount(data?.total ?? null, params.pageSize) ?? 1;
  const filtered = !!(params.search || role || checkedIn || delivery);

  return (
    <div className="space-y-4">
      <ImportPanel
        eventId={eventId}
        eventSlug={slug}
        fields={fields}
        onAddManually={() => setDialog({ kind: "add" })}
      />
      <DeliveryBar eventId={eventId} />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <p className="text-[15px] font-medium text-foreground">
          Guest list{data?.total != null ? ` · ${data.total}` : ""}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <SearchField
            value={params.searchInput}
            onChange={params.setSearchInput}
            onCommit={params.commitSearch}
            placeholder="Name, email, phone or ticket"
            label="Search guests"
            className="w-full sm:w-[340px]"
          />
          <Button
            asChild
            variant="outline"
            className={cn("h-11 shrink-0 gap-2 rounded-lg px-4", pressable)}
          >
            {/* A real navigation, not fetch: the browser handles the file and
                the cookie rides along because the gateway is same-origin. The
                endpoint returns an xlsx workbook, so the label says so. */}
            <a
              href={exportUrl(
                eventId,
                checkedIn === "yes"
                  ? { isAttended: true }
                  : checkedIn === "no"
                    ? { isAttended: false }
                    : {},
              )}
              download
            >
              <Icon name="file-02" />
              Download Excel file
            </a>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={!role} onClick={() => params.setParam("role", undefined)}>
          All roles
        </Chip>
        {REGISTRATION_ROLES.map((r) => (
          <Chip
            key={r}
            active={role === r}
            onClick={() => params.setParam("role", role === r ? undefined : r)}
          >
            {ROLE_LABELS[r]}s
          </Chip>
        ))}
        <span className="flex-1" />
        <Chip
          active={checkedIn === "yes"}
          tone="success"
          onClick={() =>
            params.setParam("in", checkedIn === "yes" ? undefined : "yes")
          }
        >
          Checked in
        </Chip>
        <Chip
          active={checkedIn === "no"}
          onClick={() =>
            params.setParam("in", checkedIn === "no" ? undefined : "no")
          }
        >
          Not yet
        </Chip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Chip
                active={!!delivery}
                tone="destructive"
                onClick={() =>
                  params.setParam(
                    "delivery",
                    delivery ? undefined : "not_delivered",
                  )
                }
              >
                Not delivered
              </Chip>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Nothing sent, nothing that worked, or something that came back. A
            guest reached by email is not here.
          </TooltipContent>
        </Tooltip>
      </div>

      {isPending ? (
        <Skeleton className="h-[400px] w-full rounded-lg" />
      ) : isError ? (
        <EmptyState
          tone="muted"
          title="Could not load registrations"
          description="Try reloading the page."
        />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-card ring-1 ring-border/70 shadow-sm p-10">
          <EmptyState
            tone="muted"
            title={filtered ? "Nobody matches" : "No guests on the list yet"}
            description={
              filtered
                ? "Try a shorter search, or clear the filters."
                : "Import a file, add someone by hand, or wait for registrations through the event page."
            }
            action={
              filtered ? (
                <button
                  type="button"
                  onClick={() => {
                    params.clearParams(["role", "in", "delivery"]);
                    params.reset();
                  }}
                  className="text-primary text-sm underline-offset-4 hover:underline"
                >
                  Clear filters
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/70 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className="bg-muted/60 text-[13px] font-medium text-muted-foreground">
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Name
                  </th>
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Institution
                  </th>
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Role
                  </th>
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Ticket
                  </th>
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Delivery
                  </th>
                  <th scope="col" className={cn(CELL, "font-light")}>
                    Check-in
                  </th>
                  <th scope="col" className={cn(CELL, "font-light text-right")}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm text-muted-foreground">
                {rows.map((row) => {
                  const name =
                    row.full_name ||
                    row.name ||
                    row.user?.full_name ||
                    "Unknown";
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-border/60 transition-colors hover:bg-muted/40"
                    >
                      <td className={CELL}>
                        <button
                          type="button"
                          onClick={() =>
                            setDialog({ kind: "detail", id: row.id })
                          }
                          className="min-w-0 max-w-full text-left"
                          aria-label={`Open ${name}`}
                        >
                          <span className="hover:text-primary block font-medium text-foreground hover:underline">
                            {name}
                          </span>
                          <span className="text-muted-foreground block font-mono text-xs break-all">
                            {[row.email, row.phone]
                              .filter(Boolean)
                              .join(" · ") || "no contact on file"}
                          </span>
                        </button>
                        {row.email_bounced_at ? (
                          <span
                            className="mt-1 inline-block rounded-full border border-destructive/50 px-2 py-0.5 font-mono text-[10px] text-destructive"
                            title={
                              row.email_bounce_reason ?? "That address bounced"
                            }
                          >
                            EMAIL BOUNCED · correct it to send again
                          </span>
                        ) : null}
                      </td>
                      <td className={CELL}>
                        <span
                          className="block max-w-[260px] truncate"
                          title={row.institution ?? ""}
                        >
                          {row.institution || "—"}
                        </span>
                      </td>
                      <td className={CELL}>
                        <RoleSelect eventId={eventId} row={row} />
                      </td>
                      <td className={cn(CELL, "font-mono text-xs")}>
                        {row.ticket_id || "—"}
                        {row.admission_no ? (
                          <div className="text-muted-foreground text-[10.5px]">
                            {row.admission_no}
                          </div>
                        ) : null}
                      </td>
                      <td className={CELL}>
                        <TicketCell eventId={eventId} row={row} />
                      </td>
                      <td className={cn(CELL, "whitespace-nowrap")}>
                        <CheckInButton eventId={eventId} row={row} />
                      </td>
                      <td className={cn(CELL, "text-right")}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label={`Actions for ${name}`}
                            >
                              <MoreHorizontalIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() =>
                                setDialog({ kind: "detail", id: row.id })
                              }
                            >
                              <span className="flex flex-col">
                                <span>View everything</span>
                                <span className="text-muted-foreground text-xs">
                                  Contact, answers, ticket, deliveries,
                                  check-in.
                                </span>
                              </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                openPdf(
                                  cardPdfUrl(eventId, row.id, {
                                    source: "manual",
                                    record: true,
                                  }),
                                )
                              }
                            >
                              <IdCardIcon /> Print ID card
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() =>
                                setDialog({
                                  kind: "remove",
                                  row: { id: row.id, name },
                                })
                              }
                            >
                              <span className="flex flex-col">
                                <span>Remove from the list</span>
                                <span className="text-xs opacity-80">
                                  Deletes the registration, ticket and check-in.
                                </span>
                              </span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isPending && rows.length > 0 ? (
        <Pager
          page={params.page}
          pageCount={pages}
          total={data?.total ?? rows.length}
          pageSize={params.pageSize}
          noun={["guest", "guests"]}
          onPage={params.setPage}
          onPageSize={params.setPageSize}
        />
      ) : null}

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
        onEdit={(a) => setDialog({ kind: "edit", row: a })}
        onRemove={(a) =>
          setDialog({
            kind: "remove",
            row: { id: a.id, name: a.full_name ?? a.name ?? "this guest" },
          })
        }
      />
    </div>
  );
}
