"use client";

import * as React from "react";
import { Button, toast } from "@moa/ui";
import { CheckIcon, PrinterIcon, SearchIcon, UserPlusIcon } from "lucide-react";

import { PrintFrame, cardPdfUrl } from "@/features/idcards";
import { formatDateTime } from "@moa/app-kit";

import { outcomeCard, type OutcomeCardModel } from "../lib/outcome-copy";
import { useCheckInByHand, useGuestSearch } from "../queries";
import { ROLE_LABEL, type GateContext } from "../schemas";
import { DOOR_LABEL, DoorSpinner } from "./door-kit";
import { OutcomeCard } from "./outcome-card";

/** A dead phone, a ticket left at home, a name read off a list: find them, check them in by hand. */
export function FindPanel({ gateKey, ctx, door }: { gateKey: string | null; ctx: GateContext; door: string }) {
  const [q, setQ] = React.useState("");
  const [settled, setSettled] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setSettled(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const results = useGuestSearch(gateKey, ctx.event.id, settled);
  const byHand = useCheckInByHand(gateKey, ctx.event.id);
  const [card, setCard] = React.useState<OutcomeCardModel | null>(null);
  const [printing, setPrinting] = React.useState<string | null>(null);
  const mayPrint = (printedAt: string | null | undefined) => !printedAt || ctx.event.reprint_policy === "anyone" || (ctx.event.reprint_policy === "organiser" && ctx.permissions.full);
  const admit = async (id: string) => {
    try {
      const res = await byHand.mutateAsync({ registrationId: id, door });
      setCard(outcomeCard(res, door));
      void results.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check them in");
    }
  };
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
      {printing ? <PrintFrame key={printing} url={printing} onDone={() => setTimeout(() => setPrinting(null), 4000)} /> : null}
      {card ? <OutcomeCard card={card} onDismiss={() => setCard(null)} /> : null}
      <div>
        <label htmlFor="gate-find" className={DOOR_LABEL}>
          Name, email or ticket
        </label>
        <div className="search h-11">
          <SearchIcon aria-hidden="true" />
          <input id="gate-find" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing a name" autoComplete="off" className="text-[16px]" />
        </div>
      </div>
      {settled.length < 2 ? (
        <p className="text-ink-3 text-[13px] leading-[1.55]">Two letters is enough. Checking someone in here is recorded as by hand at {door}.</p>
      ) : !results.data && results.isFetching ? (
        <p className="text-ink-2 flex items-center gap-2 text-[13px]">
          <DoorSpinner className="size-3.5" /> Looking through the list…
        </p>
      ) : results.data?.length ? (
        <ul className="bg-surface border-line-soft divide-line-soft shadow-card divide-y overflow-hidden rounded-[var(--radius-card)] border">
          {results.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-[180px]">
                <div className="text-ink truncate text-[15px] font-medium">{r.name}</div>
                <div className="text-ink-3 truncate font-mono text-[11px]">
                  {r.admission_no ? `${r.admission_no} · ` : ""}
                  {r.ticket_id} · {ROLE_LABEL[r.role] ?? r.role}
                  {r.email ? ` · ${r.email}` : ""}
                </div>
              </div>
              {r.checked_in_at ? (
                <div className="flex items-center gap-2">
                  <span className="bg-admit-soft text-admit inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium">
                    <CheckIcon aria-hidden="true" className="size-3.5" />
                    In · {formatDateTime(r.checked_in_at)}
                  </span>
                  {mayPrint(r.badge_printed_at) ? (
                    <Button type="button" size="lg" variant="secondary" aria-label={`Print card for ${r.name}`} onClick={() => setPrinting(cardPdfUrl(ctx.event.id, r.id, { source: "manual", record: true, door, key: gateKey }))}>
                      <PrinterIcon /> Print
                    </Button>
                  ) : null}
                </div>
              ) : r.is_paid ? (
                <Button type="button" size="lg" disabled={byHand.isPending} onClick={() => void admit(r.id)}>
                  Check in
                </Button>
              ) : (
                <span className="bg-refuse-soft text-refuse rounded-full px-2.5 py-1 text-[12px] font-medium">Not paid</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-line text-ink-2 flex items-start gap-3 rounded-[var(--radius-card)] border border-dashed px-4 py-3.5 text-[13px] leading-[1.55]">
          <UserPlusIcon aria-hidden="true" className="text-ink-3 mt-0.5 size-4 shrink-0" />
          <p>Nobody on the list matches. If they are at the door with no record, register them under Walk-up.</p>
        </div>
      )}
    </div>
  );
}
