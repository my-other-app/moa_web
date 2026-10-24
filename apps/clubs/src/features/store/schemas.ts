import { z } from "zod";

/**
 * An event's Merchandise tab: the club's items this event offers, what they
 * sold here, and the orders. The items themselves (price, stock, photo, who
 * may buy) are the club's and are changed on the Merchandise page.
 */
export { ROLES, roleLabel, audienceLine, type Role } from "@/features/catalogue/schemas";

export const variantSchema = z.object({ id: z.string(), label: z.string(), stock: z.number(), sold: z.number(), held: z.number().catch(0), left: z.number() });

/**
 * An item as this event sees it: `sold` and `earned` are this event's, and
 * `left` is the club's, shared by every event that offers the item. The
 * fields only the per-event shelf had are optional, for the club-level one.
 */
export const storeItemSchema = z.object({
  id: z.string(),
  event_id: z.number().nullish(),
  name: z.string(),
  description: z.string().nullish().transform((v) => v ?? null),
  photo_key: z.string().nullish().transform((v) => v ?? null),
  photo_url: z.string().nullish().transform((v) => v ?? null),
  price: z.coerce.number(),
  stock: z.number().nullable(),
  sold: z.number(),
  held: z.number().catch(0),
  total: z.number().nullish(),
  left: z.number(),
  earned: z.coerce.number(),
  available_roles: z.array(z.string()).nullable(),
  free_roles: z.array(z.string()),
  on_sale: z.boolean(),
  sold_out: z.boolean().optional(),
  sort_order: z.number().catch(0),
  variants: z.array(variantSchema),
  created_at: z.string().nullish(),
});
export type StoreItem = z.infer<typeof storeItemSchema>;

/** Nothing left anywhere: of the item, or of every size. */
export const isSoldOut = (item: StoreItem) => item.sold_out ?? (item.variants.length > 0 ? item.variants.every((v) => v.left <= 0) : item.left <= 0);

export const lineSchema = z.object({ item_id: z.string(), item_name: z.string(), variant_label: z.string().nullable(), qty: z.number(), unit_price: z.number(), line_total: z.number(), is_free: z.boolean() });
export const orderSchema = z.object({
  id: z.string(),
  registration_id: z.string(),
  guest: z.string(),
  ticket_id: z.string().nullable(),
  /** pending | paid | cancelled | refunded | oversold */
  status: z.string(),
  total: z.number(),
  lines: z.array(lineSchema),
  summary: z.string(),
  paid_at: z.string().nullable(),
  handed_over_at: z.string().nullable(),
  created_at: z.string(),
});
export const ordersPageSchema = z.object({ items: z.array(orderSchema), total: z.number(), page: z.number(), page_size: z.number() });

/**
 * The orders list's filter, as the server takes `status`. Oversold is an
 * order paid for when its pieces had gone: it cannot be handed over until
 * it is settled (stock raised, then `fulfil`) or refunded.
 */
export const ORDER_FILTERS = [
  { value: "", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "oversold", label: "Oversold" },
  { value: "refunded", label: "Refunded" },
] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number]["value"];

export const summarySchema = z.object({
  enabled: z.boolean(),
  items_total: z.number(),
  items_on_sale: z.number(),
  sold_out: z.number(),
  units_sold: z.number(),
  orders_paid: z.number(),
  revenue: z.number(),
  ticket_revenue: z.number(),
  to_hand_over: z.number(),
  /** Paid for when the pieces had gone; settled by handing over after all, or refunded. */
  oversold: z.number().catch(0),
  sizes: z.array(z.object({ label: z.string(), sold: z.number() })),
  sizes_item: z.string().nullable(),
  latest_orders: z.array(orderSchema),
});
export type StoreSummary = z.infer<typeof summarySchema>;
