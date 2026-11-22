"use client";

import * as React from "react";
import { ArrowDownIcon, ArrowUpIcon, ImagePlusIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FigurePanel,
  NativeSelect,
  Notice,
  Skeleton,
  cn,
  toast,
} from "@moa/ui";
import { plural } from "@moa/app-kit";

import { readImageSize } from "../lib/art";
import { errorText } from "../lib/time";
import { useCardConfig, useDeleteHero, useHeroes, useOrderHeroes, useSaveHero } from "../queries";
import {
  ART_MAX_BYTES,
  EMBLEMS,
  HEROES_MAX,
  HERO_NAME_MAX,
  HERO_TAGLINE_MAX,
  TIERS,
  TIER_LABEL,
  artProblem,
  deckGaps,
  heroProblems,
  isRevealed,
  type ArtSize,
  type Hero,
  type HeroInput,
  type ThemeKey,
  type Tier,
} from "../schemas";
import { GameGateNotice } from "./gate-notice";
import { HeroCard } from "./hero-card";

/** The picture's problem as the organiser would see it: type, size, pixels, shape. */
export async function checkArt(file: File, measure: (f: Blob) => Promise<ArtSize | null> = readImageSize): Promise<string | null> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > ART_MAX_BYTES) return artProblem(file, null);
  return artProblem(file, await measure(file));
}

/** A new order after moving one hero a step: null at an end. */
export function moved(ids: readonly string[], id: string, by: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

interface Draft {
  name: string;
  tagline: string;
  tier: Tier;
  emblem: string | null;
}
const blank: Draft = { name: "", tagline: "", tier: "common", emblem: "bolt" };

export function HeroEditor({
  eventId,
  hero,
  theme,
  onClose,
  measure,
}: {
  eventId: number;
  /** The hero being changed; null makes a new one. */
  hero: Hero | null;
  theme: ThemeKey;
  onClose: () => void;
  measure?: (f: Blob) => Promise<ArtSize | null>;
}) {
  const save = useSaveHero(eventId);
  const [draft, setDraft] = React.useState<Draft>(() => (hero ? { name: hero.name, tagline: hero.tagline, tier: hero.tier, emblem: hero.emblem_key } : blank));
  const [art, setArt] = React.useState<File | null>(null);
  const [artUrl, setArtUrl] = React.useState<string | null>(hero?.art_url ?? null);
  const [artError, setArtError] = React.useState<string | null>(null);
  const [dropArt, setDropArt] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();
  const locked = hero ? isRevealed(hero) : false;
  const input: HeroInput = { name: draft.name.trim(), tagline: draft.tagline.trim(), tier: draft.tier, emblem_key: draft.emblem };
  const problems = heroProblems(input, hero);
  const blocked = Object.keys(problems).length > 0 || Boolean(artError);

  React.useEffect(
    () => () => {
      if (artUrl?.startsWith("blob:")) URL.revokeObjectURL(artUrl);
    },
    [artUrl],
  );

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const why = await checkArt(file, measure);
    if (why) {
      setArtError(why);
      return;
    }
    setArtError(null);
    setArt(file);
    setDropArt(false);
    setArtUrl(URL.createObjectURL(file));
  };

  const submit = async () => {
    if (blocked) return;
    try {
      await save.mutateAsync({ heroId: hero?.id ?? null, body: input, art });
      toast.success(hero ? "Hero saved" : "Hero added");
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const shown = dropArt ? null : artUrl;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{hero ? `Edit ${hero.name || "hero"}` : "Add a hero"}</DialogTitle>
          <DialogDescription>Players see this card when they reveal or collect it. The preview is what it will look like.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid content-start gap-3.5">
            <div>
              <label htmlFor={`${id}-name`} className="eyebrow mb-1.5 block">
                Name
              </label>
              <input id={`${id}-name`} className="input" value={draft.name} maxLength={HERO_NAME_MAX + 10} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              <p className={cn("mt-1 text-[11.5px]", problems.name ? "text-refuse" : "text-ink-3")}>{problems.name ?? `${draft.name.trim().length} of ${HERO_NAME_MAX}.`}</p>
            </div>
            <div>
              <label htmlFor={`${id}-tag`} className="eyebrow mb-1.5 block">
                Tagline
              </label>
              <input id={`${id}-tag`} className="input" value={draft.tagline} maxLength={HERO_TAGLINE_MAX + 10} onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))} />
              <p className={cn("mt-1 text-[11.5px]", problems.tagline ? "text-refuse" : "text-ink-3")}>{problems.tagline ?? `${draft.tagline.trim().length} of ${HERO_TAGLINE_MAX}.`}</p>
            </div>
            <div>
              <label htmlFor={`${id}-tier`} className="eyebrow mb-1.5 block">
                Tier
              </label>
              <NativeSelect id={`${id}-tier`} value={draft.tier} disabled={locked} onChange={(e) => setDraft((d) => ({ ...d, tier: e.target.value as Tier }))} className="w-auto">
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABEL[t]}
                  </option>
                ))}
              </NativeSelect>
              <p className={cn("mt-1 text-[11.5px]", problems.tier ? "text-refuse" : "text-ink-3")}>
                {locked ? "Someone has revealed this hero, so its tier can't change." : "Rarer tiers get fewer heroes."}
              </p>
            </div>
            <div>
              <span className="eyebrow mb-1.5 block">Picture</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label="Hero picture file"
                  onChange={(e) => {
                    void pick(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                  <ImagePlusIcon /> {shown ? "Change picture" : "Upload picture"}
                </Button>
                {shown ? (
                  <Button type="button" variant="ghost" onClick={() => (setArt(null), setDropArt(true), setArtError(null))}>
                    <XIcon /> Use an emblem
                  </Button>
                ) : null}
              </div>
              <p role={artError ? "alert" : undefined} className={cn("mt-1 text-[11.5px] leading-[1.5]", artError ? "text-refuse" : "text-ink-3")}>
                {artError ?? "PNG, JPG or WebP, portrait 3:4, at least 900 × 1200, up to 5 MB. Or pick an emblem."}
              </p>
              {!shown ? (
                <div role="radiogroup" aria-label="Emblem" className="mt-2 flex flex-wrap gap-1.5">
                  {EMBLEMS.map((e) => (
                    <button
                      key={e.key}
                      type="button"
                      role="radio"
                      aria-checked={draft.emblem === e.key}
                      onClick={() => setDraft((d) => ({ ...d, emblem: e.key }))}
                      className={cn("rounded-full border px-2.5 py-1 text-[12px]", draft.emblem === e.key ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-2")}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="grid content-start justify-items-center gap-2">
            <span className="eyebrow">Preview</span>
            <HeroCard hero={{ name: draft.name, tagline: draft.tagline, tier: draft.tier, art_url: shown, emblem_key: draft.emblem, number: hero?.number ?? null }} theme={theme} size="lg" />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={blocked || save.isPending}>
              {save.isPending ? "Saving…" : hero ? "Save hero" : "Add hero"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DesignerPanel({ eventId, canEdit, locked, theme }: { eventId: number; canEdit: boolean; locked: boolean; theme: ThemeKey }) {
  const heroes = useHeroes(eventId);
  const config = useCardConfig(eventId);
  const order = useOrderHeroes(eventId);
  const remove = useDeleteHero(eventId);
  const [editing, setEditing] = React.useState<Hero | "new" | null>(null);
  const [removing, setRemoving] = React.useState<Hero | null>(null);
  const editable = canEdit && !locked;
  const list = heroes.data ?? [];
  const ids = list.map((h) => h.id);
  const gaps = config.data ? deckGaps(list, config.data.shares) : list.length ? deckGaps(list, { common: 0, uncommon: 0, rare: 0, legendary: 0 }) : [];

  return (
    <div className="flex flex-col gap-3.5">
      <GameGateNotice kind="cards" eventId={eventId} />
      <FigurePanel className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
          <span className="min-w-0">
            <span className="text-ink block text-[15px] font-semibold">Card designer</span>
            <span className="text-ink-3 mt-0.5 block text-[12.5px] leading-[1.5]">
              {plural(list.length, "hero")} of 4 to {HEROES_MAX}. A hero someone has revealed can be renamed or get new art, but not deleted or moved to another tier.
            </span>
          </span>
          {editable ? (
            <Button onClick={() => setEditing("new")} disabled={list.length >= HEROES_MAX}>
              <PlusIcon /> Add a hero
            </Button>
          ) : null}
        </div>
        {gaps.length && editable ? (
          <div className="px-4 pb-4">
            <Notice tone="caution" tag="Set up">
              <ul className="grid gap-0.5">
                {gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </Notice>
          </div>
        ) : null}
        <div className="border-line-soft border-t p-4">
          {heroes.isPending ? (
            <Skeleton className="h-52 rounded-2xl" />
          ) : !list.length ? (
            <p className="text-ink-3 m-0 text-[13px]">No heroes yet. Add at least four to start.</p>
          ) : (
            <ul className="m-0 flex list-none flex-wrap gap-4 p-0" aria-label="Heroes">
              {list.map((h, i) => {
                const revealed = isRevealed(h);
                return (
                  <li key={h.id} className="grid justify-items-center gap-2" data-hero={h.id}>
                    <HeroCard hero={h} theme={theme} size="md" />
                    <div className="flex items-center gap-1">
                      {editable ? (
                        <>
                          <Button size="xs" variant="ghost" aria-label={`Move ${h.name} earlier`} disabled={i === 0 || order.isPending} onClick={() => order.mutate(moved(ids, h.id, -1) ?? ids)}>
                            <ArrowUpIcon />
                          </Button>
                          <Button size="xs" variant="ghost" aria-label={`Move ${h.name} later`} disabled={i === list.length - 1 || order.isPending} onClick={() => order.mutate(moved(ids, h.id, 1) ?? ids)}>
                            <ArrowDownIcon />
                          </Button>
                        </>
                      ) : null}
                      {editable ? (
                        <Button size="xs" variant="secondary" aria-label={`Edit ${h.name}`} onClick={() => setEditing(h)}>
                          <PencilIcon /> Edit
                        </Button>
                      ) : null}
                      {editable ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-refuse"
                          aria-label={`Delete ${h.name}`}
                          disabled={revealed || list.length <= 4}
                          title={revealed ? "Someone has revealed this hero, so it can't be deleted." : list.length <= 4 ? "A deck needs at least 4 heroes." : undefined}
                          onClick={() => setRemoving(h)}
                        >
                          <Trash2Icon />
                        </Button>
                      ) : null}
                    </div>
                    {revealed ? <span className="text-ink-3 text-[11px]">Revealed by {h.reveals ?? h.holders}: tier is locked</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </FigurePanel>

      {editing ? <HeroEditor key={editing === "new" ? "new" : editing.id} eventId={eventId} hero={editing === "new" ? null : editing} theme={theme} onClose={() => setEditing(null)} /> : null}

      <AlertDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {removing?.name || "this hero"}?</AlertDialogTitle>
            <AlertDialogDescription>Nobody has revealed it. The card is removed from the deck and the others are renumbered.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                if (removing) remove.mutate(removing.id, { onSuccess: () => setRemoving(null) });
              }}
            >
              Delete hero
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
