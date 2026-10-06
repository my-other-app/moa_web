"use client";

import * as React from "react";
import {
  DatabaseIcon,
  DownloadIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  InlineAlert,
  Skeleton,
  buttonVariants,
  cn,
} from "@moa/ui";
import { hoverLift, pressable, stagger } from "@moa/ui/motion";

import { useCan } from "@/hooks/use-can";
import { backupDownloadUrl } from "../api";
import { useBackups, useCreateBackup, useDeleteBackup } from "../queries";
import type { Backup } from "../schemas";

/**
 * Database snapshots, on demand.
 *
 * Deliberately not called "backups" in the UI. A snapshot someone remembers to
 * take is not a backup regime, and one sitting on the same host as the
 * database survives neither a disk failure nor the instance going away. The
 * panel says so rather than letting a green list imply the problem is solved.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function Row({ backup, index }: { backup: Backup; index: number }) {
  const remove = useDeleteBackup();
  const [confirm, setConfirm] = React.useState(false);

  return (
    <>
      <div
        style={stagger(index)}
        className={cn(
          "animate-in fade-in-0 slide-in-from-bottom-1 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
          hoverLift
        )}
      >
        <DatabaseIcon className="text-muted-foreground size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs font-medium">{backup.name}</p>
          <p className="text-muted-foreground text-xs">
            {formatDateTime(backup.created_at)} · {formatSize(backup.size_bytes)}
          </p>
        </div>
        <Button size="xs" variant="outline" className={pressable} asChild>
          {/* A plain link, not fetch: the file goes straight to disk instead
              of through JS memory, and the browser handles the save dialog. */}
          <a href={backupDownloadUrl(backup.name)} download={backup.name}>
            <DownloadIcon /> Download
          </a>
        </Button>
        <Button
          size="xs"
          variant="ghost"
          aria-label={`Delete ${backup.name}`}
          className={cn("text-destructive hover:text-destructive", pressable)}
          onClick={() => setConfirm(true)}
        >
          <Trash2Icon />
        </Button>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              If you have not downloaded it, this is the only copy. It cannot be
              recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void remove.mutateAsync(backup.name).then(() => setConfirm(false));
              }}
            >
              Delete snapshot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function BackupsPanel() {
  const allowed = useCan("export_data");
  const { data, isPending, isError, error } = useBackups();
  const create = useCreateBackup();

  if (!allowed) return null;

  const backups = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Database snapshots</CardTitle>
            <CardDescription>
              A full copy of the database, taken now and downloaded by you.
            </CardDescription>
          </div>
          <Button
            size="sm"
            className={pressable}
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <DatabaseIcon />
            )}
            {create.isPending ? "Taking snapshot…" : "Take snapshot"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <InlineAlert tone="warning" title="This is not a backup schedule">
          Snapshots are written to the server the database runs on, so they do
          not survive losing it. Download the file and keep it somewhere else —
          and set up a nightly job, which is the thing that actually protects
          you. A snapshot also contains every user&apos;s details and payment
          records, so treat the download accordingly.
        </InlineAlert>

        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            tone="muted"
            title="Could not list snapshots"
            description={error?.message ?? "Try reloading the page."}
          />
        ) : backups.length === 0 ? (
          <EmptyState
            tone="muted"
            title="No snapshots yet"
            description="Take one before anything risky — a migration, a bulk delete, an import."
          />
        ) : (
          <div className="space-y-2">
            {backups.map((backup, i) => (
              <Row key={backup.name} backup={backup} index={i} />
            ))}
          </div>
        )}

        {data?.directory ? (
          <p className="text-muted-foreground text-xs">
            Stored at <code className="bg-muted rounded px-1">{data.directory}</code>{" "}
            on the server.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
