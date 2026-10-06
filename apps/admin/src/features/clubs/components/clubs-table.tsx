"use client";

import * as React from "react";

import Image from "next/image";
import Link from "next/link";
import { Avatar, AvatarFallback, StatusBadge, type DataTableColumn } from "@moa/ui";

import {
  ListFilters,
  ResourceList,
  formatDate,
  initials,
  pickImage,
  useListParams,
} from "@moa/app-kit";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { Button, toast } from "@moa/ui";
import { pressable } from "@moa/ui/motion";
import { ExportButton } from "@/components/export-button";
import { CreateClubButton } from "./create-club-dialog";
import { SavedViews } from "@/components/saved-views";
import { fetchClubs } from "../api";
import { useApproveClub, useClubs } from "../queries";
import type { AdminClub } from "../schemas";
import { ClubActions } from "./club-actions";

const columns: DataTableColumn<AdminClub>[] = [
  {
    key: "club",
    header: "Club",
    cell: (row) => {
      const logo = pickImage(row.logo, ["thumbnail", "medium", "original"]);
      return (
        <div className="flex items-center gap-3">
          {logo ? (
            <Image
              src={logo}
              alt=""
              width={32}
              height={32}
              className="size-8 rounded-full object-cover"
              unoptimized
            />
          ) : (
            <Avatar className="size-8">
              <AvatarFallback className="text-[11px]">
                {initials(row.name)}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0">
            <Link
              href={`/clubs/${row.id}`}
              className="block truncate font-medium underline-offset-4 hover:underline"
            >
              {row.name}
            </Link>
            <p className="text-muted-foreground truncate text-xs">
              {row.location_name || "No location"}
            </p>
          </div>
        </div>
      );
    },
  },
  {
    key: "contact",
    header: "Contact",
    className: "hidden md:table-cell",
    headerClassName: "hidden md:table-cell",
    cell: (row) => (
      <div className="min-w-0">
        <p className="text-muted-foreground truncate text-sm">
          {row.contact_email || "--"}
        </p>
        <p className="text-muted-foreground truncate text-xs tabular-nums">
          {row.contact_phone || ""}
        </p>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => (
      <StatusBadge
        tone={row.is_verified ? "success" : "warning"}
        label={row.is_verified ? "Verified" : "Pending"}
      />
    ),
  },
  {
    key: "created",
    header: "Created",
    className: "hidden lg:table-cell",
    headerClassName: "hidden lg:table-cell",
    cell: (row) => (
      <span className="text-muted-foreground tabular-nums">
        {formatDate(row.created_at)}
      </span>
    ),
  },
  {
    key: "actions",
    header: <span className="sr-only">Actions</span>,
    className: "text-right",
    headerClassName: "text-right",
    cell: (row) => <ClubActions club={row} />,
  },
];

const CLUB_FILTERS = [
  {
    key: "is_verified",
    label: "Status",
    options: [
      { value: "true", label: "Verified" },
      { value: "false", label: "Pending approval" },
    ],
  },
] as const;

const CLUB_SORT = {
  options: [
    { value: "created", label: "Created" },
    { value: "name", label: "Name" },
    { value: "followers", label: "Followers" },
  ],
  defaultValue: "created",
} as const;

const CLUB_CSV = [
  { header: "ID", value: (c: AdminClub) => c.id },
  { header: "Name", value: (c: AdminClub) => c.name },
  { header: "Status", value: (c: AdminClub) => (c.is_verified ? "Verified" : "Pending") },
  { header: "Location", value: (c: AdminClub) => c.location_name ?? "" },
  { header: "Contact email", value: (c: AdminClub) => c.contact_email ?? "" },
  { header: "Contact phone", value: (c: AdminClub) => c.contact_phone ?? "" },
  { header: "Created", value: (c: AdminClub) => c.created_at ?? "" },
] as const;

/**
 * Approving pending clubs in bulk.
 *
 * The API has no batch endpoint, so this is a loop. It runs sequentially
 * rather than all at once: twenty parallel writes against a single shared
 * backend is a burst worth avoiding, and a partial failure is easier to
 * report honestly when the successes are already counted.
 */
function BulkApprove({ clubs, onDone }: { clubs: AdminClub[]; onDone: () => void }) {
  const approve = useApproveClub();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    let done = 0;
    const failed: string[] = [];
    for (const club of clubs) {
      try {
        await approve.mutateAsync(club.id);
        done += 1;
      } catch {
        failed.push(club.name);
      }
    }
    setBusy(false);
    onDone();

    if (failed.length === 0) {
      toast.success(`Approved ${done} club${done === 1 ? "" : "s"}`);
    } else {
      // Naming them beats "some failed" -- the admin has to know which.
      toast.error(
        `Approved ${done}. Failed: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? ` and ${failed.length - 3} more` : ""}`
      );
    }
  }

  return (
    <Button size="sm" disabled={busy} onClick={run} className={pressable}>
      {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
      {busy ? "Approving…" : `Approve ${clubs.length}`}
    </Button>
  );
}

export function ClubsTable() {
  const params = useListParams();
  const verified = params.param("is_verified");
  const { data, isPending, isError } = useClubs({
    search: params.search || undefined,
    // The query string carries strings; the API wants a boolean or nothing.
    isVerified: verified === undefined ? undefined : verified === "true",
    sort: params.param("sort"),
    order: params.param("order"),
    offset: params.offset,
    limit: params.pageSize,
  });

  return (
    <ResourceList
      page={data}
      isPending={isPending}
      isError={isError}
      columns={columns}
      rowKey={(row) => row.id}
      params={params}
      searchPlaceholder="Search clubs…"
      emptyTitle="No clubs yet"
      emptyDescription="Clubs created by organisers will appear here for approval."
      toolbar={<>
          <ListFilters params={params} filters={CLUB_FILTERS} sort={CLUB_SORT} />
          <SavedViews
            storageKey="clubs"
            presets={[
              { name: "Pending approval", query: "is_verified=false" },
              { name: "Most followed", query: "sort=followers&order=desc" },
            ]}
          />
        </>}
      actions={
        <>
        <CreateClubButton />
        <ExportButton
          filename="clubs"
          columns={CLUB_CSV}
          fetchPage={(offset, limit) =>
            // Same filters as the view, so the file matches the screen.
            fetchClubs({
              search: params.search || undefined,
              isVerified: verified === undefined ? undefined : verified === "true",
              sort: params.param("sort"),
              order: params.param("order"),
              offset,
              limit,
            })
          }
        />
        </>
      }
      selection={{
        // Approving an approved club is a no-op the API would accept; not
        // offering it keeps the count on the bar honest.
        isSelectable: (row) => !row.is_verified,
        renderBulkActions: (selected, clear) => (
          <BulkApprove clubs={selected} onDone={clear} />
        ),
      }}
    />
  );
}
