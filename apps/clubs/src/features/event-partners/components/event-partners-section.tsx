"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowDownIcon, ArrowUpIcon, ImagePlusIcon, Loader2Icon, PlusIcon, UsersIcon, XIcon } from "lucide-react";
import { pickImage } from "@moa/app-kit";
import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton,
  InitialsAvatar,
  NativeSelect,
  Segmented,
  Skeleton,
  cn,
  toast,
} from "@moa/ui";

import { useMyClub, usePick, type ClubPartner } from "@/features/club";

import {
  useAddFromClubPartners,
  useCreateEventPartner,
  useDeleteEventPartner,
  useEventPartners,
  useOrderEventPartners,
  useOrdering,
  useUpdateEventPartner,
  useUploadEventPartnerLogo,
} from "../queries";
import {
  KIND_WORDS,
  LABEL_MAX,
  LINK_MAX,
  MAX_EVENT_PARTNERS,
  NAME_MAX,
  PARTNER_KINDS,
  byKind,
  draftOf,
  emptyDraft,
  moved,
  partnerDraftSchema,
  type EventPartner,
  type PartnerDraft,
  type PartnerKind,
} from "../schemas";

/**
 * Sponsors and partners, in the event editor.
 *
 * Unlike the rest of the form, each row saves on its own, as the club
 * profile's partners do: added with its button, corrected on blur (a toast
 * says it took), moved up or down within its kind, removed after a second
 * click. Save changes at the foot of the form never has to carry them.
 *
 * A logo goes in a square tile, whole (contain, with padding): the public
 * page and the app show it the same way, so a wide wordmark is never cropped.
 */
const field = "input w-full";
const PLACEHOLDER: Record<PartnerKind, string> = { sponsor: "Title sponsor", partner: "Venue partner" };

/** The square tile a logo sits in, whole: as the public page shows it. */
export function LogoTile({ src, name, size = 56, className }: { src: string | null; name: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("border-line relative grid shrink-0 place-items-center overflow-hidden rounded-xl border bg-white", className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt="" fill sizes={`${size}px`} className="object-contain p-1.5" unoptimized />
      ) : (
        <InitialsAvatar name={name || "?"} size={size - 18} tone="muted" className="rounded-lg" />
      )}
    </span>
  );
}

function useDraft(initial: PartnerDraft) {
  const [draft, setDraft] = React.useState(initial);
  const set = (k: keyof PartnerDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  return { draft, setDraft, set };
}

function Row({ eventId, row, index, ids, busy }: { eventId: number; row: EventPartner; index: number; ids: number[]; busy: boolean }) {
  const update = useUpdateEventPartner(eventId);
  const remove = useDeleteEventPartner(eventId);
  const order = useOrderEventPartners(eventId);
  const logoUpload = useUploadEventPartnerLogo(eventId);
  const words = KIND_WORDS[row.kind];
  // Handing back the upload's promise lets a refused logo come down again (usePick).
  const pick = usePick((f) => logoUpload.mutateAsync({ id: row.id, file: f }), `${words.one} logo`);
  const logo = pick.preview ?? pickImage(row.logo, ["medium", "thumbnail", "large", "original"]);
  const { draft, set, setDraft } = useDraft(draftOf(row));
  const [confirm, setConfirm] = React.useState(false);
  const saved = draftOf(row);
  // A save that came back brings the row's own words again (set while
  // rendering, as React advises for state that follows a prop).
  const [shown, setShown] = React.useState(row);
  if (shown !== row) {
    setShown(row);
    setDraft(saved);
  }

  const save = () => {
    if (draft.name === saved.name && draft.label === saved.label && draft.link === saved.link) return;
    const parsed = partnerDraftSchema.safeParse(draft);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? `Check the ${words.one}`);
    update.mutate({ id: row.id, patch: parsed.data });
  };
  const move = (by: -1 | 1) => {
    const next = moved(ids, index, by);
    if (next) order.mutate({ kind: row.kind, ids: next });
  };

  return (
    <li className="border-line-soft bg-sunken flex flex-wrap items-center gap-2 rounded-xl border p-2.5" data-testid={`event-partner-${row.id}`}>
      <button
        type="button"
        aria-label={`${logo ? "Replace" : "Add"} ${row.name} logo`}
        title={logo ? "Replace the logo" : "Add a logo: square, 1080 × 1080 is best"}
        onClick={pick.open}
        disabled={logoUpload.isPending || pick.preparing}
        className="relative shrink-0 rounded-xl bg-transparent p-0"
      >
        <LogoTile src={logo} name={row.name} />
        {logoUpload.isPending || pick.preparing ? (
          <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/40 text-white">
            <Loader2Icon className="size-4 animate-spin" />
          </span>
        ) : null}
      </button>
      {pick.input}
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <input aria-label={`${row.name} name`} className={field} value={draft.name} onChange={set("name")} onBlur={save} maxLength={NAME_MAX} placeholder="Name" />
        <input aria-label={`${row.name} label`} className={field} value={draft.label} onChange={set("label")} onBlur={save} maxLength={LABEL_MAX} placeholder={`${PLACEHOLDER[row.kind]} · optional`} />
        <input
          aria-label={`${row.name} link`}
          className={cn(field, "sm:col-span-2")}
          value={draft.link}
          onChange={set("link")}
          onBlur={save}
          maxLength={LINK_MAX + 20}
          inputMode="url"
          placeholder="https://… · optional"
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton label={`Move ${row.name} up`} variant="ghost" disabled={busy || index === 0} onClick={() => move(-1)}>
          <ArrowUpIcon className="size-4" />
        </IconButton>
        <IconButton label={`Move ${row.name} down`} variant="ghost" disabled={busy || index === ids.length - 1} onClick={() => move(1)}>
          <ArrowDownIcon className="size-4" />
        </IconButton>
        <NativeSelect
          size="sm"
          aria-label={`${row.name} is a`}
          className="w-[104px]"
          value={row.kind}
          disabled={update.isPending}
          onChange={(e) => update.mutate({ id: row.id, patch: { kind: e.target.value as PartnerKind } })}
        >
          {PARTNER_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_WORDS[k].One}
            </option>
          ))}
        </NativeSelect>
        <button
          type="button"
          aria-label={confirm ? `Confirm removing ${row.name}` : `Remove ${row.name}`}
          className={cn("btn btn-ghost btn-sm", confirm && "text-refuse")}
          onClick={() => {
            if (confirm) remove.mutate(row);
            setConfirm(!confirm);
          }}
          onBlur={() => setConfirm(false)}
          disabled={remove.isPending}
        >
          {confirm ? <span className="text-[12px]">Remove?</span> : <XIcon className="size-4" />}
        </button>
      </div>
    </li>
  );
}

function NewRow({ eventId, kind, onDone }: { eventId: number; kind: PartnerKind; onDone: () => void }) {
  const create = useCreateEventPartner(eventId);
  const logoUpload = useUploadEventPartnerLogo(eventId);
  const words = KIND_WORDS[kind];
  const { draft, set } = useDraft(emptyDraft);
  const [logo, setLogo] = React.useState<File | null>(null);
  const pick = usePick((f) => setLogo(f), `${words.one} logo`);
  const [error, setError] = React.useState<string | null>(null);

  const add = async () => {
    const parsed = partnerDraftSchema.safeParse(draft);
    if (!parsed.success) return void setError(parsed.error.issues[0]?.message ?? `Check the ${words.one}`);
    setError(null);
    // A refusal is toasted by the mutation; the row stays for another try.
    const made = await create.mutateAsync({ kind, form: parsed.data }).catch(() => null);
    if (!made) return;
    // It exists now, so the row closes even if the logo is refused (toasted too): a second Add would list it twice.
    if (logo) await logoUpload.mutateAsync({ id: made.id, file: logo }).catch(() => null);
    onDone();
  };

  return (
    <div className="border-line bg-surface grid gap-2 rounded-xl border border-dashed p-2.5" role="group" aria-label={`New ${words.one}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label={`Add the new ${words.one}'s logo`} title="Add a logo: square, 1080 × 1080 is best" onClick={pick.open} className="shrink-0 rounded-xl bg-transparent p-0">
          {pick.preview ? (
            <LogoTile src={pick.preview} name={draft.name} />
          ) : (
            <span className="border-line bg-sunken grid size-14 place-items-center rounded-xl border">
              <ImagePlusIcon className="text-ink-3 size-4" />
            </span>
          )}
        </button>
        {pick.input}
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <input aria-label={`New ${words.one} name`} className={field} value={draft.name} onChange={set("name")} maxLength={NAME_MAX} placeholder={`${words.One} name`} autoFocus />
          <input aria-label={`New ${words.one} label`} className={field} value={draft.label} onChange={set("label")} maxLength={LABEL_MAX} placeholder={`${PLACEHOLDER[kind]} · optional`} />
          <input aria-label={`New ${words.one} link`} className={cn(field, "sm:col-span-2")} value={draft.link} onChange={set("link")} maxLength={LINK_MAX + 20} inputMode="url" placeholder="https://… · optional" />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void add()} disabled={create.isPending || logoUpload.isPending || pick.preparing}>
            {create.isPending || logoUpload.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} Add
          </button>
          <button type="button" className="btn btn-ghost btn-sm" aria-label={`Cancel adding a ${words.one}`} onClick={onDone}>
            <XIcon className="size-4" />
          </button>
        </div>
      </div>
      {error ? <p className="text-refuse text-[12px]">{error}</p> : null}
    </div>
  );
}

function Group({ eventId, kind, rows, full, busy }: { eventId: number; kind: PartnerKind; rows: EventPartner[]; full: boolean; busy: boolean }) {
  const [adding, setAdding] = React.useState(false);
  const words = KIND_WORDS[kind];
  const ids = rows.map((r) => r.id);
  return (
    <section aria-labelledby={`event-partners-${kind}`} className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <p id={`event-partners-${kind}`} className="text-ink m-0 text-[13.5px] font-medium">
          {words.Many} <span className="text-ink-3 font-mono text-[11px] tabular-nums">{rows.length}</span>
        </p>
        <button type="button" className="btn btn-ghost btn-sm text-brand" onClick={() => setAdding(true)} disabled={adding || full} title={full ? `An event can list up to ${MAX_EVENT_PARTNERS}` : undefined}>
          <PlusIcon className="size-3.5" /> Add {words.one}
        </button>
      </div>
      {rows.length ? (
        <ul className="grid gap-2" aria-label={words.Many}>
          {rows.map((row, index) => (
            <Row key={row.id} eventId={eventId} row={row} index={index} ids={ids} busy={busy} />
          ))}
        </ul>
      ) : !adding ? (
        <p className="text-ink-3 text-[12.5px]">No {words.many} yet.</p>
      ) : null}
      {adding ? <NewRow eventId={eventId} kind={kind} onDone={() => setAdding(false)} /> : null}
    </section>
  );
}

/** "Add from your club's partners": tick some, choose sponsors or partners, add. */
function FromClubDialog({ eventId, partners, onEvent, room, open, onOpenChange }: { eventId: number; partners: ClubPartner[]; onEvent: Set<number>; room: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const add = useAddFromClubPartners(eventId);
  const [kind, setKind] = React.useState<PartnerKind>("partner");
  const [picked, setPicked] = React.useState<Set<number>>(new Set());
  // Each opening starts with nothing ticked.
  const close = (next: boolean) => {
    if (!next) setPicked(new Set());
    onOpenChange(next);
  };
  const toggle = (id: number) => setPicked((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const over = picked.size > room;
  const submit = () => {
    // In the club's own order, as the profile lists them.
    const ids = partners.filter((p) => picked.has(p.id)).map((p) => p.id);
    add.mutate({ kind, ids }, { onSuccess: () => close(false) });
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add from your club&apos;s partners</DialogTitle>
          <DialogDescription>Copies each one&apos;s name and logo, with its role as the label. Changing it here later leaves the club profile as it is.</DialogDescription>
        </DialogHeader>
        <Segmented label="Add them as" value={kind} options={PARTNER_KINDS.map((k) => ({ value: k, label: KIND_WORDS[k].Many }))} onChange={setKind} />
        <ul className="grid max-h-[320px] gap-1 overflow-y-auto" aria-label="Your club's partners">
          {partners.map((p) => {
            const there = onEvent.has(p.id);
            return (
              <li key={p.id}>
                <label className={cn("hover:bg-sunken flex items-center gap-3 rounded-lg px-2 py-1.5", there && "opacity-60")}>
                  <Checkbox checked={there || picked.has(p.id)} disabled={there} onCheckedChange={() => toggle(p.id)} aria-label={p.name} />
                  <LogoTile src={pickImage(p.logo, ["thumbnail", "medium", "original", "large"])} name={p.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-[13px] font-medium">{p.name}</span>
                    {p.role ? <span className="text-ink-3 block truncate text-[11.5px]">{p.role}</span> : null}
                  </span>
                  {there ? <span className="text-ink-3 shrink-0 text-[11.5px]">On this event</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
        {over ? <p className="text-refuse text-[12px]">There is room for {room} more on this event.</p> : null}
        <DialogFooter>
          <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!picked.size || over || add.isPending} onClick={submit}>
            {add.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {picked.size ? `Add ${picked.size} as ${picked.size === 1 ? KIND_WORDS[kind].one : KIND_WORDS[kind].many}` : "Add"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The section's body. `eventId` is undefined on a new event: rows hang on an
 * event, so they are added once it is saved (a draft is enough).
 */
export function EventPartnersSection({ eventId }: { eventId?: number }) {
  if (eventId === undefined) {
    return (
      <p className="text-ink-3 m-0 text-[12.5px]">
        Save the event first (a draft is fine), then add its sponsors and partners here. Each shows on the event page as a square logo, whole, with its name and a link.
      </p>
    );
  }
  return <Editor eventId={eventId} />;
}

function Editor({ eventId }: { eventId: number }) {
  const list = useEventPartners(eventId);
  const club = useMyClub();
  // While one kind's new order is on its way, no other move starts from the old one.
  const ordering = useOrdering(eventId);
  const [picking, setPicking] = React.useState(false);
  const rows = React.useMemo(() => list.data ?? [], [list.data]);
  const groups = byKind(rows);
  const full = rows.length >= MAX_EVENT_PARTNERS;
  const clubPartners = club.data?.partners ?? [];
  const onEvent = React.useMemo(() => new Set(rows.map((r) => r.club_partner_id).filter((v): v is number => typeof v === "number")), [rows]);

  if (list.isPending) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (list.isError) return <p className="text-refuse text-[12.5px]">Could not load the sponsors and partners. Reload the page to try again.</p>;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-ink-3 m-0 max-w-[52ch] text-[12px]">
          On the event page, sponsors come first, then partners, each as a square logo shown whole. Square logos work best (1080 × 1080). Each row saves as you go, not with Save changes.
        </p>
        {clubPartners.length ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicking(true)} disabled={full}>
            <UsersIcon className="size-3.5" /> Add from your club&apos;s partners
          </button>
        ) : null}
      </div>
      {PARTNER_KINDS.map((kind) => (
        <Group key={kind} eventId={eventId} kind={kind} rows={groups[kind]} full={full} busy={ordering} />
      ))}
      {rows.length >= MAX_EVENT_PARTNERS - 5 ? (
        <p className={cn("text-[12px]", full ? "text-caution" : "text-ink-3")}>
          {rows.length} of {MAX_EVENT_PARTNERS}: an event can list up to {MAX_EVENT_PARTNERS} sponsors and partners.
        </p>
      ) : null}
      {clubPartners.length ? (
        <FromClubDialog eventId={eventId} partners={clubPartners} onEvent={onEvent} room={MAX_EVENT_PARTNERS - rows.length} open={picking} onOpenChange={setPicking} />
      ) : null}
    </div>
  );
}
