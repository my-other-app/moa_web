"use client";

import * as React from "react";
import { CheckIcon, DownloadIcon, Loader2Icon } from "lucide-react";
import {
  ResourceList,
  formatCurrency,
  formatDateTime,
  useListParams,
} from "@moa/app-kit";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type DataTableColumn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { exportUrl } from "../api";
import {
  useMarkAttendance,
  useRegistrations,
  useSetRegistrationRole,
} from "../queries";
import { REGISTRATION_ROLES } from "../schemas";
import type { Registration, RegistrationRole } from "../schemas";

type Filter = "all" | "attended" | "not_attended" | "paid" | "unpaid";

const FILTERS: Record<Filter, { isAttended?: boolean; isPaid?: boolean }> = {
  all: {},
  attended: { isAttended: true },
  not_attended: { isAttended: false },
  paid: { isPaid: true },
  unpaid: { isPaid: false },
};

function AttendanceButton({ eventId, row }: { eventId: number; row: Registration }) {
  const mark = useMarkAttendance(eventId);

  if (row.is_attended) {
    return <StatusBadge tone="success" label="Attended" />;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="xs"
          variant="outline"
          className={pressable}
          disabled={mark.isPending}
          onClick={() => mark.mutate(row.id)}
        >
          {mark.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
          Check in
        </Button>
      </TooltipTrigger>
      {/* The API has no un-mark endpoint, so this is one-way. */}
      <TooltipContent>Marks attendance — this cannot be undone here</TooltipContent>
    </Tooltip>
  );
}

const ROLE_LABELS: Record<RegistrationRole, string> = {
  attendee: "Attendee",
  speaker: "Speaker",
  staff: "Staff",
};

/**
 * Which role someone is attending as.
 *
 * Here rather than on the design page because this is the list an organiser
 * already works through, and the role is a fact about the person, not about
 * the artwork. It decides which ticket and certificate variant they are
 * issued, so an event with a speaker design needs this to reach anyone.
 */
function RoleSelect({ eventId, row }: { eventId: number; row: Registration }) {
  const setRole = useSetRegistrationRole(eventId);

  return (
    <Select
      value={row.role}
      disabled={setRole.isPending}
      onValueChange={(role) =>
        setRole.mutate({ registrationId: row.id, role: role as RegistrationRole })
      }
    >
      <SelectTrigger size="sm" aria-label={`Role for ${row.full_name ?? "this person"}`} className="w-[7.5rem]">
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

export function RegistrationsTable({ eventId }: { eventId: number }) {
  const params = useListParams();
  const [filter, setFilter] = React.useState<Filter>("all");

  const { data, isPending, isError } = useRegistrations({
    eventId,
    search: params.search || undefined,
    ...FILTERS[filter],
    offset: params.offset,
    limit: params.pageSize,
  });

  const columns: DataTableColumn<Registration>[] = [
    {
      key: "person",
      header: "Registrant",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {row.full_name || row.name || row.user?.full_name || "Unknown"}
          </p>
          <p className="text-muted-foreground truncate text-xs">{row.email || "--"}</p>
        </div>
      ),
    },
    {
      key: "institution",
      header: "Institution",
      className: "hidden lg:table-cell",
      headerClassName: "hidden lg:table-cell",
      cell: (row) => (
        <span className="text-muted-foreground line-clamp-1">{row.institution || "--"}</span>
      ),
    },
    {
      key: "ticket",
      header: "Ticket",
      className: "hidden xl:table-cell",
      headerClassName: "hidden xl:table-cell",
      cell: (row) => (
        <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{row.ticket_id || "--"}</code>
      ),
    },
    {
      key: "role",
      header: "Role",
      className: "hidden md:table-cell",
      headerClassName: "hidden md:table-cell",
      cell: (row) => <RoleSelect eventId={eventId} row={row} />,
    },
    {
      key: "payment",
      header: "Payment",
      className: "hidden sm:table-cell",
      headerClassName: "hidden sm:table-cell",
      cell: (row) =>
        (row.actual_amount ?? 0) > 0 ? (
          <div className="flex flex-col">
            <StatusBadge
              tone={row.is_paid ? "success" : "warning"}
              label={row.is_paid ? "Paid" : "Unpaid"}
            />
            <span className="text-muted-foreground mt-0.5 text-xs tabular-nums">
              {formatCurrency(row.is_paid ? row.paid_amount : row.actual_amount)}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">Free</span>
        ),
    },
    {
      key: "registered",
      header: "Registered",
      className: "hidden md:table-cell",
      headerClassName: "hidden md:table-cell",
      cell: (row) => (
        <span className="text-muted-foreground tabular-nums">
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key: "attendance",
      header: <span className="block text-right">Attendance</span>,
      className: "text-right",
      headerClassName: "text-right",
      cell: (row) => (
        <div className="flex justify-end">
          <AttendanceButton eventId={eventId} row={row} />
        </div>
      ),
    },
  ];

  return (
    <ResourceList
      page={data}
      isPending={isPending}
      isError={isError}
      columns={columns}
      rowKey={(row) => row.id}
      params={params}
      searchPlaceholder="Search by name, email or ticket…"
      emptyTitle="No registrations yet"
      emptyDescription="People who register for this event will appear here."
      toolbar={
        <div className="flex gap-2">
          <Select
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter);
              params.setPage(1);
            }}
          >
            <SelectTrigger size="sm" className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="attended">Attended</SelectItem>
              <SelectItem value="not_attended">Not attended</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" className={pressable} asChild>
            {/* A real navigation, not fetch: the browser handles the file and
                the cookie rides along because the gateway is same-origin. */}
            <a href={exportUrl(eventId, FILTERS[filter])} download>
              <DownloadIcon /> Export
            </a>
          </Button>
        </div>
      }
    />
  );
}
