"use client";

import * as React from "react";
import { PlusIcon } from "lucide-react";
import { Card, CardContent, NativeSelect, Skeleton } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import {
  CHANNEL_TITLE,
  CREDIT_CHANNELS,
  packChanges,
  packProblems,
  rupeesText,
  toPackForm,
  toPackInput,
  type AdminPack,
  type CreditChannel,
  type PackForm,
} from "../credits";
import { useCreatePack, useCreditPacks, useUpdatePack } from "../queries";

/**
 * The message-credit packs clubs buy (Subscriptions → Credit packs): every
 * pack, off sale too, with what one message comes to and how many were sold.
 * An admin who manages money edits a pack's size, price, order and whether
 * it is on sale, or adds one. A pack is never deleted -- purchases point at
 * it -- so one no longer wanted is taken off sale. A club that already bought
 * keeps what it paid for; a new price applies to the next purchase.
 *
 * Shown nowhere on a backend from before prepaid credits.
 */
export function CreditPacksEditor() {
  const canMoney = useCan("manage_money");
  const q = useCreditPacks();
  const data = q.data;
  if (data === null) return null;

  return (
    <section className="flex flex-col gap-3" aria-label="Credit packs">
      <div>
        <h3 className="m-0 text-[17px] font-semibold">Message credit packs</h3>
        <span className="text-[12.5px] text-ink-3">
          Clubs buy these once, by Razorpay, and use them after their plan&apos;s monthly allowance.
          {data ? ` Credits last ${data.validity_months} months. Prices ${data.prices_include_gst ? "include" : "are before"} GST, as plan prices do.` : ""}
        </span>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {q.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : q.isError || !data ? (
            <p className="text-muted-foreground text-sm">Could not load the packs.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]" aria-label="Packs">
                  <thead className="text-muted-foreground text-xs">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Channel</th>
                      <th className="py-1.5 pr-3 font-medium">Messages</th>
                      <th className="py-1.5 pr-3 font-medium">Price (₹)</th>
                      <th className="py-1.5 pr-3 font-medium">Each</th>
                      <th className="py-1.5 pr-3 font-medium">On sale</th>
                      <th className="py-1.5 pr-3 font-medium">Order</th>
                      <th className="py-1.5 pr-3 font-medium">Sold</th>
                      <th className="py-1.5 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.packs.map((pack) => (
                      // Keyed by what is saved: a save starts the row again from it.
                      <PackRow key={`${pack.id}:${pack.updated_at ?? ""}:${pack.quantity}:${pack.price_paise}:${pack.active}:${pack.sort_order}`} pack={pack} canEdit={canMoney} />
                    ))}
                  </tbody>
                </table>
              </div>
              {canMoney ? <NewPack /> : <span className="text-muted-foreground text-xs">Only admins who manage money can change the packs.</span>}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function each(form: PackForm): string {
  const q = Number(form.quantity);
  const paise = Math.round(Number.parseFloat(form.price) * 100);
  if (!q || !Number.isFinite(paise)) return "—";
  return rupeesText(Math.round(paise / q));
}

function PackRow({ pack, canEdit }: { pack: AdminPack; canEdit: boolean }) {
  const update = useUpdatePack();
  const [form, setForm] = React.useState<PackForm>(() => toPackForm(pack));
  const problems = packProblems(form);
  const bad = Object.keys(problems).length > 0;
  const changes = bad ? {} : packChanges(pack, form);
  const dirty = Object.keys(changes).length > 0;
  const label = `${CHANNEL_TITLE[pack.channel]} pack ${pack.id}`;
  return (
    <tr className="border-t align-top" aria-label={label}>
      <td className="py-1.5 pr-3">{CHANNEL_TITLE[pack.channel]}</td>
      <td className="py-1.5 pr-3">
        <input aria-label={`${label}: messages`} className="input input-sm w-24" inputMode="numeric" value={form.quantity} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
        {problems.quantity ? <span className="text-refuse block text-xs">{problems.quantity}</span> : null}
      </td>
      <td className="py-1.5 pr-3">
        <input aria-label={`${label}: price`} className="input input-sm w-24" inputMode="decimal" value={form.price} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
        {problems.price ? <span className="text-refuse block text-xs">{problems.price}</span> : null}
      </td>
      <td className="text-muted-foreground py-1.5 pr-3 tabular-nums">{each(form)}</td>
      <td className="py-1.5 pr-3">
        <input type="checkbox" aria-label={`${label}: on sale`} checked={form.active} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
      </td>
      <td className="py-1.5 pr-3">
        <input aria-label={`${label}: order`} className="input input-sm w-16" inputMode="numeric" value={form.sortOrder} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
      </td>
      <td className="py-1.5 pr-3 tabular-nums">{pack.sold.toLocaleString("en-IN")}</td>
      <td className="py-1.5">
        {canEdit ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled={!dirty || update.isPending} onClick={() => update.mutate({ id: pack.id, changes })}>
            Save
          </button>
        ) : null}
      </td>
    </tr>
  );
}

const BLANK: PackForm & { channel: CreditChannel } = { channel: "email", quantity: "", price: "", active: true, sortOrder: "0" };

function NewPack() {
  const create = useCreatePack();
  const [form, setForm] = React.useState(BLANK);
  const [tried, setTried] = React.useState(false);
  const problems = packProblems(form);
  const submit = () => {
    setTried(true);
    if (Object.keys(problems).length) return;
    create.mutate(
      { channel: form.channel, ...toPackInput(form) },
      {
        onSuccess: () => {
          setForm(BLANK);
          setTried(false);
        },
      },
    );
  };
  const show = (key: keyof PackForm) => (tried && problems[key] ? <span className="text-refuse text-xs">{problems[key]}</span> : null);
  return (
    <div className="flex flex-col gap-2.5 border-t pt-3" role="group" aria-label="Add a pack">
      <span className="text-sm font-medium">Add a pack</span>
      <div className="grid gap-2.5 sm:grid-cols-4">
        <div className="field">
          <label htmlFor="new-pack-channel">Channel</label>
          <NativeSelect id="new-pack-channel" value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as CreditChannel }))}>
            {CREDIT_CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {CHANNEL_TITLE[ch]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="field">
          <label htmlFor="new-pack-quantity">Messages</label>
          <input id="new-pack-quantity" className="input" inputMode="numeric" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          {show("quantity")}
        </div>
        <div className="field">
          <label htmlFor="new-pack-price">Price (₹)</label>
          <input id="new-pack-price" className="input" inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
          {show("price")}
        </div>
        <div className="field">
          <label htmlFor="new-pack-order">Order</label>
          <input id="new-pack-order" className="input" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
          {show("sortOrder")}
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> On sale now
      </label>
      <div>
        <button type="button" className="btn btn-primary btn-sm" disabled={create.isPending} onClick={submit}>
          <PlusIcon className="size-3.5" /> Add pack
        </button>
      </div>
    </div>
  );
}
