"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CopyIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { PageHeader, formatDateTime } from "@moa/app-kit";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useCreateTemplate, useDeleteTemplate, useDuplicateTemplate, useLibrary } from "../queries";
import { STAGE_META, audienceSummary, blankTemplate, triggerSummary, type EmailTemplate } from "../schemas";
import { Busy, ui } from "./kit";

/**
 * The club's library: every new event starts from these four, plus any
 * custom email kept here. An event's own copy is edited on the event.
 */
export function EmailLibraryPage() {
  const router = useRouter();
  const scope = { kind: "library" as const };
  const list = useLibrary();
  const create = useCreateTemplate(scope);
  const duplicate = useDuplicateTemplate(scope);
  const remove = useDeleteTemplate(scope);
  const [deleting, setDeleting] = React.useState<EmailTemplate | null>(null);

  const journey = list.data?.filter((t) => t.stage !== "CUSTOM") ?? [];
  const custom = list.data?.filter((t) => t.stage === "CUSTOM") ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email library"
        description="Every new event starts from these. Edit one here and the next event picks it up; an event's own copy is edited on the event, and can be saved back here."
        action={
          <Button className={pressable} disabled={create.isPending} onClick={() => create.mutate({ fields: blankTemplate() }, { onSuccess: (t) => router.push(`/emails/${t.id}`) })}>
            <Busy on={create.isPending} />
            {create.isPending ? null : <PlusIcon />} New email
          </Button>
        }
      />
      {list.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : list.isError ? (
        <EmptyState tone="muted" title="Could not load the library" description={list.error.message} />
      ) : (
        <>
          <section className="space-y-3">
            <p className={ui.heading}>The journey</p>
            <div className="grid gap-3 md:grid-cols-2">
              {journey.map((t) => (
                <div key={t.id} className={cn(ui.panel, "flex flex-col gap-2 p-4")}>
                  <p className={ui.heading}>{STAGE_META[t.stage].label}</p>
                  <p className="truncate text-[15px] font-medium">{t.name}</p>
                  <p className={cn(ui.note, "truncate")}>{t.subject}</p>
                  <p className={ui.note}>{STAGE_META[t.stage].note}</p>
                  <p className="text-[12px]">
                    <span className="text-muted-foreground">Goes out:</span> {triggerSummary(t.trigger)} · <span className="text-muted-foreground">to</span> {audienceSummary(t.audience)}
                  </p>
                  <p className={ui.note}>
                    v{t.version} · edited {formatDateTime(t.updatedAt)}
                  </p>
                  <div className="mt-auto pt-1">
                    <Button variant="outline" size="sm" asChild className={pressable}>
                      <Link href={`/emails/${t.id}`}>
                        <PencilIcon /> Edit
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <p className={ui.heading}>Other emails</p>
            {custom.length ? (
              <ul className="divide-y rounded-2xl bg-card ring-1 ring-border/70 shadow-sm">
                {custom.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/emails/${t.id}`} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                      <p className={cn(ui.note, "truncate")}>{t.subject}</p>
                    </div>
                    <p className={cn(ui.note, "hidden sm:block")}>{triggerSummary(t.trigger)}</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${t.name}`}>
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => router.push(`/emails/${t.id}`)}>
                          <PencilIcon /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => duplicate.mutate(t.id)}>
                          <CopyIcon /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(t)}>
                          <Trash2Icon /> Delete…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={ui.note}>No custom emails in the library yet. Make one on an event and choose &ldquo;Make this the club&apos;s default&rdquo;, or start one here.</p>
            )}
          </section>
        </>
      )}
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}” from the library?</AlertDialogTitle>
            <AlertDialogDescription>Events that already copied it keep their copies.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
