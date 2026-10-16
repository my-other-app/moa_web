"use client";

import * as React from "react";
import { Button, EmptyState, cn, toast } from "@moa/ui";

import {
  cameraProblem,
  startScanner,
  type GateContext,
  type Scanner,
} from "@/features/gate";
import { searchGuests } from "@/features/gate/api";
import {
  useGateHandOver,
  useGateStoreOrders,
  useGuestSearch,
} from "@/features/gate/queries";

import { useAttendeeMerch, useCollectMerch } from "../queries";
import { STATUS_COPY, type MerchStatus } from "../schemas";

const ROLE_LABEL: Record<string, string> = {
  attendee: "Attendee",
  speaker: "Speaker",
  staff: "Staff",
};

/** Attendee-first, never item-first: search the person, be shown exactly what they are owed. */
export function MerchPanel({
  gateKey,
  ctx,
  door,
}: {
  gateKey: string | null;
  ctx: GateContext;
  door: string;
}) {
  const [q, setQ] = React.useState("");
  const [settled, setSettled] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [picking, setPicking] = React.useState<string | null>(null);
  const [cameraOn, setCameraOn] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const scannerRef = React.useRef<Scanner | null>(null);
  React.useEffect(() => {
    const t = setTimeout(() => setSettled(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const results = useGuestSearch(
    gateKey,
    ctx.event.id,
    selected ? "" : settled,
  );
  const status = useAttendeeMerch(gateKey, ctx.event.id, selected);
  const collect = useCollectMerch(gateKey, ctx.event.id);
  const bought = useGateStoreOrders(
    gateKey,
    ctx.event.id,
    selected,
    ctx.has_store,
  );
  const handOverOrder = useGateHandOver(gateKey, ctx.event.id);

  const stopCamera = React.useCallback(() => {
    scannerRef.current?.stop();
    scannerRef.current = null;
    setCameraOn(false);
  }, []);
  // A scan finds the same person the search would, without checking anybody in.
  const onScan = React.useCallback(
    async (code: string) => {
      stopCamera();
      setQ("");
      try {
        const found = await searchGuests(gateKey, ctx.event.id, code);
        if (found.length === 1 && found[0]) setSelected(found[0].id);
        else
          toast.warning(
            found.length
              ? "That code matches more than one guest"
              : "No one on this event has that ticket",
          );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not look that up",
        );
      }
    },
    [ctx.event.id, gateKey, stopCamera],
  );
  const startCamera = async () => {
    setCameraError(null);
    setSelected(null);
    try {
      setCameraOn(true);
      await new Promise((r) => setTimeout(r, 30));
      scannerRef.current = await startScanner(
        videoRef.current!,
        (c) => void onScan(c),
      );
    } catch (err) {
      setCameraOn(false);
      setCameraError(cameraProblem(err));
    }
  };
  React.useEffect(() => () => scannerRef.current?.stop(), []);

  const handOver = async (
    item: { item_id: string; name: string },
    variantLabel?: string,
  ) => {
    if (!selected || !status.data) return;
    try {
      const res = await collect.mutateAsync({
        itemId: item.item_id,
        body: { registration_id: selected, variant_label: variantLabel, door },
      });
      if (res.collected)
        toast.success(
          `${item.name}${res.variant_label ? ` — ${res.variant_label}` : ""} handed to ${status.data.attendee.name}`,
          {
            description: variantLabel
              ? `${res.variant_label} is now on their record.`
              : undefined,
          },
        );
      else
        toast.warning(
          res.status === "OUT_OF_STOCK"
            ? "Somebody took the last one a moment ago"
            : res.status === "ALREADY_COLLECTED"
              ? "They already collected this"
              : "Not collectable",
        );
      setPicking(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not hand it over",
      );
    }
  };

  if (!ctx.has_merch)
    return (
      <EmptyState
        tone="muted"
        title="No merchandise set up"
        description="Nothing to hand out at this event yet. The organiser adds items under Merchandise."
      />
    );

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <label
          htmlFor="gate-merch-find"
          className="mb-1.5 block font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground"
        >
          Find the person
        </label>
        <input
          id="gate-merch-find"
          value={q}
          onChange={(e) => (setQ(e.target.value), setSelected(null))}
          placeholder="Name, email or ticket"
          autoComplete="off"
          className="h-12 w-full rounded-md border bg-muted/40 px-3 text-[15px]"
        />
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          Search them, and you&apos;ll be shown exactly what they&apos;re owed.
          Handovers are recorded at {door}.
        </p>
        {cameraOn ? (
          <div className="relative mt-2.5 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 size-full object-cover"
            />
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 aspect-square w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-white/70"
            />
            <button
              type="button"
              onClick={stopCamera}
              className="absolute right-3 top-3 rounded-full border border-white/20 px-2.5 py-1 font-mono text-[10px] text-white/80"
            >
              STOP
            </button>
          </div>
        ) : (
          <Button
            size="lg"
            type="button"
            variant="outline"
            className="mt-2.5 w-full"
            onClick={() => void startCamera()}
          >
            Scan their ticket instead
          </Button>
        )}
        {cameraError ? (
          <p className="mt-1.5 text-[12.5px] text-destructive">{cameraError}</p>
        ) : null}
      </div>

      {!selected && settled.length >= 2 ? (
        results.data?.length ? (
          <ul className="divide-y rounded-xl border">
            {results.data.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r.id)}
                  className="flex min-h-14 w-full items-center gap-3 px-3 text-left hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">
                      {r.name}
                    </span>
                    <span className="block truncate font-mono text-[10.5px] text-muted-foreground">
                      {r.ticket_id} · {ROLE_LABEL[r.role] ?? r.role}
                      {r.email ? ` · ${r.email}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            Nobody on the list matches. Try fewer letters, or their email.
          </p>
        )
      ) : null}

      {selected ? (
        <div className="overflow-hidden rounded-xl border">
          {status.data ? (
            <>
              <div className="flex items-center gap-3 border-b bg-muted/30 px-3.5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">
                    {status.data.attendee.name}
                  </span>
                  <span className="block font-mono text-[10.5px] uppercase text-muted-foreground">
                    {status.data.attendee.role_label} ·{" "}
                    {status.data.attendee.ticket_id}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => (setSelected(null), setQ(""))}
                >
                  Change
                </Button>
              </div>
              {bought.data && bought.data.length > 0 ? (
                <div className="border-b bg-primary/5">
                  <p className="px-3.5 pt-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                    Bought with the ticket
                  </p>
                  {bought.data.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center gap-3 px-3.5 py-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium">
                          {o.summary}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block font-mono text-[11.5px]",
                            o.handed_over_at
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-muted-foreground",
                          )}
                        >
                          {o.handed_over_at
                            ? "Handed over"
                            : "Paid · still to hand over"}
                        </span>
                      </span>
                      {o.handed_over_at ? null : (
                        <Button
                          size="sm"
                          disabled={handOverOrder.isPending}
                          onClick={() =>
                            handOverOrder.mutate(o.id, {
                              onError: (err) =>
                                toast.error(
                                  err instanceof Error
                                    ? err.message
                                    : "Could not hand it over",
                                ),
                            })
                          }
                        >
                          Hand over
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              {status.data.items.length === 0 &&
              !(bought.data && bought.data.length > 0) ? (
                <p className="px-3.5 py-4 text-[13px] text-muted-foreground">
                  Nothing is set up for this event.
                </p>
              ) : null}
              {status.data.items.map((item) => {
                const collectable = item.status === "COLLECTABLE";
                const copy = collectable
                  ? null
                  : STATUS_COPY[
                      item.status as Exclude<MerchStatus, "COLLECTABLE">
                    ];
                const canPick = item.choices.length > 0;
                const open = picking === item.item_id;
                const busy =
                  collect.isPending &&
                  collect.variables?.itemId === item.item_id;
                return (
                  <div key={item.item_id} className="border-b last:border-b-0">
                    <div className="flex items-center gap-3 px-3.5 py-3">
                      {item.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.photo_url}
                          alt=""
                          className="size-10 shrink-0 rounded-md border object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="size-10 shrink-0 rounded-md border bg-muted"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium">
                          {item.name}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block font-mono text-[11.5px]",
                            item.status === "ALREADY_COLLECTED"
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-muted-foreground",
                          )}
                        >
                          {collectable
                            ? [
                                item.variant_label,
                                item.remaining != null
                                  ? `${item.remaining} left`
                                  : "Available",
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : copy!.note}
                        </span>
                      </span>
                      {collectable ? (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void handOver(item)}
                        >
                          Collect
                        </Button>
                      ) : canPick ? (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-expanded={open}
                          onClick={() => setPicking(open ? null : item.item_id)}
                        >
                          {open ? "Cancel" : "Pick size"}
                        </Button>
                      ) : copy?.chip ? (
                        <span className="shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase text-muted-foreground">
                          {copy.chip}
                        </span>
                      ) : null}
                    </div>
                    {open ? (
                      <div className="flex flex-wrap gap-2 bg-muted/30 px-3.5 py-3">
                        {item.on_file ? (
                          <p className="basis-full text-[12px] text-muted-foreground">
                            On file: {item.on_file}. Picking one writes it to
                            their record, then collects.
                          </p>
                        ) : null}
                        {item.choices.map((c) => (
                          <Button
                            key={c.label}
                            size="sm"
                            variant={c.remaining > 0 ? "outline" : "ghost"}
                            disabled={busy || c.remaining <= 0}
                            className="h-11"
                            onClick={() => void handOver(item, c.label)}
                          >
                            {c.label}{" "}
                            <span className="ml-1 font-mono text-[10px] opacity-70">
                              {c.remaining}
                            </span>
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </>
          ) : status.isError ? (
            <p className="px-3.5 py-4 text-[13px] text-destructive">
              {status.error.message}
            </p>
          ) : (
            <p className="px-3.5 py-4 text-[13px] text-muted-foreground">
              Looking up what they are owed…
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
