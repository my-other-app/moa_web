"use client";

import * as React from "react";
import { LockIcon, PencilIcon, PlusIcon, TicketPercentIcon, Trash2Icon } from "lucide-react";
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
  CardLabel,
  EmptyState,
  FigurePanel,
  IconButton,
  Skeleton,
  StatusBadge,
  Switch,
  type StatusTone,
} from "@moa/ui";

import { useAccess } from "@/features/access";
import { useFeatureGate } from "@/features/plan";

import { useDeleteDiscountCode, useDiscountCodes, useToggleDiscountCode } from "../queries";
import { CODE_STATUS_LABEL, codeValueText, usesText, type CodeStatus, type DiscountCode } from "../schemas";
import { DiscountCodeDialog } from "./discount-code-dialog";

/**
 * Discount codes: the club's page (every code, for one event or all of
 * them) and an event's Tickets tab (the codes that event takes). Each row
 * says what it takes off, where it works, its window, how often it was used
 * against its limit and what it gave away; a code can be changed, switched
 * off and on, or deleted. Making codes is a plan feature: without it the
 * button opens the upgrade dialog, and the codes already made stay listed.
 */
const STATUS_TONE: Record<CodeStatus, StatusTone> = {
  active: "success",
  scheduled: "info",
  expired: "default",
  used_up: "warning",
  inactive: "default",
};

function windowText(c: DiscountCode): string {
  if (!c.starts_at && !c.ends_at) return "Any time";
  if (c.starts_at && c.ends_at) return `${formatDateTime(c.starts_at)} – ${formatDateTime(c.ends_at)}`;
  return c.starts_at ? `From ${formatDateTime(c.starts_at)}` : `Until ${formatDateTime(c.ends_at)}`;
}

function CodeRow({ c, onEdit, canEdit }: { c: DiscountCode; onEdit: () => void; canEdit: boolean }) {
  const toggle = useToggleDiscountCode();
  const remove = useDeleteDiscountCode();
  const [confirm, setConfirm] = React.useState(false);
  return (
    <li className="border-line-soft grid gap-2 border-t px-4 py-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink font-mono text-[14px] font-semibold">{c.code}</span>
          <StatusBadge label={CODE_STATUS_LABEL[c.status]} tone={STATUS_TONE[c.status]} />
        </div>
        <p className="text-ink-2 text-[12.5px]">
          {codeValueText(c)} · {c.event_id ? (c.event_name ?? "One event") : "Every event"}
          {c.ticket_type_ids?.length ? ` · ${c.ticket_type_ids.length} ${c.ticket_type_ids.length === 1 ? "ticket type" : "ticket types"}` : ""}
        </p>
      </div>
      <p className="text-ink-3 text-[12px]">{windowText(c)}</p>
      <p className="text-ink-2 font-mono text-[12.5px] tabular-nums">
        {usesText(c)}
        {c.per_person_limit ? <span className="text-ink-3"> · {c.per_person_limit} per person</span> : null}
        <span className="text-ink-3 block">₹{c.discount_total.toLocaleString("en-IN")} given</span>
      </p>
      {canEdit ? (
        <div className="flex items-center gap-1.5">
          <Switch checked={c.is_active} disabled={toggle.isPending} onCheckedChange={(active) => toggle.mutate({ id: c.id, active })} aria-label={c.is_active ? `Turn ${c.code} off` : `Turn ${c.code} on`} />
          <IconButton label={`Edit ${c.code}`} onClick={onEdit} variant="ghost" size="sm">
            <PencilIcon />
          </IconButton>
          <IconButton label={`Delete ${c.code}`} onClick={() => setConfirm(true)} variant="ghost" size="sm">
            <Trash2Icon />
          </IconButton>
          <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {c.code}?</AlertDialogTitle>
                <AlertDialogDescription>Nobody can use it after this. Tickets already bought with it keep their price.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate({ id: c.id, code: c.code })}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </li>
  );
}

export function DiscountCodesPanel({ eventId = null, title = "Discount codes" }: { eventId?: number | null; title?: string }) {
  const codes = useDiscountCodes({ eventId });
  const { can } = useAccess();
  const gate = useFeatureGate("coupons", { eventId });
  const [editing, setEditing] = React.useState<DiscountCode | null>(null);
  const [open, setOpen] = React.useState(false);
  // A new key each time the dialog opens, so it starts from the code (or blank).
  const [opened, setOpened] = React.useState(0);

  if (codes.data === null) return null;

  const startNew = () => {
    setEditing(null);
    setOpened((n) => n + 1);
    setOpen(true);
  };
  const newButton = can.edit_events ? (
    gate.locked ? (
      <button type="button" className="btn btn-primary btn-sm" onClick={gate.prompt}>
        <LockIcon className="size-4" /> New code
      </button>
    ) : (
      <button type="button" className="btn btn-primary btn-sm" onClick={startNew}>
        <PlusIcon className="size-4" /> New code
      </button>
    )
  ) : null;

  return (
    <FigurePanel className="p-0">
      <div className="px-4 pt-4 pb-3">
        <CardLabel right={newButton}>{title}</CardLabel>
        {eventId ? <p className="text-ink-3 mt-1 text-[12px]">This event&apos;s own codes, and the club&apos;s codes that work on every event.</p> : null}
      </div>
      {codes.isPending ? (
        <div className="grid gap-2 px-4 pb-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : codes.isError ? (
        <p className="text-ink-3 px-4 pb-4 text-[12.5px]">The codes could not load. Try again in a moment.</p>
      ) : codes.data && codes.data.length === 0 ? (
        <div className="px-4 pb-5">
          <EmptyState
            size="sm"
            icon={<TicketPercentIcon />}
            title="No discount codes yet"
            description="Make one for early birds, members or a partner: people type it when they register and the price drops for them."
          />
        </div>
      ) : (
        <ul aria-label="Discount codes">
          {(codes.data ?? []).map((c) => (
            <CodeRow
              key={c.id}
              c={c}
              canEdit={Boolean(can.edit_events)}
              onEdit={() => {
                setEditing(c);
                setOpened((n) => n + 1);
                setOpen(true);
              }}
            />
          ))}
        </ul>
      )}
      <DiscountCodeDialog key={opened} open={open} onOpenChange={setOpen} code={editing} eventId={eventId} />
    </FigurePanel>
  );
}

/** The club's own page: every code. */
export function DiscountCodesPage() {
  const codes = useDiscountCodes({});
  return (
    <div className="grid gap-5">
      <header>
        <h1 className="page-title">Discount codes</h1>
        <p className="text-ink-3 mt-1 text-[12.5px]">Codes people type when they register: for one event, or for every event of the club. The price is worked out for them, and a code can be held to a window, a number of uses, or some ticket types.</p>
      </header>
      {codes.data === null ? (
        <FigurePanel>
          <EmptyState size="sm" title="Discount codes aren't available yet" description="They arrive with the next update of MyOtherApp. Nothing to do on your side." />
        </FigurePanel>
      ) : (
        <DiscountCodesPanel />
      )}
    </div>
  );
}
