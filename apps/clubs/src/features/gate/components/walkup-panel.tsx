"use client";

import * as React from "react";
import { Button, FigurePanel, NativeSelect, cn, toast } from "@moa/ui";
import { IndianRupeeIcon, UserPlusIcon } from "lucide-react";

import { walkupCard, type OutcomeCardModel } from "../lib/outcome-copy";
import { useGateCatalog, useWalkup } from "../queries";
import { newRef, ROLE_LABEL, type GateContext, type WalkupBody } from "../schemas";
import { DOOR_FIELD, DOOR_LABEL, DoorSpinner, TONE_SOFT, TouchChoice } from "./door-kit";
import { OutcomeCard } from "./outcome-card";
import { ShelfPicker, picksToStore, type ShelfPicks } from "./shelf-picker";

const optional = <span className="text-ink-3 font-normal">— optional</span>;

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
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
      {card ? (
        <OutcomeCard card={card.model} onDismiss={() => setCard(null)}>
          <div className="border-line-soft flex flex-col gap-2 border-t px-4 py-3">
            {card.sameName ? (
              <Button size="lg" type="button" className="w-full" onClick={() => (setCard(null), void submit(undefined, true))}>
                A different person — register them
              </Button>
            ) : null}
            <Button size="lg" type="button" variant="secondary" className="w-full" onClick={() => setCard(null)}>
              {card.sameName ? "Back — I’ll check the list" : "Next walk-up"}
            </Button>
          </div>
        </OutcomeCard>
      ) : null}
      {walkup.isPending ? (
        <div role="status" className={cn("rounded-[var(--radius-panel)] border px-5 py-8 text-center", TONE_SOFT.info)}>
          <DoorSpinner className="size-6" />
          <p className="mt-3 text-[19px] font-semibold tracking-[-0.02em]">Registering them</p>
          <p className="text-ink-2 mt-1.5 text-[13.5px] leading-[1.55]">Making the record, the ticket and the check-in. Give it a second — don’t tap again.</p>
        </div>
      ) : (
        <FigurePanel className="p-4 sm:p-5">
          <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
            <div>
              <h2 className="text-ink text-[19px] leading-[1.25] font-semibold tracking-[-0.02em]">Register a walk-up</h2>
              <p className="text-ink-2 mt-1 text-[13.5px] leading-[1.55]">Adds them to the list and checks them in. With an email, their ticket goes out too.</p>
            </div>
            {ctx.event.has_fee ? (
              <div className={cn("flex items-start gap-2.5 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-[13px] leading-[1.5]", TONE_SOFT.caution)}>
                <IndianRupeeIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <p>
                  <strong className="font-semibold">Take the fee at the desk first.</strong> <span className="text-ink-2">A walk-up is recorded as paid.</span>
                </p>
              </div>
            ) : null}
            <div>
              <label htmlFor="walk-name" className={DOOR_LABEL}>
                Name
              </label>
              <input id="walk-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Their full name" autoComplete="off" aria-invalid={!!fieldError} aria-describedby={fieldError ? "walk-name-error" : undefined} className={cn(DOOR_FIELD, fieldError && "border-refuse")} />
              {fieldError ? (
                <p id="walk-name-error" className="text-refuse mt-1.5 text-[13px]">
                  {fieldError}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="walk-contact" className={DOOR_LABEL}>
                Email or mobile {optional}
              </label>
              <input id="walk-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Optional" autoComplete="off" inputMode="email" className={DOOR_FIELD} />
            </div>
            {ctx.walkup_roles.length > 1 ? (
              <div>
                <p className={DOOR_LABEL}>Role</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Role">
                  {ctx.walkup_roles.map((r) => (
                    <TouchChoice key={r} checked={role === r} onClick={() => setRole(r)}>
                      {ROLE_LABEL[r] ?? r}
                    </TouchChoice>
                  ))}
                </div>
              </div>
            ) : null}
            {ctx.guest_fields.map((f) => (
              <div key={f.key}>
                <label htmlFor={`walk-${f.key}`} className={DOOR_LABEL}>
                  {f.label} <span className="text-ink-3 font-normal">— optional at the door</span>
                </label>
                {f.options?.length ? (
                  <NativeSelect id={`walk-${f.key}`} value={custom[f.key] ?? ""} onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value }))} className="h-11 text-[16px]">
                    <option value="">—</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <input id={`walk-${f.key}`} value={custom[f.key] ?? ""} onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value }))} className={DOOR_FIELD} />
                )}
              </div>
            ))}
            {ctx.has_store && catalog.data?.enabled ? <ShelfPicker catalog={catalog.data} picks={picks} onChange={setPicks} /> : null}
            <Button type="submit" className="w-full" size="lg">
              <UserPlusIcon /> Register and check in
            </Button>
            <p className="text-ink-3 text-[12.5px] leading-[1.5]">Anyone already on the list is caught and pointed at Find instead of making a second record.</p>
          </form>
        </FigurePanel>
      )}
    </div>
  );
}
