"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClockIcon, CopyIcon, EyeIcon, EyeOffIcon, MailIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { formatDate, formatDateTime, formatNumber, relativeTime } from "@moa/app-kit";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FigurePanel,
  Notice,
  ProgressBar,
  Skeleton,
  StatTile,
  cn,
} from "@moa/ui";

import { useCreateTemplate, useDeleteTemplate, useDuplicateTemplate, useLibraryOverview, usePreview } from "../queries";
import { JOURNEY_STAGES, STAGE_META, audienceSummary, blankTemplate, triggerSummary, type LibraryOverview, type LibraryTemplate } from "../schemas";

/**
 * Emails, rebuilt around what the library is for: every event's emails
 * start here, and this is where a club learns whether they work.
 *
 * One line and four figures on the month — messages, people reached,
 * delivered, opened — then what goes out next by itself and the last few
 * sends. The four journey emails as cards that say how each goes out, how
 * many events carry it, and what it did; then the custom ones. Editing
 * stays on its own page.
 */
const STAGE_ORDER = JOURNEY_STAGES as readonly string[];

function Queue({ o }: { o: LibraryOverview }) {
  return (
    <FigurePanel className="p-4">
      <CardLabel right={<span className="text-ink-3 font-mono text-[11px]">by itself, on its timer</span>}>What goes out next</CardLabel>
      {o.queue.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">Nothing is timed to go out. A pre-event or reminder email on an upcoming event appears here with its moment.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {o.queue.map((q) => (
            <li key={q.template_id} className="flex items-center gap-3 text-[12.5px]">
              <ClockIcon className="text-ink-3 size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <Link href={`/events/${q.event.id}/emails/${q.template_id}`} className="text-ink block truncate hover:underline">
                  {q.label} · {q.name}
                </Link>
                <span className="text-ink-3 block truncate text-[11.5px]">
                  {q.event.name} · to {audienceSummary({ who: q.audience as "ALL", roles: [] })}
                </span>
              </span>
              <span className="text-ink-2 shrink-0 font-mono text-[11px] tabular-nums" title={formatDateTime(q.due_at)}>
                {formatDate(q.due_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </FigurePanel>
  );
}

function Recent({ o }: { o: LibraryOverview }) {
  return (
    <FigurePanel className="p-4">
      <CardLabel right={<span className="text-ink-3 font-mono text-[11px]">{formatNumber(o.all_time.messages)} all time</span>}>Last sent</CardLabel>
      {o.recent.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">Nothing sent yet. The invite goes with every ticket once it is on; the rest go on their timers or by hand from an event.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {o.recent.map((m) => {
            const known = m.delivered + m.bounced;
            const line = known > 0 ? `${m.delivered} delivered${m.read ? ` · ${m.read} opened` : ""}${m.bounced ? ` · ${m.bounced} bounced` : ""}` : `${m.sent} sent${m.failed ? ` · ${m.failed} failed` : ""}`;
            return (
              <li key={m.id} className="flex items-center gap-3 text-[12.5px]">
                <MailIcon className="text-ink-3 size-3.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <Link href={`/events/${m.event.id}/messages`} className="text-ink block truncate hover:underline">
                    {m.subject || "(no subject)"}
                  </Link>
                  <span className="text-ink-3 block truncate text-[11.5px]">
                    {m.event.name} · {m.recipients} {m.recipients === 1 ? "person" : "people"} · {line}
                    {m.scheduled ? " · on its timer" : ""}
                  </span>
                </span>
                <span className="text-ink-3 shrink-0 font-mono text-[11px]" title={formatDateTime(m.created_at)}>
                  {relativeTime(m.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </FigurePanel>
  );
}

/** The email as a guest would see it, with sample values, rendered when asked for. */
function Preview({ t, open }: { t: LibraryTemplate; open: boolean }) {
  const preview = usePreview({ kind: "library" }, { subject: t.subject, design: t.design }, open);
  if (!open) return null;
  return (
    <div className="border-line-soft mt-3 overflow-hidden rounded-xl border">
      <div className="bg-sunken text-ink-2 flex items-center justify-between px-3 py-1.5 text-[11.5px]">
        <span className="truncate">
          <span className="text-ink-3">Subject:</span> {preview.data?.subject ?? t.subject}
        </span>
        <span className="text-ink-3 shrink-0 font-mono text-[10px]">sample values</span>
      </div>
      {preview.isPending ? <Skeleton className="h-72 rounded-none" /> : preview.isError ? <p className="text-refuse px-3 py-4 text-[12.5px]">Could not render this email.</p> : <iframe title={`Preview of ${t.name}`} sandbox="" srcDoc={preview.data?.html ?? ""} className="h-[26rem] w-full bg-white" />}
    </div>
  );
}

function StageCard({ t }: { t: LibraryTemplate }) {
  const [open, setOpen] = React.useState(false);
  const u = t.usage;
  const meta = STAGE_META[t.stage];
  return (
    <FigurePanel className={cn("flex flex-col p-4", !t.enabled && "border-caution-line")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="eyebrow">{t.label}</span>
          <p className="text-ink mt-0.5 truncate text-[15px] font-semibold">{t.name}</p>
          <p className="text-ink-3 truncate text-[12px]">{t.subject}</p>
        </div>
        {!t.enabled ? <span className="text-caution shrink-0 font-mono text-[10px] tracking-[0.06em] uppercase">Off</span> : null}
      </div>
      <p className="text-ink-2 mt-2 text-[12.5px]">
        Goes out <span className="text-ink">{triggerSummary(t.trigger).toLowerCase()}</span> · to <span className="text-ink">{audienceSummary(t.audience).toLowerCase()}</span>
      </p>
      <p className="text-ink-3 mt-0.5 text-[12px]">{meta.note}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ["events", formatNumber(u.events), u.customised ? `${u.customised} changed it` : u.events ? "as written here" : "none yet"],
          ["sent to", formatNumber(u.recipients), u.sends ? `${formatNumber(u.sends)} ${u.sends === 1 ? "send" : "sends"}` : "nobody yet"],
          ["opened", u.open_rate === null || u.open_rate === undefined ? (u.delivery_rate === null || u.delivery_rate === undefined ? "—" : `${u.delivery_rate}%`) : `${u.open_rate}%`, u.open_rate === null || u.open_rate === undefined ? (u.delivery_rate === null || u.delivery_rate === undefined ? "no results yet" : "delivered") : `of ${formatNumber(u.recipients)}`],
        ].map(([label, value, sub]) => (
          <div key={label} className="bg-sunken rounded-xl px-2.5 py-2">
            <div className="text-ink font-mono text-[15px] font-semibold tabular-nums">{value}</div>
            <div className="text-ink-3 text-[10.5px] tracking-[0.04em] uppercase">{label}</div>
            <div className="text-ink-3 truncate text-[11px]">{sub}</div>
          </div>
        ))}
      </div>
      {u.bounced ? <p className="text-caution mt-2 text-[12px]">{u.bounced} bounced across its sends.</p> : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <span className="text-ink-3 text-[11.5px]">
          v{t.version} · edited {formatDate(t.updatedAt)}
          {u.last_sent_at ? ` · last sent ${relativeTime(u.last_sent_at)}` : ""}
        </span>
        <span className="flex gap-2">
          <button type="button" className="btn btn-ghost text-[12.5px]" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${open ? "Hide" : "Preview"} ${t.name}`}>
            {open ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />} {open ? "Hide" : "Preview"}
          </button>
          <Link href={`/emails/${t.id}`} className="btn btn-secondary text-[12.5px]">
            <PencilIcon className="size-3.5" /> Edit
          </Link>
        </span>
      </div>
      <Preview t={t} open={open} />
    </FigurePanel>
  );
}

function CustomRow({ t, onDuplicate, onDelete }: { t: LibraryTemplate; onDuplicate: () => void; onDelete: () => void }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  return (
    <li className="border-line-soft border-t px-4 py-3 first:border-t-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Link href={`/emails/${t.id}`} className="text-ink block truncate text-[13.5px] font-medium hover:underline">
            {t.name}
          </Link>
          <p className="text-ink-3 truncate text-[12px]">
            {t.subject} · {triggerSummary(t.trigger).toLowerCase()} · to {audienceSummary(t.audience).toLowerCase()}
          </p>
        </div>
        <span className="text-ink-3 hidden font-mono text-[11px] sm:block">
          {t.usage.events} {t.usage.events === 1 ? "event" : "events"} · sent to {formatNumber(t.usage.recipients)}
        </span>
        <button type="button" className="btn btn-ghost text-[12px]" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${open ? "Hide" : "Preview"} ${t.name}`}>
          {open ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="border-line bg-surface text-ink-2 hover:bg-sunken hover:text-ink grid size-8 place-items-center rounded-full border" aria-label={`Actions for ${t.name}`}>
              <MoreHorizontalIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => router.push(`/emails/${t.id}`)}>
              <PencilIcon /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <CopyIcon /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2Icon /> Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Preview t={t} open={open} />
    </li>
  );
}

export function EmailLibraryPage() {
  const router = useRouter();
  const scope = { kind: "library" as const };
  const overview = useLibraryOverview();
  const create = useCreateTemplate(scope);
  const duplicate = useDuplicateTemplate(scope);
  const remove = useDeleteTemplate(scope);
  const [deleting, setDeleting] = React.useState<LibraryTemplate | null>(null);
  const o = overview.data;
  const journey = (o?.templates ?? []).filter((t) => t.stage !== "CUSTOM").sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
  const custom = (o?.templates ?? []).filter((t) => t.stage === "CUSTOM");
  const f = o?.figures;
  const delta = (d: number | null | undefined) => (d ? `${d > 0 ? "+" : "−"}${formatNumber(Math.abs(d))} vs prior 30` : undefined);
  const trend = (d: number | null | undefined): "up" | "down" | "none" => (d ? (d > 0 ? "up" : "down") : "none");
  const off = o?.attention.disabled_stages ?? [];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Emails</h1>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {f ? `${f.messages} ${f.messages === 1 ? "message" : "messages"} in 30 days · ${formatNumber(f.recipients)} people · ${f.delivery_rate === null || f.delivery_rate === undefined ? "nothing delivered yet" : `${f.delivery_rate}% delivered`}${f.open_rate !== null && f.open_rate !== undefined ? ` · ${f.open_rate}% opened` : ""}` : "Every event's emails start from this library."}
          </p>
        </div>
        <button type="button" className="btn btn-primary" disabled={create.isPending} onClick={() => create.mutate({ fields: blankTemplate() }, { onSuccess: (t) => router.push(`/emails/${t.id}`) })}>
          <PlusIcon className="size-4" /> New email
        </button>
      </div>

      {overview.isPending ? (
        <Skeleton className="h-[108px]" />
      ) : overview.isError ? (
        <EmptyState tone="muted" title="Could not load the library" description={overview.error.message} />
      ) : o && f ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Messages, 30 days" value={formatNumber(f.messages)} note={f.messages === 0 ? "nothing sent this month" : "by hand and on their timers"} delta={delta(o.delta?.messages)} trend={trend(o.delta?.messages)} />
            <StatTile label="People reached" value={formatNumber(f.recipients)} note={f.failed ? `${f.failed} could not be sent` : "every guest it was addressed to"} delta={delta(o.delta?.recipients)} trend={trend(o.delta?.recipients)} />
            <StatTile label="Delivered" value={f.delivery_rate === null || f.delivery_rate === undefined ? "—" : `${f.delivery_rate}%`} note={f.bounced ? `${f.bounced} bounced` : f.delivered ? "none bounced" : "no results yet"} scale={f.bounced > 0 && f.bounced >= Math.max(1, f.recipients) / 10 ? "hero" : "sm"} />
            <StatTile label="Opened" value={f.open_rate === null || f.open_rate === undefined ? "—" : `${f.open_rate}%`} note={f.open_rate === null || f.open_rate === undefined ? "needs delivery reports" : "of those delivered"} />
          </div>

          {off.length > 0 ? (
            <Notice tone="caution" tag="Journey" action={<Link href={`/emails/${journey.find((t) => t.stage === off[0])?.id ?? ""}`} className="btn btn-secondary text-[12px]">Open it</Link>}>
              {off.map((s) => STAGE_META[s as "INVITE"].label).join(", ")} {off.length === 1 ? "is" : "are"} switched off in the library, so new events start without {off.length === 1 ? "it" : "them"}.
            </Notice>
          ) : f.bounced > 0 && f.bounced >= Math.max(1, f.recipients) / 10 ? (
            <Notice tone="caution" tag="Bounces">
              {f.bounced} of {formatNumber(f.recipients)} addresses bounced this month. Guests typed them at sign-up; the attendees page shows who.
            </Notice>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <Queue o={o} />
            <Recent o={o} />
          </div>

          <section>
            <h2 className="eyebrow mb-2">The journey</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {journey.map((t) => (
                <StageCard key={t.id} t={t} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="eyebrow mb-2">Other emails</h2>
            {custom.length === 0 ? (
              <p className="text-ink-3 text-[12.5px]">No custom emails in the library yet. Make one on an event and choose “Make this the club&apos;s default”, or start one with New email.</p>
            ) : (
              <FigurePanel className="p-0">
                <ul>
                  {custom.map((t) => (
                    <CustomRow key={t.id} t={t} onDuplicate={() => duplicate.mutate(t.id)} onDelete={() => setDeleting(t)} />
                  ))}
                </ul>
              </FigurePanel>
            )}
          </section>
        </>
      ) : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
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
