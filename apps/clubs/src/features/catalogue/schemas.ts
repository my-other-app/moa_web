import { z } from "zod";

import { IMAGE_FORMATS_LABEL, isPicture } from "@/lib/images";

/**
 * The club's merchandise catalogue: items made once, under the club, and
 * offered on as many events as it likes. Stock is the club's, shared by
 * every event that offers an item, so "left" and "sold" here are club-wide.
 */

/** Who may buy an item, and who gets it free: the roles a registration carries. */
export const ROLES = [
  { value: "attendee", label: "Attendees" },
  { value: "speaker", label: "Speakers & mentors" },
  { value: "staff", label: "Volunteers" },
] as const;
export type Role = (typeof ROLES)[number]["value"];
export const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

/** "Everyone · free for Speakers & mentors", "Only Attendees, Volunteers". */
export function audienceLine(item: { available_roles: string[] | null; free_roles: string[] }): string {
  const who = item.available_roles && item.available_roles.length > 0 ? `Only ${item.available_roles.map(roleLabel).join(", ")}` : "Everyone";
  const free = item.free_roles.length > 0 ? ` · free for ${item.free_roles.map(roleLabel).join(", ")}` : "";
  return who + free;
}

export const catalogueVariantSchema = z.object({
  id: z.string(),
  label: z.string(),
  stock: z.number(),
  sold: z.number(),
  /** Held for checkouts not paid yet; they come back if the hold runs out. */
  held: z.number().catch(0),
  left: z.number(),
});

/** An event that offers the item. */
export const offeringEventSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  slug: z.string().nullish(),
  event_datetime: z.string().nullish(),
});
export type OfferingEvent = z.infer<typeof offeringEventSchema>;

export const clubStoreItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish().transform((v) => v ?? null),
  photo_url: z.string().nullish().transform((v) => v ?? null),
  photo_key: z.string().nullish().transform((v) => v ?? null),
  // A Decimal on the server; coerced so a string price still reads.
  price: z.coerce.number(),
  stock: z.number().nullable(),
  variants: z.array(catalogueVariantSchema),
  available_roles: z.array(z.string()).nullable(),
  free_roles: z.array(z.string()),
  on_sale: z.boolean(),
  sort_order: z.number().catch(0),
  sold: z.number(),
  held: z.number().catch(0),
  left: z.number(),
  earned: z.coerce.number(),
  events: z.array(offeringEventSchema).catch([]),
});
export type ClubStoreItem = z.infer<typeof clubStoreItemSchema>;

export const clubStoreSchema = z.object({ items: z.array(clubStoreItemSchema) });

/** What an event offers, in the order its registration page shows them. */
export const offersSchema = z.object({ merch_enabled: z.boolean(), item_ids: z.array(z.string()) });

export const photoUploadSchema = z.object({ key: z.string(), url: z.string() });

/** Why a picked file will not do, before it is sent; null when it will. Any
 *  picture will: one POST /clubs/store/photo does not keep (an SVG, a HEIC,
 *  an AVIF...) is converted, and a big one redrawn smaller, before it goes
 *  (lib/images). */
export function photoProblem(file: File): string | null {
  if (!isPicture(file)) return `Choose a picture: ${IMAGE_FORMATS_LABEL}`;
  return null;
}

/** The most sizes an item takes, and the longest label, as the server holds them. */
export const MAX_SIZES = 20;

/** What is wrong with a count as typed (blank is a separate question), or null. */
function countProblem(v: string): string | null {
  if (v === "") return null;
  if (!/^\d+$/.test(v)) return "A whole number, 0 or more";
  return Number(v) > 1_000_000 ? "Up to 1,000,000" : null;
}

/** What the sheet holds while it is being filled in: text, as typed. */
export interface CatalogueDraft {
  name: string;
  description: string;
  price: string;
  sized: boolean;
  stock: string;
  sizes: { label: string; stock: string }[];
  available_roles: string[];
  free_roles: string[];
  on_sale: boolean;
}

/**
 * The create and edit sheet. Stock is one number, or one per size.
 *
 * Every field stays text until the end and is checked in one pass, so a
 * blank name, a bad price and a missing stock are all said at once (a
 * field-level transform that failed would stop the checks after it).
 */
export const catalogueFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name the item").max(120, "Keep the name to 120 characters"),
    description: z.string().trim().max(300, "Keep the description to 300 characters"),
    price: z.string().trim(),
    photo_key: z.string().nullable(),
    sized: z.boolean(),
    stock: z.string().trim(),
    sizes: z.array(z.object({ label: z.string().trim().max(40, "Keep a size to 40 characters"), stock: z.string().trim() })).max(MAX_SIZES, `Up to ${MAX_SIZES} sizes`),
    available_roles: z.array(z.string()),
    free_roles: z.array(z.string()),
    on_sale: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const say = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    if (v.price === "") say(["price"], "Enter the price");
    else if (!/^\d+(\.\d{1,2})?$/.test(v.price)) say(["price"], "A price like 450 or 450.50");
    else if (Number(v.price) > 99_999_999.99) say(["price"], "That price is too high");
    if (!v.sized) {
      if (v.stock === "") say(["stock"], "How many are there?");
      else if (countProblem(v.stock)) say(["stock"], countProblem(v.stock)!);
      return;
    }
    const rows = v.sizes.map((s, i) => ({ ...s, i })).filter((s) => s.label !== "" || s.stock !== "");
    if (rows.length === 0) say(["sizes"], "Add at least one size");
    for (const s of rows) {
      if (s.label === "") say(["sizes", s.i, "label"], "Name the size");
      if (s.stock === "") say(["sizes", s.i, "stock"], "How many?");
      else if (countProblem(s.stock)) say(["sizes", s.i, "stock"], countProblem(s.stock)!);
    }
    const labels = rows.map((s) => s.label.toLowerCase()).filter(Boolean);
    if (new Set(labels).size !== labels.length) say(["sizes"], "Two sizes have the same label");
  })
  .transform((v) => ({
    ...v,
    price: Number(v.price),
    stock: v.stock === "" ? ("" as const) : Number(v.stock),
    sizes: v.sizes.map((s) => ({ label: s.label, stock: s.stock === "" ? ("" as const) : Number(s.stock) })),
  }));
export type CatalogueForm = z.output<typeof catalogueFormSchema>;

export const emptyCatalogueForm: CatalogueDraft = {
  name: "",
  description: "",
  price: "",
  sized: false,
  stock: "",
  sizes: [
    { label: "S", stock: "" },
    { label: "M", stock: "" },
    { label: "L", stock: "" },
  ],
  available_roles: [],
  free_roles: [],
  on_sale: true,
};

/** An item as the sheet edits it. */
export function formFromItem(item: ClubStoreItem): CatalogueDraft {
  const sized = item.variants.length > 0;
  return {
    name: item.name,
    description: item.description ?? "",
    price: String(item.price),
    sized,
    stock: sized ? "" : String(item.stock ?? 0),
    sizes: sized ? item.variants.map((v) => ({ label: v.label, stock: String(v.stock) })) : emptyCatalogueForm.sizes,
    available_roles: item.available_roles ?? [],
    free_roles: item.free_roles,
    on_sale: item.on_sale,
  };
}

const sizesOf = (form: CatalogueForm) => form.sizes.filter((s) => s.label !== "").map((s) => ({ label: s.label, stock: s.stock === "" ? 0 : s.stock }));

/** POST /clubs/store: one stock, or sizes with a stock each, never both. */
export function createBody(form: CatalogueForm) {
  return {
    name: form.name,
    description: form.description || null,
    photo_key: form.photo_key,
    price: form.price,
    ...(form.sized ? { variants: sizesOf(form) } : { stock: form.stock === "" ? 0 : form.stock }),
    // Nobody picked means everyone: the server reads null as no restriction.
    available_roles: form.available_roles.length > 0 ? form.available_roles : null,
    free_roles: form.free_roles,
    on_sale: form.on_sale,
  };
}

/**
 * PATCH /clubs/store/{id}: only what changed. Sizes are matched by label on
 * the server, so the whole list goes when any of it changed; dropping the
 * sizes for one stock sends `variants: []` with the stock, which is how the
 * server takes them away.
 */
export function patchBody(item: ClubStoreItem, form: CatalogueForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (form.name !== item.name) patch.name = form.name;
  if ((form.description || null) !== (item.description || null)) patch.description = form.description || null;
  if (form.price !== item.price) patch.price = form.price;
  if (form.photo_key !== item.photo_key) patch.photo_key = form.photo_key;
  if (form.on_sale !== item.on_sale) patch.on_sale = form.on_sale;
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  if (!same(form.available_roles, item.available_roles ?? [])) patch.available_roles = form.available_roles.length > 0 ? form.available_roles : null;
  if (!same(form.free_roles, item.free_roles)) patch.free_roles = form.free_roles;
  if (form.sized) {
    const next = sizesOf(form);
    const was = item.variants.map((v) => ({ label: v.label, stock: v.stock }));
    if (JSON.stringify(next) !== JSON.stringify(was)) patch.variants = next;
  } else {
    const stock = form.stock === "" ? 0 : form.stock;
    if (item.variants.length > 0) {
      patch.variants = [];
      patch.stock = stock;
    } else if (stock !== item.stock) patch.stock = stock;
  }
  return patch;
}

export const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** "₹450", or "Free" for an item given away. */
export const priceLabel = (price: number) => (price > 0 ? INR.format(price) : "Free");

/** What is left, as a line: "12 left", "S 4 · M 0 · L 9", "Sold out". */
export function leftLine(item: Pick<ClubStoreItem, "left" | "variants">): string {
  if (item.variants.length > 0) return item.variants.map((v) => `${v.label} ${v.left}`).join(" · ");
  return item.left > 0 ? `${item.left} left` : "Sold out";
}

/** "On 3 events", "On 1 event", "Not on an event yet". */
export function eventsLine(events: OfferingEvent[]): string {
  if (events.length === 0) return "Not on an event yet";
  return `On ${events.length} ${events.length === 1 ? "event" : "events"}`;
}

/** "Hack Night, Demo Day and Orientation". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
