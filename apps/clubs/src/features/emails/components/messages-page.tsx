"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ClockIcon,
  Loader2Icon,
  MailIcon,
  PenLineIcon,
  SendIcon,
} from "lucide-react";
import { formatDateTime, formatNumber, relativeTime } from "@moa/app-kit";
import {
  Button,
  CardLabel,
  Chip,
  cn,
  DefinitionRows,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  Notice,
  Pager,
  ProgressBar,
  SearchField,
  Skeleton,
  StatTile,
  StatusBadge,
  Toolbar,
  ToolbarEnd,
} from "@moa/ui";

import { WriteWithAi } from "@/features/ai";
import { tallyFigures, useDeliveryTally } from "@/features/deliveries";

import {
  useAudienceCount,
  useEmailContext,
  useMessage,
  useMessages,
  useSendMessage,
} from "../queries";
import {
  AUDIENCE_WHO,
  audienceSummary,
  emailAttachmentsSchema,
  emailAudienceSchema,
  type EmailAttachments,
  type EmailAudience,
  type Message,
} from "../schemas";
import { TemplateField, Toggle, ui, useDebounced } from "./kit";
import { MiniFigures } from "./parts";
import { AudienceFields } from "./panels";

/**
 * Messages, rebuilt around its two jobs: write to the guests now, and see
 * what every email that went out did. One line and four figures — how many
 * went out, how many people they reached, how many were delivered, how many
 * did not arrive; one notice when a message is on its way or missed people;
 * then every message, newest first, each saying who it went to and how far
 * it got. Writing one is a dialog that checks who it reaches before it
 * sends; a message opens on who got it.
 */
const whoLabel = (m: Message) =>
  `${AUDIENCE_WHO.find((w) => w.value === m.audience)?.label ?? m.audience}${m.roles.length ? ` · ${m.roles.join(", ")}` : ""}`;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${formatNumber(n)} ${n === 1 ? one : many}`;
const origin = (m: Message) =>
  m.kind === "BROADCAST"
    ? `Written here${m.createdByName ? ` by ${m.createdByName}` : ""}`
    : m.scheduled
      ? "Journey email, on its timer"
      : `Journey email, sent by hand${m.createdByName ? ` by ${m.createdByName}` : ""}`;
const COLS = "sm:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_170px_96px]";

/** Write to the guests: the words, who gets them, what rides along; then a last look before it goes. */
function Composer({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ctx = useEmailContext({ kind: "event", eventId });
  const send = useSendMessage(eventId);
  const [step, setStep] = React.useState<"write" | "check">("write");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [audience, setAudience] = React.useState<EmailAudience>(() =>
    emailAudienceSchema.parse({}),
  );
  const [attachments, setAttachments] = React.useState<EmailAttachments>(() =>
    emailAttachmentsSchema.parse({}),
  );
  const [clientRef, setClientRef] = React.useState<string>(() =>
    crypto.randomUUID(),
  );
  const count = useAudienceCount(eventId, audience, open);
  const tokens = ctx.data?.tokens ?? [];
  const samples = ctx.data?.sampleValues ?? {};
  const ready = subject.trim().length > 0 && body.trim().length > 0;
  const n = count.data?.recipients;
  const files = [
    attachments.ticketPdf ? "their ticket" : null,
    attachments.certificatePdf ? "their certificate" : null,
  ].filter(Boolean);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setStep("write");
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>
            {step === "write" ? "New message" : "Send this message?"}
          </DialogTitle>
          <DialogDescription>
            {step === "write"
              ? "A one-off email to this event's guests, in the event's email design. Tokens fill in per guest."
              : "Each guest is emailed one by one. It cannot be recalled once it leaves."}
          </DialogDescription>
        </DialogHeader>

        {step === "write" ? (
          <div className="grid gap-4">
            <TemplateField
              id="m-subject"
              label="Subject"
              value={subject}
              single
              onChange={setSubject}
              tokens={tokens}
              samples={samples}
              placeholder="A change to {{event_name}}"
            />
            <div>
              <TemplateField
                id="m-body"
                label="Message"
                value={body}
                rows={8}
                onChange={setBody}
                tokens={tokens}
                samples={samples}
                placeholder="Hi {{first_name}}, …"
                extra={
                  <WriteWithAi
                    kind="email"
                    eventId={eventId}
                    value={body}
                    onChange={setBody}
                    subject={{ value: subject, onChange: setSubject }}
                  />
                }
              />
              <p className={cn(ui.note, "mt-1")}>
                **bold**, _italic_ and [links](https://…) work. A blank line
                starts a new paragraph.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1.35fr_1fr]">
              <AudienceFields
                audience={audience}
                onChange={setAudience}
                eventId={eventId}
              />
              <div>
                <span className={ui.label}>Attach</span>
                <div className="grid gap-1.5">
                  <Toggle
                    id="m-ticket"
                    label="The guest's ticket PDF"
                    checked={attachments.ticketPdf}
                    onChange={(ticketPdf) =>
                      setAttachments((a) => ({ ...a, ticketPdf }))
                    }
                    note="Skipped for a revoked ticket."
                  />
                  <Toggle
                    id="m-cert"
                    label="The guest's certificate PDF"
                    checked={attachments.certificatePdf}
                    onChange={(certificatePdf) =>
                      setAttachments((a) => ({ ...a, certificatePdf }))
                    }
                    note="Only guests who hold one get it."
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <DefinitionRows
              rows={[
                { k: "Subject", v: subject.trim() },
                { k: "To", v: audienceSummary(audience) },
                {
                  k: "Reaches",
                  v:
                    n === undefined
                      ? "Counting…"
                      : `${plural(n, "guest")} with an email address${count.data?.withoutEmail ? ` · ${formatNumber(count.data.withoutEmail)} without one are skipped` : ""}`,
                },
                {
                  k: "Attached",
                  v: files.length ? files.join(" and ") : "Nothing",
                },
              ]}
            />
            <div>
              <span className={ui.label}>As written</span>
              <div className="bg-sunken text-ink-2 max-h-48 overflow-y-auto rounded-xl px-3 py-2.5 text-[12.5px] leading-[1.55] whitespace-pre-wrap">
                {body}
              </div>
            </div>
            {n === 0 ? (
              <Notice tone="caution" tag="Nobody">
                Nobody in this audience has an email address. Pick another
                audience, or add addresses on Attendees.
              </Notice>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {step === "write" ? (
            <>
              <Button variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button disabled={!ready} onClick={() => setStep("check")}>
                Review <ArrowRightIcon />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                disabled={send.isPending}
                onClick={() => setStep("write")}
              >
                <ArrowLeftIcon /> Back
              </Button>
              <Button
                disabled={send.isPending || !n}
                onClick={() =>
                  send.mutate(
                    {
                      subject: subject.trim(),
                      body,
                      audience,
                      attachments,
                      clientRef,
                    },
                    {
                      onSuccess: () => {
                        close(false);
                        setSubject("");
                        setBody("");
                        setClientRef(crypto.randomUUID());
                      },
                    },
                  )
                }
              >
                {send.isPending ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SendIcon />
                )}
                {n ? `Send to ${plural(n, "guest")}` : "Send"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DETAIL_PAGE = 50;

/** One message: what it said, how far it got, and who it reached. */
function MessageDialog({
  eventId,
  message,
  initialProblem,
  onClose,
}: {
  eventId: number;
  message: Message;
  initialProblem: boolean;
  onClose: () => void;
}) {
  const [problem, setProblem] = React.useState(initialProblem);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const settled = useDebounced(search.trim(), 300);
  const detail = useMessage(eventId, message.id, {
    problem,
    search: settled || undefined,
    page,
    pageSize: DETAIL_PAGE,
  });
  const m = detail.data?.message ?? message;
  const rows = detail.data?.deliveries ?? [];
  const total = detail.data?.total ?? 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.subject || "(no subject)"}</DialogTitle>
          <DialogDescription>
            {origin(m)} · to {whoLabel(m).toLowerCase()} ·{" "}
            {formatDateTime(m.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <MiniFigures
          items={[
            ["addressed", formatNumber(m.recipients), "guests it was for"],
            [
              "sent",
              formatNumber(m.sentCount),
              m.status === "SENDING"
                ? "still going out"
                : "handed to the provider",
            ],
            [
              "not sent",
              formatNumber(m.failedCount + m.skippedCount),
              `${m.failedCount} failed · ${m.skippedCount} no address`,
            ],
          ]}
        />

        {m.kind === "BROADCAST" && m.body ? (
          <div>
            <span className={ui.label}>What it said</span>
            <div className="bg-sunken text-ink-2 max-h-40 overflow-y-auto rounded-xl px-3 py-2.5 text-[12.5px] leading-[1.55] whitespace-pre-wrap">
              {m.body}
            </div>
          </div>
        ) : null}

        <FigurePanel className="p-0">
          <Toolbar>
            <Chip
              tone="refuse"
              active={problem}
              onClick={() => {
                setProblem((p) => !p);
                setPage(1);
              }}
            >
              Problems only
              {m.failedCount + m.skippedCount
                ? ` ${m.failedCount + m.skippedCount}`
                : ""}
            </Chip>
            <ToolbarEnd>
              <SearchField
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder="Name or email"
                label="Search guests"
                size="sm"
                className="sm:w-52"
              />
            </ToolbarEnd>
          </Toolbar>
          {detail.isPending ? (
            <div className="grid gap-2 p-4">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : detail.isError ? (
            <EmptyState
              size="sm"
              tone="muted"
              title="Could not load who it reached"
              description="Close this and open it again."
            />
          ) : rows.length === 0 ? (
            <EmptyState
              size="sm"
              title={problem ? "No problems" : "Nobody matched"}
              description={
                problem
                  ? "Every guest it was for was sent it."
                  : "Try another name or address."
              }
            />
          ) : (
            <ul>
              {rows.map((d) => (
                <li
                  key={d.registrationId}
                  className="border-line-soft grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 border-t px-4 py-2.5 first:border-t-0 text-[12.5px]"
                >
                  <span className="min-w-0">
                    <span className="text-ink block truncate font-medium">
                      {d.name || "Unnamed guest"}
                    </span>
                    <span
                      className={cn(
                        "block truncate font-mono text-[11.5px]",
                        d.email ? "text-ink-3" : "text-caution",
                      )}
                    >
                      {d.email ?? "no address"}
                    </span>
                  </span>
                  <span className="text-right">
                    <StatusBadge
                      tone={
                        d.status === "sent"
                          ? "success"
                          : d.status === "failed"
                            ? "destructive"
                            : d.status === "skipped"
                              ? "warning"
                              : "info"
                      }
                      label={
                        d.status === "sent"
                          ? "Sent"
                          : d.status === "failed"
                            ? "Failed"
                            : d.status === "skipped"
                              ? "Skipped"
                              : "Queued"
                      }
                    />
                    <span className="text-ink-3 block text-[11px]">
                      {d.error ? (
                        <span className="text-refuse">{d.error}</span>
                      ) : d.sentAt ? (
                        formatDateTime(d.sentAt)
                      ) : null}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {total > DETAIL_PAGE ? (
            <div className="border-line-soft border-t px-4 py-2.5">
              <Pager
                page={page}
                pageCount={Math.max(1, Math.ceil(total / DETAIL_PAGE))}
                total={total}
                pageSize={DETAIL_PAGE}
                noun={["guest", "guests"]}
                busy={detail.isFetching}
                onPage={setPage}
              />
            </div>
          ) : null}
        </FigurePanel>
        <p className={ui.note}>
          Sent means handed to the mail provider. Whether each one arrived is on{" "}
          <Link
            href={`/events/${eventId}/deliveries?kind=message`}
            className="text-brand hover:underline"
          >
            Deliveries
          </Link>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  m,
  now,
  onOpen,
}: {
  m: Message;
  now: Date;
  onOpen: () => void;
}) {
  const written = m.kind === "BROADCAST";
  const sending = m.status === "SENDING";
  return (
    <li className="border-line-soft border-t first:border-t-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open “${m.subject || "no subject"}”`}
        className={cn(
          "hover:bg-sunken/50 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 text-left text-[12.5px] transition-colors",
          COLS,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full [&>svg]:size-4",
            written ? "bg-brand-soft text-brand" : "bg-sunken text-ink-2",
          )}
        >
          {written ? (
            <PenLineIcon />
          ) : m.scheduled ? (
            <ClockIcon />
          ) : (
            <SendIcon />
          )}
        </span>
        <span className="min-w-0">
          <span className="text-ink block truncate text-[13.5px] font-medium">
            {m.subject || "(no subject)"}
          </span>
          <span className="text-ink-3 block truncate text-[12px]">
            {origin(m)}
          </span>
        </span>
        <span className="text-ink-2 hidden min-w-0 truncate sm:block">
          {whoLabel(m)}
        </span>
        <span className="hidden sm:block">
          <span className="text-ink block font-mono text-[12.5px] tabular-nums">
            {formatNumber(m.sentCount)} of {formatNumber(m.recipients)} sent
          </span>
          <ProgressBar
            value={m.sentCount}
            max={Math.max(1, m.recipients)}
            tone={m.failedCount ? "caution" : "admit"}
            height={6}
            className="mt-1 w-36"
            label={`${m.subject ?? "Message"}: ${m.sentCount} of ${m.recipients} sent`}
          />
          <span
            className={cn(
              "block text-[11px]",
              m.failedCount ? "text-caution" : "text-ink-3",
            )}
          >
            {sending
              ? "sending…"
              : m.failedCount || m.skippedCount
                ? `${m.failedCount} failed · ${m.skippedCount} no address`
                : m.recipients
                  ? "every one went"
                  : "nobody to send to"}
          </span>
        </span>
        <span
          className="text-ink-3 shrink-0 text-right font-mono text-[11px]"
          title={formatDateTime(m.createdAt)}
        >
          {relativeTime(m.createdAt, now)}
        </span>
      </button>
    </li>
  );
}

/** Write to the guests now, and see every email that went before. */
export function MessagesPage({ eventId }: { eventId: number }) {
  const [now] = React.useState(() => new Date());
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const list = useMessages(eventId, page, pageSize);
  // The newest page, for the line and the notice; the same query as the list on page one.
  const first = useMessages(eventId, 1, pageSize);
  const tally = useDeliveryTally(eventId, "message");
  const [composing, setComposing] = React.useState(false);
  const [opened, setOpened] = React.useState<{
    message: Message;
    problem: boolean;
  } | null>(null);

  const f = tallyFigures(tally.data);
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const latest = first.data?.items[0];
  const sending = first.data?.items.find((m) => m.status === "SENDING");
  const items = list.data?.items ?? [];

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">
            Messages
          </h2>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {list.data && total
              ? `${plural(total, "email")} sent · ${formatNumber(f.sent)} people reached · ${f.deliveryRate === null ? "no delivery reports yet" : `${f.deliveryRate}% delivered`}${latest ? ` · last ${relativeTime(latest.createdAt, now)}` : ""}`
              : "A one-off email to the guests, and the record of every email that went out: journey emails, timers and messages written here."}
          </p>
        </div>
        <Button onClick={() => setComposing(true)}>
          <PenLineIcon /> New message
        </Button>
      </header>

      {list.isError ? (
        <EmptyState
          tone="muted"
          title="Could not load the messages"
          description={`${list.error.message} Try reloading the page.`}
        />
      ) : list.isPending || tally.isPending ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[108px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-[280px] rounded-2xl" />
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Emails sent"
              value={formatNumber(total)}
              note={
                latest
                  ? `last ${relativeTime(latest.createdAt, now)}`
                  : "nothing sent yet"
              }
            />
            <StatTile
              label="People reached"
              value={formatNumber(f.sent)}
              note={
                f.notSent
                  ? `${formatNumber(f.failed)} refused · ${formatNumber(f.skipped)} without an address`
                  : f.sends
                    ? "every guest addressed"
                    : "nobody yet"
              }
            />
            <StatTile
              label="Delivered"
              value={f.deliveryRate === null ? "—" : `${f.deliveryRate}%`}
              note={
                f.known
                  ? `${formatNumber(f.delivered)} of ${formatNumber(f.known)} reported${f.awaiting ? ` · ${formatNumber(f.awaiting)} awaiting` : ""}`
                  : f.sent
                    ? "no delivery reports yet"
                    : "nothing sent yet"
              }
            />
            <StatTile
              label="Did not arrive"
              value={formatNumber(f.didntArrive)}
              note={
                f.didntArrive
                  ? `${formatNumber(f.bounced)} bounced · ${formatNumber(f.complained)} marked as spam`
                  : "none bounced"
              }
              scale={f.didntArrive ? "hero" : "sm"}
              action={
                f.didntArrive
                  ? {
                      label: "See who",
                      href: `/events/${eventId}/deliveries?kind=message&problem=1`,
                    }
                  : undefined
              }
              linkAs={Link}
            />
          </div>

          {tally.isError ? (
            <Notice tone="neutral" tag="Figures">
              Who each message reached could not be counted just now; the list
              below is complete. Reload the page to try again.
            </Notice>
          ) : null}
          {sending ? (
            <Notice tone="accent" tag="Sending">
              “{sending.subject || "A message"}” is going out:{" "}
              {formatNumber(sending.sentCount)} of{" "}
              {formatNumber(sending.recipients)} so far.
            </Notice>
          ) : latest && latest.failedCount > 0 ? (
            <Notice
              tone="caution"
              tag="Last message"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setOpened({ message: latest, problem: true })}
                >
                  See who
                </Button>
              }
            >
              “{latest.subject || "The last message"}” could not reach{" "}
              {formatNumber(latest.failedCount)} of{" "}
              {formatNumber(latest.recipients)} guests.
            </Notice>
          ) : null}

          <FigurePanel className="p-0">
            <div className="border-line-soft border-b px-4 py-3">
              <CardLabel
                right={
                  <span className="text-ink-3 text-[11.5px]">
                    journey emails, timers and messages written here
                  </span>
                }
              >
                Sent, newest first
              </CardLabel>
            </div>
            {items.length === 0 ? (
              <EmptyState
                icon={<MailIcon />}
                title="Nothing sent yet"
                description="Write to the guests with New message. Journey emails sent by hand or on their timers show here too, each with who it reached."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => setComposing(true)}
                  >
                    <PenLineIcon /> Write the first message
                  </Button>
                }
              />
            ) : (
              <>
                <div
                  className={cn(
                    "text-ink-3 hidden gap-3 px-4 py-2 font-mono text-[10px] tracking-[0.06em] uppercase sm:grid",
                    COLS,
                  )}
                >
                  <span className="w-8" />
                  <span>Email</span>
                  <span>To</span>
                  <span>Reached</span>
                  <span className="text-right">When</span>
                </div>
                <ul>
                  {items.map((m) => (
                    <Row
                      key={m.id}
                      m={m}
                      now={now}
                      onOpen={() => setOpened({ message: m, problem: false })}
                    />
                  ))}
                </ul>
                <div className="border-line-soft border-t px-4 py-2.5">
                  <Pager
                    page={page}
                    pageCount={pages}
                    total={total}
                    pageSize={pageSize}
                    noun={["email", "emails"]}
                    busy={list.isFetching}
                    onPage={setPage}
                    onPageSize={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                  />
                </div>
              </>
            )}
          </FigurePanel>
        </>
      )}

      <Composer
        eventId={eventId}
        open={composing}
        onOpenChange={setComposing}
      />
      {opened ? (
        <MessageDialog
          key={`${opened.message.id}:${opened.problem}`}
          eventId={eventId}
          message={opened.message}
          initialProblem={opened.problem}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </div>
  );
}
