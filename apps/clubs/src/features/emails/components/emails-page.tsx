"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  MailPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import {
  formatDateTime,
  formatNumber,
  relativeTime,
  timeUntil,
} from "@moa/app-kit";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  FigurePanel,
  IconButton,
  Notice,
  Skeleton,
  StatTile,
  Switch,
  cn,
} from "@moa/ui";

import {
  addTallies,
  tallyFigures,
  useDeliverySummary,
  useDeliveryTallies,
  type TallyFigures,
} from "@/features/deliveries";

import {
  useCreateTemplate,
  useDeleteTemplate,
  useDuplicateTemplate,
  useMessages,
  useSaveTemplate,
  useTemplates,
} from "../queries";
import {
  STAGE_META,
  audienceSummary,
  blankTemplate,
  fieldsOf,
  triggerSummary,
  type EmailTemplate,
  type JourneyStage,
  type Message,
} from "../schemas";
import {
  EmailPreview,
  MiniFigures,
  PreviewToggle,
  isCustomised,
  type Figure,
} from "./parts";
import { SendTemplateDialog } from "./send-dialog";

/**
 * An event's emails, rebuilt around what an organiser needs to know of
 * them: which go out, when, to whom, and whether they arrived. One line
 * and four figures — how much of the journey is on, what goes out next,
 * how many emails left, how many were delivered; one notice when something
 * is off or did not reach; then the four journey emails as cards that say
 * how each goes out, whether it was changed for this event and what its
 * send did; then the others the club wrote. Editing is its own page.
 */

/** What every send of one email added up to, newest first. */
interface Sends {
  count: number;
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
  last: Message;
}

function sendsByTemplate(items: Message[]): Map<string, Sends> {
  const out = new Map<string, Sends>();
  for (const m of items) {
    if (!m.templateId || m.kind === "TEST") continue;
    const was = out.get(m.templateId);
    out.set(m.templateId, {
      count: (was?.count ?? 0) + 1,
      recipients: (was?.recipients ?? 0) + m.recipients,
      sent: (was?.sent ?? 0) + m.sentCount,
      failed: (was?.failed ?? 0) + m.failedCount,
      skipped: (was?.skipped ?? 0) + m.skippedCount,
      last: was?.last ?? m,
    });
  }
  return out;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const plural = (n: number, one: string, many = `${one}s`) =>
  `${formatNumber(n)} ${n === 1 ? one : many}`;

interface InviteFigures {
  f: TallyFigures;
  guests: number;
  waiting: number;
}

function StageCard({
  eventId,
  stage,
  invite,
  now,
  onSend,
}: {
  eventId: number;
  stage: JourneyStage;
  invite: InviteFigures | null;
  now: Date;
  onSend: (t: EmailTemplate) => void;
}) {
  const t = stage.template;
  const save = useSaveTemplate({ kind: "event", eventId });
  const [open, setOpen] = React.useState(false);
  const meta = STAGE_META[t.stage];
  const last = stage.lastMessage ?? null;
  const isInvite = t.stage === "INVITE";
  const attach = [
    t.attachments.ticketPdf || isInvite ? "the ticket" : null,
    t.attachments.certificatePdf ? "the certificate" : null,
  ].filter(Boolean);

  const figures: readonly Figure[] =
    isInvite && invite
      ? [
          [
            "sent",
            formatNumber(invite.f.sent),
            invite.guests
              ? `of ${plural(invite.guests, "guest")}`
              : "nobody registered yet",
          ],
          [
            "delivered",
            invite.f.deliveryRate === null ? "—" : `${invite.f.deliveryRate}%`,
            invite.f.known
              ? invite.f.didntArrive
                ? `${formatNumber(invite.f.didntArrive)} did not arrive`
                : `${formatNumber(invite.f.delivered)} reported`
              : invite.f.sent
                ? "no reports yet"
                : "nothing sent yet",
          ],
          [
            "waiting",
            formatNumber(invite.waiting),
            invite.waiting ? "without their ticket" : "everyone has one",
          ],
        ]
      : [
          [
            "sent to",
            last ? formatNumber(last.sentCount) : "—",
            last
              ? `of ${formatNumber(last.recipients)} addressed`
              : "not sent yet",
          ],
          [
            "not sent",
            last ? formatNumber(last.failedCount + last.skippedCount) : "—",
            last
              ? last.failedCount || last.skippedCount
                ? `${last.failedCount} failed · ${last.skippedCount} no address`
                : "every one went"
              : "",
          ],
          stage.dueAt
            ? [
                "goes out in",
                timeUntil(stage.dueAt, now),
                formatDateTime(stage.dueAt),
              ]
            : [
                "last sent",
                last ? relativeTime(last.createdAt, now) : "—",
                last
                  ? last.scheduled
                    ? "by its timer"
                    : "by hand"
                  : t.trigger.mode === "MANUAL"
                    ? "when you send it"
                    : "waits for its moment",
              ],
        ];

  return (
    <FigurePanel
      className={cn("flex flex-col p-4", !t.enabled && "ring-caution-line")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="eyebrow">{meta.label}</span>
          <p className="text-ink mt-0.5 truncate text-[15px] font-semibold">
            {t.name}
          </p>
          <p className="text-ink-3 truncate text-[12px]">{t.subject}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[12px] font-medium">
          <span className={t.enabled ? "text-admit" : "text-caution"}>
            {save.isPending ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : t.enabled ? (
              "On"
            ) : (
              "Off"
            )}
          </span>
          <Switch
            checked={t.enabled}
            disabled={save.isPending}
            aria-label={`${meta.label} switched ${t.enabled ? "on" : "off"}`}
            onCheckedChange={(enabled) =>
              save.mutate({
                templateId: t.id,
                fields: { ...fieldsOf(t), enabled },
              })
            }
          />
        </label>
      </div>
      <p className="text-ink-2 mt-2 text-[12.5px]">
        Goes out{" "}
        <span className="text-ink">
          {isInvite ? "with every ticket" : lower(triggerSummary(t.trigger))}
        </span>{" "}
        · to{" "}
        <span className="text-ink">{lower(audienceSummary(t.audience))}</span>
        {attach.length ? ` · with ${attach.join(" and ")}` : ""}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[12px]",
          t.enabled ? "text-ink-3" : "text-caution",
        )}
      >
        {t.enabled
          ? isInvite
            ? "At registration, after payment, and from Send tickets on Attendees."
            : meta.note
          : isInvite
            ? "Off: tickets go out in the plain ticket email, without this design."
            : "Off: its timer does not fire and it is not sent."}
      </p>
      <MiniFigures items={figures} />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <span className="text-ink-3 text-[11.5px]">
          v{t.version} ·{" "}
          {isCustomised(t) ? "changed for this event" : "the club's version"}
        </span>
        <span className="flex flex-wrap gap-2">
          <PreviewToggle
            name={t.name}
            open={open}
            onToggle={() => setOpen(!open)}
          />
          <Link
            href={`/events/${eventId}/emails/${t.id}`}
            className="btn btn-secondary btn-sm"
          >
            <PencilIcon /> Edit
          </Link>
          {isInvite ? (
            <Link
              href={`/events/${eventId}/attendees`}
              className="btn btn-secondary btn-sm"
            >
              <SendIcon /> Send tickets
            </Link>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => onSend(t)}>
              <SendIcon /> Send now
            </Button>
          )}
        </span>
      </div>
      <EmailPreview
        scope={{ kind: "event", eventId }}
        subject={t.subject}
        design={t.design}
        name={t.name}
        open={open}
      />
    </FigurePanel>
  );
}

function CustomRow({
  eventId,
  t,
  sends,
  now,
  onSend,
  onDuplicate,
  onDelete,
}: {
  eventId: number;
  t: EmailTemplate;
  sends: Sends | undefined;
  now: Date;
  onSend: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const href = `/events/${eventId}/emails/${t.id}`;
  return (
    <li className="border-line-soft border-t px-4 py-3 first:border-t-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <Link
              href={href}
              className="text-ink truncate text-[13.5px] font-medium hover:underline"
            >
              {t.name}
            </Link>
            {!t.enabled ? (
              <span className="text-caution shrink-0 font-mono text-[10px] tracking-[0.06em] uppercase">
                Off
              </span>
            ) : null}
          </span>
          <p className="text-ink-3 truncate text-[12px]">
            {t.subject} · {lower(triggerSummary(t.trigger))} · to{" "}
            {lower(audienceSummary(t.audience))}
          </p>
        </div>
        <span className="hidden shrink-0 text-right sm:block">
          <span className="text-ink block font-mono text-[12px] tabular-nums">
            {sends
              ? `${formatNumber(sends.sent)} of ${formatNumber(sends.recipients)} sent`
              : "not sent yet"}
          </span>
          <span
            className={cn(
              "block text-[11px]",
              sends?.failed ? "text-caution" : "text-ink-3",
            )}
            title={sends ? formatDateTime(sends.last.createdAt) : undefined}
          >
            {sends
              ? `${plural(sends.count, "send")} · last ${relativeTime(sends.last.createdAt, now)}${sends.failed ? ` · ${sends.failed} failed` : ""}`
              : lower(triggerSummary(t.trigger))}
          </span>
        </span>
        <IconButton
          label={`${open ? "Hide" : "Preview"} ${t.name}`}
          variant="quiet"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <EyeOffIcon /> : <EyeIcon />}
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={`Actions for ${t.name}`}>
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => router.push(href)}>
              <PencilIcon /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSend}>
              <SendIcon /> Send now…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <CopyIcon /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2Icon /> Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <EmailPreview
        scope={{ kind: "event", eventId }}
        subject={t.subject}
        design={t.design}
        name={t.name}
        open={open}
      />
    </li>
  );
}

export function EmailsPage({ eventId }: { eventId: number }) {
  const router = useRouter();
  const [now] = React.useState(() => new Date());
  const list = useTemplates(eventId);
  // Every send of every email, for what each did; an event sends far fewer than a hundred.
  const messages = useMessages(eventId, 1, 100);
  const tallies = useDeliveryTallies(eventId);
  const tickets = useDeliverySummary(eventId, "ticket");
  const scope = { kind: "event" as const, eventId };
  const create = useCreateTemplate(scope);
  const duplicate = useDuplicateTemplate(scope);
  const remove = useDeleteTemplate(scope);
  const [sending, setSending] = React.useState<EmailTemplate | null>(null);
  const [deleting, setDeleting] = React.useState<EmailTemplate | null>(null);

  const journey = list.data?.journey ?? [];
  const custom = list.data?.custom ?? [];
  const byTemplate = sendsByTemplate(messages.data?.items ?? []);
  const off = journey.filter((s) => !s.template.enabled);
  const on = journey.length - off.length;
  const next = journey
    .filter((s) => s.template.enabled && s.dueAt)
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];
  const ticketFigures = tallyFigures(tallies.ticket);
  const messageFigures = tallyFigures(tallies.message);
  const mail = tallyFigures(addTallies(tallies.ticket, tallies.message));
  const email = tickets.data?.channels.find((c) => c.channel === "email");
  const invite: InviteFigures = {
    f: ticketFigures,
    guests: tickets.data?.registrations ?? 0,
    waiting: email ? email.unsent + email.failed + email.skipped : 0,
  };
  const failedSend = (messages.data?.items ?? []).find(
    (m) => m.kind !== "TEST" && m.failedCount > 0,
  );
  const inviteOff = off.find((s) => s.stage === "INVITE");
  const editor = (id: string) => `/events/${eventId}/emails/${id}`;

  const newEmail = () =>
    create.mutate(
      { fields: blankTemplate() },
      { onSuccess: (t) => router.push(editor(t.id)) },
    );

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">
            Emails
          </h2>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {list.data
              ? `${on} of ${journey.length} journey emails on · ${plural(custom.length, "other")}${next ? ` · next out in ${timeUntil(next.dueAt, now)}: ${STAGE_META[next.template.stage].label}` : " · nothing timed is waiting"}`
              : "Which emails this event sends, when, to whom, and whether they arrived."}
          </p>
        </div>
        <Button disabled={create.isPending} onClick={newEmail}>
          {create.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <PlusIcon />
          )}
          New email
        </Button>
      </header>

      {list.isError ? (
        <EmptyState
          tone="muted"
          title="Could not load this event's emails"
          description={`${list.error.message} Try reloading the page.`}
        />
      ) : list.isPending || tallies.isPending ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[108px] rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[260px] rounded-2xl" />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Journey emails on"
              value={`${on} of ${journey.length}`}
              note={
                off.length
                  ? `${off.map((s) => STAGE_META[s.stage].label).join(", ")} ${off.length === 1 ? "is" : "are"} off`
                  : "all of them go out"
              }
            />
            <StatTile
              label="Next to go out"
              value={next ? timeUntil(next.dueAt, now) : "—"}
              note={
                next
                  ? `${STAGE_META[next.template.stage].label} · ${formatDateTime(next.dueAt)}`
                  : "nothing timed is waiting"
              }
              action={
                next
                  ? { label: "Open it", href: editor(next.template.id) }
                  : undefined
              }
              linkAs={Link}
            />
            <StatTile
              label="Emails sent"
              value={tallies.isError ? "—" : formatNumber(mail.sent)}
              note={
                tallies.isError
                  ? "could not load the figures"
                  : mail.sends
                    ? `${formatNumber(ticketFigures.sent)} with tickets · ${formatNumber(messageFigures.sent)} other emails`
                    : "nothing sent yet"
              }
            />
            <StatTile
              label="Delivered"
              value={mail.deliveryRate === null ? "—" : `${mail.deliveryRate}%`}
              note={
                tallies.isError
                  ? "could not load the figures"
                  : mail.known
                    ? mail.didntArrive
                      ? `${formatNumber(mail.didntArrive)} did not arrive`
                      : `all ${formatNumber(mail.delivered)} reported arrived`
                    : mail.sent
                      ? "no delivery reports yet"
                      : "nothing sent yet"
              }
              action={
                mail.didntArrive
                  ? {
                      label: "See which",
                      href: `/events/${eventId}/deliveries?problem=1`,
                    }
                  : undefined
              }
              linkAs={Link}
            />
          </div>

          {inviteOff ? (
            <Notice
              tone="caution"
              tag="Invite"
              action={
                <Link
                  href={editor(inviteOff.template.id)}
                  className="btn btn-secondary btn-sm"
                >
                  Open it
                </Link>
              }
            >
              The invite is off for this event, so tickets go out in the plain
              ticket email, without your design.
            </Notice>
          ) : off.length ? (
            <Notice
              tone="neutral"
              tag="Off"
              action={
                <Link
                  href={editor(off[0]!.template.id)}
                  className="btn btn-secondary btn-sm"
                >
                  Open it
                </Link>
              }
            >
              {off.map((s) => STAGE_META[s.stage].label).join(" and ")}{" "}
              {off.length === 1 ? "is" : "are"} off for this event and will not
              go out.
            </Notice>
          ) : failedSend ? (
            <Notice
              tone="caution"
              tag="Last send"
              action={
                <Link
                  href={`/events/${eventId}/deliveries?kind=message&problem=1`}
                  className="btn btn-secondary btn-sm"
                >
                  See who
                </Link>
              }
            >
              “{failedSend.subject ?? "An email"}” could not reach{" "}
              {formatNumber(failedSend.failedCount)} of{" "}
              {formatNumber(failedSend.recipients)} guests.
            </Notice>
          ) : null}

          <section>
            <h3 className="eyebrow mb-2">The journey</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {journey.map((s) => (
                <StageCard
                  key={s.stage}
                  eventId={eventId}
                  stage={s}
                  invite={s.stage === "INVITE" ? invite : null}
                  now={now}
                  onSend={setSending}
                />
              ))}
            </div>
          </section>

          <section>
            <h3 className="eyebrow mb-2">Other emails</h3>
            <FigurePanel className="p-0">
              {custom.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={<MailPlusIcon />}
                  title="Nothing beyond the journey yet"
                  description="A sponsor's note, a schedule change, a thank-you: design it once, then send it by hand or on a timer."
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={create.isPending}
                      onClick={newEmail}
                    >
                      <PlusIcon /> Write one
                    </Button>
                  }
                />
              ) : (
                <ul>
                  {custom.map((t) => (
                    <CustomRow
                      key={t.id}
                      eventId={eventId}
                      t={t}
                      sends={byTemplate.get(t.id)}
                      now={now}
                      onSend={() => setSending(t)}
                      onDuplicate={() => duplicate.mutate(t.id)}
                      onDelete={() => setDeleting(t)}
                    />
                  ))}
                </ul>
              )}
            </FigurePanel>
          </section>
        </>
      )}

      <SendTemplateDialog
        eventId={eventId}
        template={sending}
        open={sending !== null}
        onOpenChange={(o) => !o && setSending(null)}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Messages already sent from it stay in the history. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting)
                  remove.mutate(deleting.id, {
                    onSuccess: () => setDeleting(null),
                  });
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
