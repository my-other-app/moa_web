import { GALLERY_PREFIX, SECTION_WORDS, TITLE_MAX, type Layout, type LayoutPatch, type Site, type SiteImage, type SiteTemplate, type SlotMeta } from "./schemas";

/*
 * The site's layout, worked out the way the server keeps it (the contract's
 * PATCH rules), so the editor shows what the page will be before it is saved:
 *
 * - `order` is a permutation of the template's movable sections: keys it
 *   lacks are dropped, its sections missing from the order are appended in
 *   their default order;
 * - `hidden` only names sections the template lets be hidden;
 * - `titles` are trimmed, at most 60 characters, and only for its sections
 *   (an empty one, or the template's own, is no override);
 * - `slots` only name its slots and the club's own photos.
 *
 * The editor's draft keeps every key it has seen (`mergeLayout`), so a
 * template tried and left again keeps what was set for it.
 */

export const EMPTY_LAYOUT: Layout = { order: [], hidden: [], titles: {}, slots: {}, accent: null };

/** The photo library in its order: position, then the order they came in. */
export function sortImages(images: readonly SiteImage[]): SiteImage[] {
  return [...images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
}

/** The layout as `template` keeps it, its photos limited to `imageIds` when given. */
export function layoutFor(template: SiteTemplate | undefined, layout: Layout, imageIds?: ReadonlySet<number>): Layout {
  const movable = template?.sections ?? [];
  const known = new Set(movable.map((s) => s.key));
  const order: string[] = [];
  for (const k of layout.order) if (known.has(k) && !order.includes(k)) order.push(k);
  for (const s of movable) if (!order.includes(s.key)) order.push(s.key);
  const hideable = new Set(movable.filter((s) => s.hideable !== false).map((s) => s.key));
  const hidden = order.filter((k) => hideable.has(k) && layout.hidden.includes(k));
  const titles: Record<string, string> = {};
  for (const s of movable) {
    const t = (layout.titles[s.key] ?? "").trim().slice(0, TITLE_MAX);
    if (t && t !== (s.default_title ?? s.label)) titles[s.key] = t;
  }
  const slots: Record<string, number> = {};
  for (const s of template?.slots ?? []) {
    const id = layout.slots[s.key];
    if (typeof id === "number" && (!imageIds || imageIds.has(id))) slots[s.key] = id;
  }
  return { order, hidden, titles, slots, accent: layout.accent ?? null };
}

/**
 * `next` (an edit made in `template`) written over the draft's `union`:
 * what other templates had (their sections, their slots) stays.
 */
export function mergeLayout(union: Layout, template: SiteTemplate | undefined, next: Layout): Layout {
  const own = new Set((template?.sections ?? []).map((s) => s.key));
  const ownSlots = new Set((template?.slots ?? []).map((s) => s.key));
  const keep = <T>(o: Record<string, T>, mine: Set<string>) => Object.fromEntries(Object.entries(o).filter(([k]) => !mine.has(k)));
  return {
    order: [...next.order, ...union.order.filter((k) => !own.has(k) && !next.order.includes(k))],
    hidden: [...next.hidden, ...union.hidden.filter((k) => !own.has(k) && !next.hidden.includes(k))],
    titles: { ...keep(union.titles, own), ...next.titles },
    slots: { ...keep(union.slots, ownSlots), ...next.slots },
    accent: next.accent,
  };
}

/**
 * `now` as a PATCH body against `saved` (both as the template keeps them):
 * the server merges titles and slots by key, so one cleared since is sent
 * as null.
 */
export function layoutPatch(saved: Layout, now: Layout): LayoutPatch {
  const titles: Record<string, string | null> = { ...now.titles };
  for (const k of Object.keys(saved.titles)) if (!(k in now.titles)) titles[k] = null;
  const slots: Record<string, number | null> = { ...now.slots };
  for (const k of Object.keys(saved.slots)) if (!(k in now.slots)) slots[k] = null;
  return { order: now.order, hidden: now.hidden, titles, slots, accent: now.accent };
}

/** Two layouts that make the same page (keys in any order). */
export function sameLayout(a: Layout, b: Layout): boolean {
  const rec = (o: Record<string, unknown>) => JSON.stringify(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));
  return (
    a.order.join("|") === b.order.join("|") &&
    [...a.hidden].sort().join("|") === [...b.hidden].sort().join("|") &&
    rec(a.titles) === rec(b.titles) &&
    rec(a.slots) === rec(b.slots) &&
    (a.accent ?? null)?.toLowerCase() === (b.accent ?? null)?.toLowerCase()
  );
}

/** The list with the item at `from` moved to `to` (clamped); the same list when nothing moves. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (from === target || from < 0 || from >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item as T);
  return next;
}

/** A gallery slot's place (photos.3 → 3); null for any other slot. */
export function galleryIndex(key: string): number | null {
  if (!key.startsWith(GALLERY_PREFIX)) return null;
  const n = Number(key.slice(GALLERY_PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

const SLOT_WORDS: Record<string, string> = {
  "hero.cover": "Cover photo",
  "hero.image": "Hero image",
  "about.image": "About image",
  "join.image": "Join image",
  "event.fallback": "Event banner fallback",
};

/** What a slot is called: the template's label, else a word for its key. */
export function slotLabel(template: SiteTemplate | undefined, key: string): string {
  const own = template?.slots?.find((s) => s.key === key)?.label;
  if (own) return own;
  const g = galleryIndex(key);
  return g !== null ? `Photo ${g}` : (SLOT_WORDS[key] ?? key);
}

/** "1440 × 300", the size a slot is drawn at. */
export function sizeHint(slot: SlotMeta): string | null {
  return slot.size ? `${slot.size[0]} × ${slot.size[1]}` : null;
}

export interface SlotFill {
  image: SiteImage | null;
  /** Filled from the library because nothing was chosen for it (gallery slots only). */
  auto: boolean;
}

/**
 * What each of the template's slots shows: the photo chosen for it, or, for
 * a gallery slot left empty, the next library photo (in library order) that
 * no slot of this template already shows. Mirrors the server's fill.
 */
export function slotFills(template: SiteTemplate | undefined, layout: Layout, images: readonly SiteImage[]): Record<string, SlotFill> {
  const byId = new Map(images.map((i) => [i.id, i]));
  const slots = template?.slots ?? [];
  const out: Record<string, SlotFill> = {};
  const used = new Set<number>();
  for (const s of slots) {
    const img = byId.get(layout.slots[s.key] ?? -1) ?? null;
    out[s.key] = { image: img, auto: false };
    if (img) used.add(img.id);
  }
  const pool = sortImages(images).filter((i) => !used.has(i.id));
  const gallery = slots.filter((s) => galleryIndex(s.key) !== null).sort((a, b) => (galleryIndex(a.key) ?? 0) - (galleryIndex(b.key) ?? 0));
  for (const s of gallery) {
    if (out[s.key]?.image) continue;
    const next = pool.shift();
    out[s.key] = { image: next ?? null, auto: !!next };
  }
  return out;
}

/**
 * Where each photo shows on the page, in words ("Cover photo", "Photo 2"):
 * chosen for a place or filling the gallery, by the draft's layout.
 */
export function placesByImage(template: SiteTemplate | undefined, layout: Layout, images: readonly SiteImage[]): Map<number, string[]> {
  const fills = slotFills(template, layout, images);
  const out = new Map<number, string[]>();
  for (const s of template?.slots ?? []) {
    const id = fills[s.key]?.image?.id;
    if (id !== undefined) out.set(id, [...(out.get(id) ?? []), s.label]);
  }
  return out;
}

/** "Cover photo", "Cover photo and Photo 2", "A, B and C". */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** A section's name in the editor: the template's label, else a word for the key. */
export function sectionWord(template: SiteTemplate | undefined, key: string): string {
  return template?.sections?.find((s) => s.key === key)?.label ?? SECTION_WORDS[key] ?? key;
}

/** The template the site (or the draft) uses. */
export function templateOf(site: Site, key: string): SiteTemplate | undefined {
  return site.templates.find((t) => t.key === key);
}

/** A trimmed line, or null for an empty one (the server keeps it so). */
export function line(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t || null;
}
