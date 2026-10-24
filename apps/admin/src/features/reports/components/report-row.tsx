"use client";

import * as React from "react";
import Link from "next/link";
import { CheckIcon, EyeOffIcon, ShieldBanIcon, Trash2Icon } from "lucide-react";
import { PersonAvatar, formatDateTime, relativeTime, type Picture } from "@moa/app-kit";
import { Button, cn } from "@moa/ui";

import {
  canRemoveContent,
  canSuspendAuthor,
  hiddenFromUsers,
  reasonLabel,
  reasonTone,
  reportCountText,
  resolutionLabel,
  targetLabel,
  type ReasonTone,
  type Report,
  type Resolution,
} from "../schemas";
import { ResolveDialog } from "./resolve-dialog";

const TONE: Record<ReasonTone, string> = {
  refuse: "bg-refuse-soft text-refuse",
  caution: "bg-caution-soft text-caution",
  info: "bg-info-soft text-info",
  neutral: "bg-sunken text-ink-2",
};

/** The reason, in its colour: harm to a person red, spam amber, a false claim blue, anything else grey. */
export function ReasonChip({ reason, className }: { reason: string; className?: string }) {
  const tone = reasonTone(reason);
  return (
    <span data-tone={tone} className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap", TONE[tone], className)}>
      {reasonLabel(reason)}
    </span>
  );
}

/** Whose it is: a comment's writer, the club account a thread was posted from, the account a person or club is. */
const AUTHOR_WORD: Record<string, string> = { comment: "By", thread: "Posted by", user: "Account", club: "Account" };

function PersonLink({ person }: { person: { id: number; name: string; avatar?: Picture | null } }) {
  return (
    <Link
      href={`/users/${person.id}`}
      className="text-ink-2 hover:text-ink inline-flex items-center gap-1 align-bottom underline-offset-2 hover:underline"
    >
      <PersonAvatar name={person.name} avatar={person.avatar} className="size-[18px]" fallbackClassName="text-[8px]" />
      {person.name || `User ${person.id}`}
    </Link>
  );
}

/** Moderate and above: dismiss, take the thread or comment down, or suspend whoever posted it. */
function ReportActions({ report }: { report: Report }) {
  const [action, setAction] = React.useState<Resolution | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      <Button size="xs" variant="secondary" onClick={() => setAction("dismiss")}>
        <CheckIcon /> Dismiss
      </Button>
      {canRemoveContent(report) ? (
        <Button size="xs" variant="secondary" danger onClick={() => setAction("remove_content")}>
          <Trash2Icon /> Remove
        </Button>
      ) : null}
      {canSuspendAuthor(report) ? (
        <Button size="xs" variant="secondary" danger onClick={() => setAction("suspend_author")}>
          <ShieldBanIcon /> Suspend author
        </Button>
      ) : null}
      {action ? <ResolveDialog report={report} action={action} onClose={() => setAction(null)} /> : null}
    </div>
  );
}

/**
 * One report: why, what (quoted as it stands), whose and in which club, who
 * reported it and what they added, how many people have, and when. Open,
 * it carries the actions for a role that may take them; resolved, what was
 * decided, when, and the note left with it.
 */
export function ReportRow({ report: r, now, canModerate }: { report: Report; now: Date; canModerate: boolean }) {
  const open = r.status === "open";
  const quoted = r.target_type === "thread" || r.target_type === "comment";
  return (
    <li data-report={r.id} className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <ReasonChip reason={r.reason} />
        <span className="tag tag-neutral">{targetLabel(r.target_type)}</span>
        {r.report_count > 0 ? <span className="text-ink-2 px-1 text-[12px] font-medium tabular-nums">{reportCountText(r.report_count)}</span> : null}
        {hiddenFromUsers(r) ? (
          <span className="tag bg-caution-soft text-caution gap-1" title={`Reported by ${r.report_count} people: hidden from everyone but its author until this is decided.`}>
            <EyeOffIcon className="size-3" aria-hidden="true" /> Hidden from users
          </span>
        ) : null}
        {r.target_removed ? (
          <span className="tag bg-refuse-soft text-refuse gap-1">
            <Trash2Icon className="size-3" aria-hidden="true" /> Removed
          </span>
        ) : null}
        <time dateTime={r.created_at} title={formatDateTime(r.created_at)} className="text-ink-3 ml-auto text-[12px] whitespace-nowrap">
          {relativeTime(r.created_at, now)}
        </time>
      </div>

      <blockquote className={cn("border-line text-ink m-0 line-clamp-4 border-l-2 pl-3 text-[13.5px] leading-[1.5] whitespace-pre-line", r.target_removed && "text-ink-2")}>
        {r.target_preview ? (quoted ? `“${r.target_preview}”` : r.target_preview) : <span className="text-ink-3 italic">Nothing to show</span>}
      </blockquote>

      <div className="text-ink-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
        {r.target_author ? (
          <span>
            {AUTHOR_WORD[r.target_type] ?? "By"} <PersonLink person={r.target_author} />
          </span>
        ) : null}
        {r.target_author && r.club ? <span aria-hidden="true">·</span> : null}
        {r.club ? (
          <span>
            {r.target_type === "club" ? "Club" : "In"}{" "}
            <Link href={`/clubs/${r.club.id}`} className="text-ink-2 hover:text-ink underline-offset-2 hover:underline">
              {r.club.name}
            </Link>
          </span>
        ) : null}
      </div>

      <p className="text-ink-2 m-0 text-[12.5px]">
        Reported by {r.reporter ? <PersonLink person={r.reporter} /> : "someone"}
        {r.note ? (
          <>
            : <q className="text-ink">{r.note}</q>
          </>
        ) : null}
      </p>

      {!open && r.resolution ? (
        <div className="bg-sunken text-ink-2 flex flex-col gap-0.5 rounded-[10px] px-3 py-2 text-[12.5px]">
          <span>
            <span className="text-ink font-semibold">{resolutionLabel(r.resolution)}</span>
            {r.resolved_at ? (
              <>
                {" · "}
                <time dateTime={r.resolved_at}>{formatDateTime(r.resolved_at)}</time>
              </>
            ) : null}
          </span>
          {r.resolution_note ? <q className="text-ink">{r.resolution_note}</q> : null}
        </div>
      ) : null}

      {open && canModerate ? <ReportActions report={r} /> : null}
    </li>
  );
}
