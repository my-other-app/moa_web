import { z } from "zod";

/**
 * The admin WhatsApp inbox for MyOtherApp's own number
 * (GET/POST /api/v1/admin/whatsapp/inbox…). Read leniently: a field the API
 * leaves out or sends oddly is null, never a crash.
 */

export const canSendSchema = z.object({
  text: z.boolean().catch(false),
  template: z.boolean().catch(false),
  window_expires_at: z.string().nullish().catch(null),
  reason: z.string().catch(""),
});
export type CanSend = z.infer<typeof canSendSchema>;

const aboutSchema = z
  .object({
    event_id: z.number().nullish().catch(null),
    event_name: z.string().nullish().catch(null),
    club_id: z.number().nullish().catch(null),
    club_name: z.string().nullish().catch(null),
  })
  .catch({ event_id: null, event_name: null, club_id: null, club_name: null });

export const conversationSchema = z.object({
  id: z.number(),
  wa_id: z.string().nullish().catch(null),
  phone: z.string().nullish().catch(null),
  name: z.string().catch("WhatsApp user"),
  username: z.string().nullish().catch(null),
  last_message_at: z.string().nullish().catch(null),
  last_inbound_at: z.string().nullish().catch(null),
  last_preview: z.string().nullish().catch(null),
  last_direction: z.string().nullish().catch(null),
  unread_count: z.coerce.number().catch(0),
  about: aboutSchema,
  opted_out: z.boolean().catch(false),
  can_send: canSendSchema.catch({ text: false, template: false, window_expires_at: null, reason: "" }),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const unreadSchema = z.object({
  unread_conversations: z.coerce.number().catch(0),
  unread_messages: z.coerce.number().catch(0),
});
export type Unread = z.infer<typeof unreadSchema>;

export const conversationsSchema = z
  .object({
    items: z.array(z.unknown()).catch([]),
    total: z.coerce.number().catch(0),
    page: z.coerce.number().catch(1),
    page_size: z.coerce.number().catch(30),
  })
  .merge(unreadSchema)
  .transform((p) => ({
    ...p,
    items: p.items.flatMap((i) => {
      const r = conversationSchema.safeParse(i);
      return r.success ? [r.data] : [];
    }),
  }));
export type ConversationsPage = z.infer<typeof conversationsSchema>;

export const labelSchema = z
  .object({
    event_id: z.number().nullish().catch(null),
    event_name: z.string().nullish().catch(null),
    club_id: z.number().nullish().catch(null),
    club_name: z.string().nullish().catch(null),
    kind: z.string().catch(""),
    kind_label: z.string().catch(""),
  })
  .nullish()
  .catch(null);
export type Label = z.infer<typeof labelSchema>;

export const messageSchema = z.object({
  id: z.string(),
  direction: z.enum(["in", "out"]).catch("in"),
  type: z.string().catch("text"),
  body: z.string().nullish().catch(null),
  at: z.string().nullish().catch(null),
  status: z.string().catch(""),
  error: z.string().nullish().catch(null),
  template_name: z.string().nullish().catch(null),
  media: z.object({ mime: z.string().nullish(), filename: z.string().nullish() }).nullish().catch(null),
  automatic: z.boolean().catch(false),
  sent_by: z.string().nullish().catch(null),
  label: labelSchema,
  probably_about: labelSchema,
});
export type Message = z.infer<typeof messageSchema>;

export const threadSchema = z.object({
  items: z.array(messageSchema).catch([]),
  next_before: z.string().nullish().catch(null),
  conversation: conversationSchema,
});
export type ThreadPage = z.infer<typeof threadSchema>;

export const templateSchema = z.object({
  name: z.string(),
  label: z.string().catch(""),
  purpose: z.string().nullish().catch(null),
  params: z.array(z.string()).catch([]),
});
export type ManualTemplate = z.infer<typeof templateSchema>;
export const templatesSchema = z.object({ templates: z.array(templateSchema).catch([]) });

export const replySchema = z.object({ message: messageSchema, can_send: canSendSchema });

/** "DevFest x CCD 2026 · GDG Cloud Trivandrum · Ticket": what an outbound message was about. */
export function labelText(label: Label | undefined): string {
  if (!label) return "";
  return [label.event_name, label.club_name, label.kind_label].filter(Boolean).join(" · ");
}

/** What each template value is called in the composer. */
export const PARAM_LABEL: Record<string, string> = {
  name: "Their name",
  event: "Event",
  when: "Date and time",
  venue: "Venue",
  ticket_id: "Ticket ID",
  amount: "Amount (₹)",
  slug: "Event's web address name",
  club: "Club",
  update: "The update",
};

/** "3 h 12 min left" until the window closes, or null once it has. */
export function windowLeft(expiresAt: string | null | undefined, now: Date): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!(ms > 0)) return null;
  const minutes = Math.ceil(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min left` : `${m} min left`;
}
