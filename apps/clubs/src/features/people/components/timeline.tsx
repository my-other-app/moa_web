"use client";

import * as React from "react";
import {
  AwardIcon,
  CheckIcon,
  CircleIcon,
  CreditCardIcon,
  DoorOpenIcon,
  MailIcon,
  MessageSquareIcon,
  PencilIcon,
  PrinterIcon,
  ShoppingBagIcon,
  TicketIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { formatDateTime, relativeTime } from "@moa/app-kit";
import { Button, cn } from "@moa/ui";

import type { Tone, TimelineRow } from "../schemas";
import { TONE_CLASS } from "../words";

/** More rows than this are folded behind "Show all". */
export const SHOWN = 30;

/** An icon for what happened, from the kind the server names it by. */
const ICON_CLASS = "size-3.5";
const ICONS: Array<[RegExp, React.ReactElement]> = [
  [/print/, <PrinterIcon key="i" className={ICON_CLASS} />],
  [/check/, <DoorOpenIcon key="i" className={ICON_CLASS} />],
  [/pay|refund|invoice/, <CreditCardIcon key="i" className={ICON_CLASS} />],
  [/certificate/, <AwardIcon key="i" className={ICON_CLASS} />],
  [/merch|swag|collect/, <ShoppingBagIcon key="i" className={ICON_CLASS} />],
  [/ticket/, <TicketIcon key="i" className={ICON_CLASS} />],
  [/mail|deliver|remind|sent|bounce|whatsapp/, <MailIcon key="i" className={ICON_CLASS} />],
  [/declin|remov|revok|cancel|withdr|lapse|expire/, <XIcon key="i" className={ICON_CLASS} />],
  [/confirm|approv|offer|claim|restor|issued/, <CheckIcon key="i" className={ICON_CLASS} />],
  [/regist|submit|import/, <UserPlusIcon key="i" className={ICON_CLASS} />],
  [/edit|correct|update/, <PencilIcon key="i" className={ICON_CLASS} />],
  [/answer|ask|missing|feedback|message/, <MessageSquareIcon key="i" className={ICON_CLASS} />],
];
const FALLBACK = <CircleIcon className={ICON_CLASS} />;

/** The icon for what happened, from the kind the server names it by. */
function KindIcon({ kind }: { kind: string }) {
  return ICONS.find(([re]) => re.test(kind.toLowerCase()))?.[1] ?? FALLBACK;
}

const time = (at: string) => new Date(at).getTime() || 0;

/** Newest first, whatever order the server sent them in. */
export const newestFirst = (rows: readonly TimelineRow[]) => [...rows].sort((a, b) => time(b.at) - time(a.at));

function Row({ r, now, last }: { r: TimelineRow; now: Date; last: boolean }) {
  const tone: Tone = r.tone;
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0" data-kind={r.kind} data-tone={tone}>
      {last ? null : <span aria-hidden="true" className="bg-line-soft absolute top-7 bottom-0 left-[13px] w-px" />}
      <span aria-hidden="true" className={cn("relative z-[1] grid size-7 shrink-0 place-items-center rounded-full", TONE_CLASS[tone])}>
        <KindIcon kind={r.kind} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-ink m-0 text-[13px] leading-[1.4] font-medium [overflow-wrap:anywhere]">{r.title}</p>
        {r.detail ? <p className="text-ink-2 m-0 mt-0.5 text-[12.5px] leading-[1.45] [overflow-wrap:anywhere]">{r.detail}</p> : null}
        <p className="text-ink-3 m-0 mt-0.5 text-[11.5px]">
          <time dateTime={r.at} title={formatDateTime(r.at)}>
            {relativeTime(r.at, now)}
          </time>
          <span aria-hidden="true"> · </span>
          <span>{formatDateTime(r.at)}</span>
          {r.by ? <span> · {r.by}</span> : null}
        </p>
      </div>
    </li>
  );
}

/** Everything that happened to them, newest first, with an icon and a colour for each kind. */
export function Timeline({ rows, truncated }: { rows: readonly TimelineRow[]; truncated: boolean }) {
  const [all, setAll] = React.useState(false);
  const sorted = React.useMemo(() => newestFirst(rows), [rows]);
  const [now] = React.useState(() => new Date());
  if (!sorted.length) return <p className="text-ink-3 m-0 text-[12.5px]">Nothing has happened yet.</p>;
  const shown = all ? sorted : sorted.slice(0, SHOWN);
  return (
    <div>
      <ol className="m-0 list-none p-0" aria-label="Timeline, newest first">
        {shown.map((r, i) => (
          <Row key={`${r.at}-${r.kind}-${i}`} r={r} now={now} last={i === shown.length - 1} />
        ))}
      </ol>
      {sorted.length > SHOWN ? (
        <Button type="button" variant="secondary" size="sm" className="mt-3" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${sorted.length}`}
        </Button>
      ) : null}
      {truncated ? <p className="text-ink-3 mt-2 mb-0 text-[11.5px]">Only the latest {sorted.length} are shown.</p> : null}
    </div>
  );
}
