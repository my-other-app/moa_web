"use client";

import * as React from "react";
import { Button, EmptyState, FigurePanel, InitialsAvatar, cn, toast } from "@moa/ui";
import { CameraOffIcon, CheckIcon, PackageIcon, ScanLineIcon, SearchIcon, ShirtIcon } from "lucide-react";

import {
  CameraWell,
  DOOR_LABEL,
  DoorSpinner,
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
      <FigurePanel className="mx-auto w-full max-w-[640px] p-2">
        <EmptyState
          icon={<PackageIcon />}
          title="No merchandise set up"
          description="Nothing to hand out at this event yet. The organiser adds items under Merchandise."
        />
      </FigurePanel>
    );

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
      <div>
        <label htmlFor="gate-merch-find" className={DOOR_LABEL}>
          Find the person
        </label>
        <div className="search h-11">
          <SearchIcon aria-hidden="true" />
          <input
            id="gate-merch-find"
            value={q}
            onChange={(e) => (setQ(e.target.value), setSelected(null))}
            placeholder="Name, email or ticket"
            autoComplete="off"
            className="text-[16px]"
          />
        </div>
        <p className="text-ink-3 mt-1.5 text-[13px] leading-[1.55]">
          Search them, and you&apos;ll be shown exactly what they&apos;re owed.
          Handovers are recorded at {door}.
        </p>
        {cameraOn ? (
          <CameraWell
            videoRef={videoRef}
            on
            frame={52}
            className="mt-3 aspect-[4/3]"
          >
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="absolute top-3 right-3"
              onClick={stopCamera}
            >
              <CameraOffIcon /> Stop
            </Button>
            <span className="bg-canvas/80 text-ink-2 absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full px-3.5 py-1.5 text-[13px] backdrop-blur-sm">
              Hold their ticket inside the frame
            </span>
          </CameraWell>
        ) : (
          <Button
            size="lg"
            type="button"
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => void startCamera()}
          >
            <ScanLineIcon /> Scan their ticket instead
          </Button>
        )}
        {cameraError ? (
          <p role="alert" className="text-refuse mt-2 text-[13px] leading-[1.5]">
            {cameraError}
          </p>
        ) : null}
      </div>

      {!selected && settled.length >= 2 ? (
        !results.data && results.isFetching ? (
          <p className="text-ink-2 flex items-center gap-2 text-[13px]">
            <DoorSpinner className="size-3.5" /> Looking through the list…
          </p>
        ) : results.data?.length ? (
          <ul className="bg-surface border-line-soft divide-line-soft shadow-card divide-y overflow-hidden rounded-[var(--radius-card)] border">
            {results.data.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r.id)}
                  className="hover:bg-sunken flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
                >
                  <InitialsAvatar name={r.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block text-[15px] font-medium">
                      {r.name}
                    </span>
                    <span className="text-ink-3 block truncate font-mono text-[11px]">
                      {r.ticket_id} · {ROLE_LABEL[r.role] ?? r.role}
                      {r.email ? ` · ${r.email}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-3 text-[13px]">
            Nobody on the list matches. Try fewer letters, or their email.
          </p>
        )
      ) : null}

      {selected ? (
        <div className="bg-surface border-line-soft shadow-card overflow-hidden rounded-[var(--radius-card)] border">
          {status.data ? (
            <>
              <div className="bg-sunken border-line-soft flex items-center gap-3 border-b px-4 py-3">
                <InitialsAvatar name={status.data.attendee.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-[16px] font-semibold">
                    {status.data.attendee.name}
                  </span>
                  <span className="text-ink-3 block font-mono text-[11px]">
                    {status.data.attendee.role_label} ·{" "}
                    {status.data.attendee.ticket_id}
                  </span>
                </span>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => (setSelected(null), setQ(""))}
                >
                  Change
                </Button>
              </div>
              {bought.data && bought.data.length > 0 ? (
                <div className="border-line-soft border-b">
                  <p className="eyebrow px-4 pt-3">Bought with the ticket</p>
                  {bought.data.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-ink block text-[15px] font-medium">
                          {o.summary}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 flex items-center gap-1 text-[12.5px]",
                            o.handed_over_at ? "text-admit" : "text-ink-3",
                          )}
                        >
                          {o.handed_over_at ? (
                            <CheckIcon aria-hidden="true" className="size-3.5" />
                          ) : null}
                          {o.handed_over_at
                            ? "Handed over"
                            : "Paid · still to hand over"}
                        </span>
                      </span>
                      {o.handed_over_at ? null : (
                        <Button
                          size="lg"
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
                <p className="text-ink-3 px-4 py-4 text-[13.5px]">
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
                const collected = item.status === "ALREADY_COLLECTED";
                return (
                  <div
                    key={item.item_id}
                    className="border-line-soft border-b last:border-b-0"
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      {item.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.photo_url}
                          alt=""
                          className="border-line-soft size-11 shrink-0 rounded-[var(--radius-md)] border object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="bg-brand-soft text-brand grid size-11 shrink-0 place-items-center rounded-[var(--radius-md)]"
                        >
                          <ShirtIcon className="size-5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="text-ink block text-[15px] font-medium">
                          {item.name}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 flex items-center gap-1 text-[12.5px]",
                            collected ? "text-admit" : "text-ink-3",
                          )}
                        >
                          {collected ? (
                            <CheckIcon aria-hidden="true" className="size-3.5" />
                          ) : null}
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
                          size="lg"
                          disabled={busy}
                          onClick={() => void handOver(item)}
                        >
                          Collect
                        </Button>
                      ) : canPick ? (
                        <Button
                          size="lg"
                          variant="secondary"
                          aria-expanded={open}
                          onClick={() => setPicking(open ? null : item.item_id)}
                        >
                          {open ? "Cancel" : "Pick size"}
                        </Button>
                      ) : copy?.chip ? (
                        <span
                          className={cn(
                            "tag shrink-0",
                            collected
                              ? "bg-admit-soft text-admit"
                              : "tag-neutral",
                          )}
                        >
                          {copy.chip}
                        </span>
                      ) : null}
                    </div>
                    {open ? (
                      <div className="bg-sunken flex flex-wrap gap-2 px-4 py-3">
                        {item.on_file ? (
                          <p className="text-ink-2 basis-full text-[13px]">
                            On file: {item.on_file}. Picking one writes it to
                            their record, then collects.
                          </p>
                        ) : null}
                        {item.choices.map((c) => (
                          <Button
                            key={c.label}
                            size="lg"
                            variant="secondary"
                            disabled={busy || c.remaining <= 0}
                            onClick={() => void handOver(item, c.label)}
                          >
                            {c.label}
                            <span className="text-ink-3 font-mono text-[11px]">
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
            <p role="alert" className="text-refuse px-4 py-4 text-[13.5px]">
              {status.error.message}
            </p>
          ) : (
            <p className="text-ink-2 flex items-center gap-2 px-4 py-4 text-[13.5px]">
              <DoorSpinner className="size-3.5" /> Looking up what they are
              owed…
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
