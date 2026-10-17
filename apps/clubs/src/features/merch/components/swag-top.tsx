"use client";

import * as React from "react";
import Link from "next/link";
import {
  DoorOpenIcon,
  GiftIcon,
  HandshakeIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { formatNumber, plural } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  CardLabel,
  cn,
  EmptyState,
  FigurePanel,
  IconButton,
  NativeSelect,
  Notice,
  ProgressBar,
  Skeleton,
  StatTile,
  StatusBadge,
  Switch,
  toast,
  type StatusTone,
} from "@moa/ui";

import { useFeatureGate } from "@/features/plan";

import {
  useCreateMerchItem,
  useDeleteMerchItem,
  useHandOutByHand,
  useMerchFields,
} from "../queries";
import { whoGetsIt, type MerchItem } from "../schemas";
import {
  label,
  PhotoField,
  RuleFields,
  ruleOf,
  SizesEditor,
  WHO,
  type Photo,
  type SizeRow,
  type Who,
} from "./swag-fields";

/**
 * Swag: free giveaways, tracked apart from merchandise for sale.
 *
 * One line and four figures on what there is and what has gone; one notice
 * when an item has run out or is about to; then a card per item saying who
 * gets it, how many are out, and counting one out by hand with +1 and Undo.
 * Adding an item is a panel that opens here, with the photo, the sizes and
 * a rule by a guest's answer one click further in.
 */
const field = "input";

function NewSwag({
  eventId,
  onClose,
}: {
  eventId: number;
  onClose: () => void;
}) {
  const create = useCreateMerchItem(eventId);
  const fields = useMerchFields(eventId);
  const id = React.useId();
  const [draft, setDraft] = React.useState({
    name: "",
    stock: "",
    who: "everyone" as Who,
    sponsor: "",
  });
  const [rule, setRule] = React.useState({ field: "", value: "" });
  const [more, setMore] = React.useState(false);
  const [photo, setPhoto] = React.useState<Photo>({ key: null, url: null });
  const [sized, setSized] = React.useState(false);
  const [sizeField, setSizeField] = React.useState("");
  const [rows, setRows] = React.useState<SizeRow[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const list = fields.data ?? [];
  const fillFrom = (name: string) => {
    setSizeField(name);
    const f = list.find((x) => x.name === name);
    setRows(
      f?.values.length
        ? f.values.map((v) => ({ label: v, stock: "" }))
        : [{ label: "", stock: "" }],
    );
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim();
    const stock = Number(draft.stock);
    const variants = rows
      .map((r) => ({ label: r.label.trim(), stock: Number(r.stock || 0) }))
      .filter((r) => r.label);
    const next: Record<string, string> = {};
    if (!name) next.name = "Name the item";
    if (!sized && (!Number.isInteger(stock) || stock <= 0))
      next.stock = "How many pieces are there?";
    if (sized && !sizeField) next.sizes = "Which guest field holds the size?";
    else if (sized && variants.length === 0) next.sizes = "Add at least one size.";
    if (draft.who === "custom" && (!rule.field || !rule.value))
      next.rule = "Pick the field and the answer it must be.";
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      const item = await create.mutateAsync({
        name,
        photo_key: photo.key,
        stock: sized ? null : stock,
        variant_field: sized ? sizeField : null,
        variants: sized ? variants : [],
        ...ruleOf(draft.who, rule.field, rule.value),
        sponsor: draft.sponsor.trim() || null,
      });
      toast.success(`${item.name} added`, {
        description: sized
          ? `${item.variants.length} sizes, ${item.total} in all.`
          : `${item.total} to give out.`,
      });
      onClose();
    } catch {
      /* the mutation says what went wrong */
    }
  };
  const err = (k: string) =>
    errors[k] ? (
      <p className="text-refuse mt-1 text-[12px]">{errors[k]}</p>
    ) : null;

  return (
    <FigurePanel className="ring-brand-line p-4">
      <form onSubmit={submit} noValidate className="grid gap-3">
        <CardLabel>New swag item</CardLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_0.6fr_1.2fr_1fr]">
          <div>
            <label htmlFor={`${id}-name`} className={label}>
              Item
            </label>
            <input
              id={`${id}-name`}
              className={field}
              placeholder="e.g. Welcome tote"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              maxLength={120}
              aria-invalid={!!errors.name}
            />
            {err("name")}
          </div>
          <div>
            {sized ? (
              <>
                <span className={label}>Quantity</span>
                <p className="text-ink-3 pt-2 text-[12px]">Set per size below</p>
              </>
            ) : (
              <>
                <label htmlFor={`${id}-qty`} className={label}>
                  Quantity
                </label>
                <input
                  id={`${id}-qty`}
                  className={cn(field, "font-mono")}
                  inputMode="numeric"
                  value={draft.stock}
                  onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                  aria-invalid={!!errors.stock}
                />
                {err("stock")}
              </>
            )}
          </div>
          <div>
            <label htmlFor={`${id}-who`} className={label}>
              Who gets it
            </label>
            <NativeSelect
              id={`${id}-who`}
              value={draft.who}
              onChange={(e) =>
                setDraft({ ...draft, who: e.target.value as Who })
              }
            >
              {WHO.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <label htmlFor={`${id}-sponsor`} className={label}>
              Sponsor (optional)
            </label>
            <input
              id={`${id}-sponsor`}
              className={field}
              placeholder="e.g. Kinetic Labs"
              value={draft.sponsor}
              onChange={(e) => setDraft({ ...draft, sponsor: e.target.value })}
              maxLength={120}
            />
          </div>
        </div>
        {draft.who === "custom" ? (
          <div>
            <RuleFields
              fields={list}
              field={rule.field}
              value={rule.value}
              onField={(f) => setRule({ field: f, value: "" })}
              onValue={(v) => setRule((r) => ({ ...r, value: v }))}
            />
            {err("rule")}
          </div>
        ) : null}
        {more ? (
          <div className="bg-sunken grid gap-4 rounded-xl p-3">
            <PhotoField eventId={eventId} value={photo} onChange={setPhoto} />
            <div className="flex items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="text-ink block text-[13px]">
                  Comes in sizes
                </span>
                <span className="text-ink-3 block text-[11.5px]">
                  Each size keeps its own stock; the size a guest gets comes
                  from a field on their record.
                </span>
              </span>
              <Switch
                checked={sized}
                aria-label="Comes in sizes"
                onCheckedChange={(on) => {
                  setSized(on);
                  const first = list.find((f) => f.kind !== "role");
                  if (on && !sizeField && first) fillFrom(first.name);
                }}
                className="mt-0.5"
              />
            </div>
            {sized ? (
              <div>
                <SizesEditor
                  fields={list}
                  field={sizeField}
                  rows={rows}
                  onField={fillFrom}
                  onRows={setRows}
                />
                {err("sizes")}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            {more ? "Fewer options" : "Photo and sizes"}
          </Button>
          <span className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Add swag
            </Button>
          </span>
        </div>
      </form>
    </FigurePanel>
  );
}

function statusOf(item: MerchItem, left: number): { label: string; tone: StatusTone } {
  if (item.handout_rule === "winners") return { label: "At results", tone: "info" };
  if (item.total > 0 && left === 0) return { label: "All given", tone: "warning" };
  return { label: "Handing out", tone: "success" };
}

function SwagCard({
  eventId,
  item,
  onEdit,
}: {
  eventId: number;
  item: MerchItem;
  onEdit: () => void;
}) {
  const hand = useHandOutByHand(eventId);
  const remove = useDeleteMerchItem(eventId);
  const [confirm, setConfirm] = React.useState(false);
  const left = Math.max(0, item.total - item.handed_out);
  const status = statusOf(item, left);
  return (
    <FigurePanel className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        {item.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photo_url}
            alt=""
            className="border-line-soft size-11 shrink-0 rounded-xl border object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="bg-brand-soft text-brand grid size-11 shrink-0 place-items-center rounded-xl"
          >
            <GiftIcon className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-ink text-[14.5px] font-medium">{item.name}</div>
          <div className="text-ink-3 text-[12px]">{whoGetsIt(item)}</div>
        </div>
        <StatusBadge tone={status.tone} label={status.label} />
      </div>
      <div>
        <div className="flex justify-between gap-2 text-[12.5px]">
          <span className="text-ink">
            <strong className="font-semibold">{formatNumber(item.handed_out)}</strong>{" "}
            of {formatNumber(item.total)} handed out
          </span>
          <span className="text-ink-3">{formatNumber(left)} left</span>
        </div>
        <ProgressBar
          value={item.handed_out}
          max={Math.max(1, item.total)}
          tone={left === 0 ? "caution" : "accent"}
          height={6}
          className="mt-1"
          label={`${item.name} handed out`}
        />
        <p className="text-ink-3 mt-1 text-[11.5px]">
          {item.manual_handed_out
            ? `${formatNumber(item.collected)} scanned at the gate · ${formatNumber(item.manual_handed_out)} by hand`
            : `${formatNumber(item.collected)} scanned at the gate`}
        </p>
      </div>
      {item.variants.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {item.variants.map((v) => (
            <span
              key={v.id}
              title={`${v.label}: ${v.collected} of ${v.stock} handed out`}
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[10.5px] tabular-nums",
                v.collected >= v.stock
                  ? "border-refuse-line text-refuse"
                  : "border-line text-ink-2",
              )}
            >
              {v.label} {v.collected}/{v.stock}
            </span>
          ))}
          {item.variant_field ? (
            <span className="text-ink-3 text-[11px]">by {item.variant_field}</span>
          ) : null}
        </div>
      ) : null}
      {item.sponsor ? (
        <div className="text-ink-2 flex items-center gap-1.5 text-[12px]">
          <HandshakeIcon className="text-brand size-3.5" aria-hidden="true" />
          Sponsored by{" "}
          <span className="text-ink font-medium">{item.sponsor}</span>
        </div>
      ) : null}
      <div className="border-line-soft mt-auto flex flex-wrap items-center gap-1.5 border-t pt-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => hand.mutate({ itemId: item.id })}
          disabled={hand.isPending || left === 0}
        >
          <PlusIcon /> 1 handed out
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => hand.mutate({ itemId: item.id, undo: true })}
          disabled={hand.isPending || item.manual_handed_out === 0}
          aria-label={`Undo one for ${item.name}`}
        >
          <Undo2Icon /> Undo
        </Button>
        <span className="flex-1" />
        <IconButton label={`Edit ${item.name}`} onClick={onEdit}>
          <PencilIcon />
        </IconButton>
        <IconButton
          label={`Remove ${item.name}`}
          danger
          onClick={() => setConfirm(true)}
        >
          <Trash2Icon />
        </IconButton>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {item.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {item.collected > 0
                ? `${plural(item.collected, "handover")} were scanned at the gate. Removing the item removes those records too; the guests keep what they were given.`
                : "Nobody has collected it at the gate. It simply goes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate({
                  id: item.id,
                  withCollections: item.collected > 0,
                })
              }
            >
              {item.collected > 0 ? "Remove with its handovers" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FigurePanel>
  );
}

/** What runs out first, if anything: an item gone, or one down to its last tenth. */
function attentionOf(items: MerchItem[]) {
  const counted = items.filter(
    (i) => i.handout_rule !== "winners" && i.total > 0,
  );
  const left = (i: MerchItem) => Math.max(0, i.total - i.handed_out);
  const out = counted.filter((i) => left(i) === 0);
  if (out.length) return { tag: "Run out", item: out[0]!, more: out.length - 1, left: 0 };
  const low = counted
    .filter((i) => left(i) <= Math.ceil(i.total * 0.1))
    .sort((a, b) => left(a) - left(b));
  if (low.length) return { tag: "Low", item: low[0]!, more: low.length - 1, left: left(low[0]!) };
  return null;
}

/** The top of the Swag tab: the heading, the figures, what is running out, and a card per item. */
export function SwagTop({
  eventId,
  items,
  onEdit,
  loading = false,
  error = null,
}: {
  eventId: number;
  items: MerchItem[];
  onEdit: (item: MerchItem) => void;
  /** While the items load: the figures and the cards draw as placeholders. */
  loading?: boolean;
  /** Shown in place of the figures and the cards when the items could not load. */
  error?: React.ReactNode;
}) {
  const [adding, setAdding] = React.useState(false);
  // Swag is a plan feature: what is set up stays readable, adding more opens the upgrade dialog.
  const gate = useFeatureGate("swag", { eventId });
  const stock = items.reduce((n, i) => n + i.total, 0);
  const out = items.reduce((n, i) => n + i.handed_out, 0);
  const sponsored = items.filter((i) => i.sponsor).length;
  const attention = attentionOf(items);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-ink m-0 text-[17px] font-semibold tracking-[-0.02em]">
            Swag
          </h2>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {items.length
              ? `${plural(items.length, "item")} · ${formatNumber(out)} of ${formatNumber(stock)} pieces handed out · ${formatNumber(Math.max(0, stock - out))} still to give`
              : "Free giveaways, tracked apart from merchandise for sale: who gets each, and who has had theirs."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/gate/${eventId}`}
            target="_blank"
            rel="noopener"
            className="btn btn-secondary"
          >
            <DoorOpenIcon /> Open the gate
          </Link>
          <Button onClick={gate.guard(() => setAdding(true))} disabled={adding}>
            {gate.locked ? <LockIcon /> : <PlusIcon />} Add swag
          </Button>
        </div>
      </div>
      {error ? (
        error
      ) : loading ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[118px] rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[220px] rounded-2xl" />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Swag items"
              value={items.length}
              note={sponsored > 0 ? `${sponsored} sponsored` : "none sponsored"}
            />
            <StatTile
              label="Pieces in stock"
              value={formatNumber(stock)}
              note="Across all items"
            />
            <StatTile
              label="Handed out"
              value={formatNumber(out)}
              note={stock ? `${Math.round((100 * out) / stock)}% of the stock` : "So far"}
            />
            <StatTile
              label="Still to give"
              value={formatNumber(Math.max(0, stock - out))}
              note="Keep these at the door"
            />
          </div>
          {attention ? (
            <Notice
              tone="caution"
              tag={attention.tag}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onEdit(attention.item)}
                >
                  Add stock
                </Button>
              }
            >
              {attention.left === 0
                ? `${attention.item.name} has run out: the gate turns away anyone owed one.`
                : `${attention.item.name} is down to its last ${attention.left}.`}
              {attention.more > 0
                ? ` ${plural(attention.more, "other item")} ${attention.left === 0 ? "too" : "is close"}.`
                : ""}
            </Notice>
          ) : null}
          {adding ? (
            <NewSwag eventId={eventId} onClose={() => setAdding(false)} />
          ) : null}
          {items.length === 0 ? (
            adding ? null : (
              <FigurePanel className="p-0">
                <EmptyState
                  icon={<GiftIcon />}
                  title="Nothing to give out yet"
                  description="Add the first item: a tote for everyone who checks in, a sticker sheet for the first arrivals, a voucher for the winners."
                />
              </FigurePanel>
            )
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {items.map((i) => (
                <SwagCard
                  key={i.id}
                  eventId={eventId}
                  item={i}
                  onEdit={() => onEdit(i)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
