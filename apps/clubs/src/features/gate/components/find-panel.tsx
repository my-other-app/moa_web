"use client";

import * as React from "react";
import { Button, cn, toast } from "@moa/ui";
import { formatDateTime } from "@moa/app-kit";

import { outcomeCard, type OutcomeCardModel } from "../lib/outcome-copy";
import { useCheckInByHand, useGuestSearch } from "../queries";
import { ROLE_LABEL, type GateContext } from "../schemas";
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
    <div className="flex flex-col gap-3.5">
      {card ? <OutcomeCard card={card} onDismiss={() => setCard(null)} /> : null}
      <div>
        <label htmlFor="gate-find" className="mb-1.5 block font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Name, email or ticket
        </label>
        <input id="gate-find" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing a name" autoComplete="off" className="h-12 w-full rounded-md border bg-muted/40 px-3 text-[15px]" />
      </div>
      {settled.length < 2 ? (
        <p className="text-[12.5px] text-muted-foreground">Two letters is enough. Checking someone in here is recorded as by hand at {door}.</p>
      ) : results.data?.length ? (
        <ul className="divide-y rounded-xl border">
          {results.data.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{r.name}</div>
                <div className="truncate font-mono text-[10.5px] text-muted-foreground">
                  {r.ticket_id} · {ROLE_LABEL[r.role] ?? r.role}
                  {r.email ? ` · ${r.email}` : ""}
                </div>
              </div>
              {r.checked_in_at ? (
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">IN · {formatDateTime(r.checked_in_at)}</span>
              ) : (
                <Button type="button" size="sm" className={cn("h-10")} disabled={byHand.isPending || !r.is_paid} onClick={() => void admit(r.id)}>
                  {r.is_paid ? "Check in" : "Not paid"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">Nobody on the list matches. If they are at the door with no record, register them under Walk-up.</p>
      )}
    </div>
  );
}
