"use client";

import * as React from "react";
import { Button, cn, toast } from "@moa/ui";

import { walkupCard, type OutcomeCardModel } from "../lib/outcome-copy";
import { useGateCatalog, useWalkup } from "../queries";
import { newRef, ROLE_LABEL, type GateContext, type WalkupBody } from "../schemas";
import { OutcomeCard } from "./outcome-card";
import { ShelfPicker, picksToStore, type ShelfPicks } from "./shelf-picker";

/** One form does three things: adds them to the list, checks them in, and sends their ticket if they gave an address. */
export function WalkupPanel({ gateKey, ctx, door }: { gateKey: string | null; ctx: GateContext; door: string }) {
  const [name, setName] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [role, setRole] = React.useState(ctx.walkup_roles[0] ?? "attendee");
  const [custom, setCustom] = React.useState<Record<string, string>>({});
  const [card, setCard] = React.useState<{ model: OutcomeCardModel; sameName: boolean } | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const ref = React.useRef(newRef());
  const walkup = useWalkup(gateKey, ctx.event.id);
  const [picks, setPicks] = React.useState<ShelfPicks>({});
  const catalog = useGateCatalog(gateKey, ctx.event.id, ctx.has_store);

  const submit = async (e?: React.FormEvent, confirmNew = false) => {
    e?.preventDefault();
    if (!name.trim()) {
      setFieldError("Their full name, please.");
      return;
    }
    setFieldError(null);
    const c = contact.trim();
    const isEmail = c.includes("@");
    const answered = Object.fromEntries(Object.entries(custom).filter(([, v]) => v.trim()));
    const body: WalkupBody = {
      name: name.trim(),
      ...(c ? (isEmail ? { email: c } : { phone: c }) : {}),
      role,
      ...(Object.keys(answered).length ? { custom_fields: answered } : {}),
      door,
      client_ref: ref.current,
      ...(confirmNew ? { confirm_new: true } : {}),
      ...(picksToStore(catalog.data, picks).length ? { store: picksToStore(catalog.data, picks) } : {}),
    };
    try {
      const res = await walkup.mutateAsync(body);
      const model = walkupCard(res, door, name.trim());
      if (model) setCard({ model, sameName: res.outcome === "DUPLICATE" && res.duplicate_by === "NAME" });
      if (res.outcome === "REGISTERED") {
        setName("");
        setContact("");
        setCustom({});
        setPicks({});
        ref.current = newRef();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not register them");
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      {card ? (
        <OutcomeCard card={card.model} onDismiss={() => setCard(null)}>
          <div className="flex flex-col gap-2 border-t border-current/20 px-4 py-3">
            {card.sameName ? (
              <Button type="button" className="h-12 w-full" onClick={() => (setCard(null), void submit(undefined, true))}>
                A different person — register them
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="h-12 w-full" onClick={() => setCard(null)}>
              {card.sameName ? "Back — I’ll check the list" : "Next walk-up"}
            </Button>
          </div>
        </OutcomeCard>
      ) : null}
      {walkup.isPending ? (
        <div className="rounded-xl border-[1.5px] border-primary bg-primary/10 px-5 py-7 text-center text-primary">
          <div className="text-[18px] font-semibold tracking-[-0.02em]">Registering them</div>
          <div className="mt-1.5 text-[13px] leading-[1.55] opacity-85">Making the record, the ticket and the check-in. Give it a second — don’t tap again.</div>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3">
          <div>
            <h2 className="text-[19px] font-semibold leading-[1.25] tracking-[-0.02em]">Register a walk-up</h2>
            <p className="mt-1 text-[13px] leading-[1.55] text-muted-foreground">Adds them to the list and checks them in. With an email, their ticket goes out too.{ctx.event.has_fee ? " Take the fee at the desk first — a walk-up is recorded as paid." : ""}</p>
          </div>
          <div>
            <label htmlFor="walk-name" className="mb-1.5 block text-[12px] text-muted-foreground">
              Name
            </label>
            <input id="walk-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Their full name" autoComplete="off" aria-invalid={!!fieldError} className={cn("h-12 w-full rounded-md border bg-muted/40 px-3 text-[15px]", fieldError && "border-destructive")} />
            {fieldError ? <p className="mt-1 text-[12.5px] text-destructive">{fieldError}</p> : null}
          </div>
          <div>
            <label htmlFor="walk-contact" className="mb-1.5 block text-[12px] text-muted-foreground">
              Email or mobile <span className="opacity-70">— optional</span>
            </label>
            <input id="walk-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Optional" autoComplete="off" inputMode="email" className="h-12 w-full rounded-md border bg-muted/40 px-3 text-[15px]" />
          </div>
          {ctx.walkup_roles.length > 1 ? (
            <div>
              <div className="mb-1.5 text-[12px] text-muted-foreground">Role</div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Role">
                {ctx.walkup_roles.map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)} className={cn("min-h-11 rounded-md border px-3 font-mono text-[12px] font-medium tracking-[0.05em]", role === r ? "border-primary bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground")}>
                    {(ROLE_LABEL[r] ?? r).toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {ctx.guest_fields.map((f) => (
            <div key={f.key}>
              <label htmlFor={`walk-${f.key}`} className="mb-1.5 block text-[12px] text-muted-foreground">
                {f.label} <span className="opacity-70">— optional at the door</span>
              </label>
              {f.options?.length ? (
                <select id={`walk-${f.key}`} value={custom[f.key] ?? ""} onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value }))} className="h-12 w-full rounded-md border bg-muted/40 px-3 text-[15px]">
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input id={`walk-${f.key}`} value={custom[f.key] ?? ""} onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value }))} className="h-12 w-full rounded-md border bg-muted/40 px-3 text-[15px]" />
              )}
            </div>
          ))}
          {ctx.has_store && catalog.data?.enabled ? <ShelfPicker catalog={catalog.data} picks={picks} onChange={setPicks} /> : null}
          <Button type="submit" className="mt-1 h-12 w-full">
            Register and check in
          </Button>
          <p className="text-[11.5px] leading-[1.5] text-muted-foreground">Anyone already on the list is caught and pointed at Find instead of making a second record.</p>
        </form>
      )}
    </div>
  );
}
