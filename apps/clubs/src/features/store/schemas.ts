import { z } from "zod";

export const ROLES = [
  { value: "attendee", label: "Attendees" },
  { value: "speaker", label: "Speakers & mentors" },
  { value: "staff", label: "Volunteers" },
] as const;
export type Role = (typeof ROLES)[number]["value"];
export const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

export const variantSchema = z.object({ id: z.string(), label: z.string(), stock: z.number(), sold: z.number(), left: z.number() });

export const storeItemSchema = z.object({
  id: z.string(),
  event_id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  photo_key: z.string().nullable(),
  photo_url: z.string().nullable(),
  price: z.number(),
  stock: z.number().nullable(),
  sold: z.number(),
  total: z.number(),
  left: z.number(),
  earned: z.number(),
  available_roles: z.array(z.string()).nullable(),
  free_roles: z.array(z.string()),
  on_sale: z.boolean(),
  sold_out: z.boolean(),
  sort_order: z.number(),
  variants: z.array(variantSchema),
  created_at: z.string(),
});
export type StoreItem = z.infer<typeof storeItemSchema>;

export const lineSchema = z.object({ item_id: z.string(), item_name: z.string(), variant_label: z.string().nullable(), qty: z.number(), unit_price: z.number(), line_total: z.number(), is_free: z.boolean() });
export const orderSchema = z.object({
  id: z.string(),
  registration_id: z.string(),
  guest: z.string(),
  ticket_id: z.string().nullable(),
  status: z.string(),
  total: z.number(),
  lines: z.array(lineSchema),
  summary: z.string(),
  paid_at: z.string().nullable(),
  handed_over_at: z.string().nullable(),
  created_at: z.string(),
});
export type StoreOrder = z.infer<typeof orderSchema>;
export const ordersPageSchema = z.object({ items: z.array(orderSchema), total: z.number(), page: z.number(), page_size: z.number() });

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
  sizes: z.array(z.object({ label: z.string(), sold: z.number() })),
  sizes_item: z.string().nullable(),
  latest_orders: z.array(orderSchema),
});
export type StoreSummary = z.infer<typeof summarySchema>;

export const itemFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name the item").max(120),
    price: z.coerce.number({ message: "Enter the price" }).min(0, "The price cannot be negative").max(99_999_999.99),
    stock: z.union([z.literal(""), z.coerce.number().int().min(0, "Stock cannot be negative")]),
    variants: z.string().trim(),
    available_roles: z.array(z.string()),
    free_roles: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    const sizes = v.variants ? v.variants.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (sizes.length === 0 && v.stock === "") ctx.addIssue({ code: "custom", path: ["stock"], message: "Give it a stock, or sizes with a stock each" });
    if (sizes.length > 0 && new Set(sizes.map((s) => s.toLowerCase())).size !== sizes.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "Two sizes have the same label" });
  });
export type ItemForm = z.infer<typeof itemFormSchema>;

/** "All ticket types · free with Professional" → our roles, in the same spirit. */
export function audienceLine(item: StoreItem): string {
  const who = item.available_roles && item.available_roles.length > 0 ? `Only ${item.available_roles.map(roleLabel).join(", ")}` : "Everyone";
  const free = item.free_roles.length > 0 ? ` · free for ${item.free_roles.map(roleLabel).join(", ")}` : "";
  return who + free;
}
