"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  AwardIcon,
  CalendarClockIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { PageHeader, PersonAvatar, SectionTitle, formatDate, formatNumber } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge as BadgePill,
  Button,
  Card,
  CardContent,
  DialogTrigger,
  EmptyState,
  Input,
  Label,
  Skeleton,
  StatCard,
  buttonVariants,
  cn,
} from "@moa/ui";
import { enter, hoverLift, pressable, stagger } from "@moa/ui/motion";

import {
  useAwardBadge,
  useBadgeRecipients,
  useBadgeStats,
  useDeleteBadge,
  useRevokeBadge,
} from "../queries";
import type { BadgeRecipient } from "../schemas";
import { BadgeFormDialog } from "./badge-form";

/**
 * One badge: how often it has been earned, who holds it, and the controls to
 * award or revoke it by hand.
 *
 * `/badges/admin/{id}/stats` and `/recipients` both existed from the start
 * and neither had ever been called -- this is the page they were written for.
 */
function AwardForm({ badgeId, isClub }: { badgeId: number; isClub: boolean }) {
  const [entityId, setEntityId] = React.useState("");
  const award = useAwardBadge(badgeId);

  const parsed = Number(entityId);
  const canAward = entityId.trim() !== "" && Number.isInteger(parsed) && parsed > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canAward) return;
    await award.mutateAsync(parsed);
    setEntityId("");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="award-entity">
          {isClub ? "Club ID" : "User ID"}
        </Label>
        <Input
          id="award-entity"
          inputMode="numeric"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          placeholder={isClub ? "e.g. 5" : "e.g. 412"}
          disabled={award.isPending}
        />
      </div>
      <Button type="submit" disabled={!canAward || award.isPending} className={pressable}>
        {award.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
        Award
      </Button>
    </form>
  );
}

function RecipientRow({
  recipient,
  badgeId,
  isClub,
  index,
}: {
  recipient: BadgeRecipient;
  badgeId: number;
  isClub: boolean;
  index: number;
}) {
  const revoke = useRevokeBadge(badgeId);
  const href = isClub ? `/clubs/${recipient.entity_id}` : `/users/${recipient.entity_id}`;

  return (
    <div
      style={stagger(index)}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-1 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
        hoverLift
      )}
    >
      <PersonAvatar
        name={recipient.entity_name}
        avatar={recipient.avatar}
        // A club's logo is square art; a person is a disc.
        className={cn("size-9", isClub && "rounded-md")}
        fallbackClassName={cn("text-[11px]", isClub && "rounded-md")}
      />
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block truncate font-medium underline-offset-4 hover:underline"
        >
          {recipient.entity_name || `#${recipient.entity_id}`}
        </Link>
        <p className="text-muted-foreground truncate text-xs">
          {recipient.entity_email || "--"}
        </p>
      </div>
      <span className="text-muted-foreground shrink-0 text-xs">
        {formatDate(recipient.awarded_at)}
      </span>
      <Button
        size="icon-sm"
        variant="ghost"
        className={cn("text-destructive hover:text-destructive", pressable)}
        disabled={revoke.isPending}
        aria-label={`Revoke from ${recipient.entity_name ?? recipient.entity_id}`}
        onClick={() => revoke.mutate(recipient.entity_id)}
      >
        {revoke.isPending ? <Loader2Icon className="animate-spin" /> : <XIcon />}
      </Button>
    </div>
  );
}

export function BadgeDetail({ badgeId }: { badgeId: number }) {
  const router = useRouter();
  const { data: stats, isPending, isError } = useBadgeStats(badgeId);
  const recipients = useBadgeRecipients(badgeId);
  const remove = useDeleteBadge();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);

  if (isError) {
    return (
      <EmptyState
        tone="muted"
        title="Could not load this badge"
        description="It may have been deleted."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/badges">Back to badges</Link>
          </Button>
        }
      />
    );
  }

  const badge = stats?.badge;
  const isClub = badge?.badge_type === "club";
  const rows = recipients.data?.recipients ?? [];

  const cards = [
    {
      label: "Total awarded",
      value: stats ? formatNumber(stats.total_awarded) : "--",
      icon: <AwardIcon />,
    },
    {
      label: "Last 30 days",
      value: stats ? formatNumber(stats.awards_last_30_days) : "--",
      icon: <CalendarClockIcon />,
    },
    {
      label: "Last 7 days",
      value: stats ? formatNumber(stats.awards_last_7_days) : "--",
      icon: <UsersIcon />,
    },
  ];

  return (
    <div className={cn(enter)}>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
        <Link href="/badges">
          <ArrowLeftIcon /> All badges
        </Link>
      </Button>

      <PageHeader
        title={badge?.name ?? "Badge"}
        action={
          badge ? (
            <div className="flex items-center gap-2">
              <BadgeFormDialog
                badge={badge}
                open={editOpen}
                onOpenChange={setEditOpen}
                trigger={
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className={pressable}>
                      <PencilIcon /> Edit
                    </Button>
                  </DialogTrigger>
                }
              />
              <Button
                size="sm"
                variant="ghost"
                className={cn("text-destructive hover:text-destructive", pressable)}
                disabled={remove.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2Icon /> Delete
              </Button>
            </div>
          ) : null
        }
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span
              aria-hidden="true"
              className="bg-muted grid size-16 shrink-0 place-items-center rounded-xl text-3xl"
            >
              {badge?.emoji || "🏅"}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              {isPending ? (
                <Skeleton className="h-5 w-48" />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <BadgePill variant="outline">
                      {isClub ? "Clubs" : "Users"}
                    </BadgePill>
                    <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                      {badge?.slug}
                    </code>
                  </div>
                  <p className="text-muted-foreground text-sm">{badge?.description}</p>
                  <p className="text-muted-foreground text-xs">
                    Awarded automatically at{" "}
                    <strong>{formatNumber(badge?.threshold ?? 0)}</strong>{" "}
                    {badge?.trigger_metric?.replace(/_/g, " ")}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <SectionTitle>Awards</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            {cards.map((card, i) => (
              <div
                key={card.label}
                style={stagger(i)}
                className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none"
              >
                <StatCard
                  label={card.label}
                  value={card.value}
                  icon={card.icon}
                  className={cn("h-full", hoverLift)}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle>Award by hand</SectionTitle>
          <Card>
            <CardContent>
              <AwardForm badgeId={badgeId} isClub={isClub} />
              <p className="text-muted-foreground mt-2 text-xs">
                Takes {isClub ? "a club" : "a user"} id, which you can copy from
                the {isClub ? "clubs" : "users"} page. A manual award is
                permanent until revoked — the automatic checker will not undo
                it.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <SectionTitle>
            Holders{recipients.data ? ` (${formatNumber(recipients.data.total)})` : ""}
          </SectionTitle>

          {recipients.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : recipients.isError ? (
            <EmptyState
              tone="muted"
              title="Could not load holders"
              description="Try reloading the page."
            />
          ) : rows.length === 0 ? (
            <EmptyState
              tone="muted"
              title="Nobody holds this badge yet"
              description="It is awarded automatically once the threshold is met, or you can give it by hand above."
            />
          ) : (
            <div className="space-y-2">
              {rows.map((recipient, i) => (
                <RecipientRow
                  key={recipient.id}
                  recipient={recipient}
                  badgeId={badgeId}
                  isClub={isClub}
                  index={i}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{badge?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {(stats?.total_awarded ?? 0) > 0 ? (
                <>
                  <strong>
                    {formatNumber(stats?.total_awarded ?? 0)}{" "}
                    {isClub ? "club" : "person"}
                    {(stats?.total_awarded ?? 0) === 1 ? "" : "s"}
                  </strong>{" "}
                  hold this badge and will lose it. The definition has no
                  soft-delete, so this is permanent and cannot be undone from
                  here.
                </>
              ) : (
                "Nobody holds this badge. The definition has no soft-delete, so this is permanent."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() =>
                // The hook toasts a refusal; only a delete that went through
                // leaves the page. Awaiting mutateAsync here left every
                // refusal as an unhandled promise rejection.
                remove.mutate(badgeId, { onSuccess: () => router.replace("/badges") })
              }
            >
              Delete badge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
