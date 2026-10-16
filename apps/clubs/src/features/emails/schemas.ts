import { z } from "zod";

/**
 * The email contract, as the server speaks it (camelCase on the wire). A
 * design is a theme and an ordered list of blocks; a template wraps a design
 * with its subject, audience, attachments and timer.
 */
export const EMAIL_STAGES = ["INVITE", "PRE_EVENT", "REMINDER", "POST_EVENT", "CUSTOM"] as const;
export type EmailStage = (typeof EMAIL_STAGES)[number];
export const JOURNEY_STAGES = ["INVITE", "PRE_EVENT", "REMINDER", "POST_EVENT"] as const;

export const STAGE_META: Record<EmailStage, { label: string; note: string }> = {
  INVITE: { label: "Invite", note: "The ticket email. Goes out with the ticket, once it is switched on here." },
  PRE_EVENT: { label: "Pre-event", note: "The day before: venue, what to bring." },
  REMINDER: { label: "Reminder", note: "As the doors open, to guests not yet inside." },
  POST_EVENT: { label: "Post-event", note: "After the close: thanks, the certificate, what is next." },
  CUSTOM: { label: "Custom", note: "Any other email, sent by hand or on a timer." },
};

export const DEFAULT_FOOTER = "{{org_name}}{% if organiser_email %} · {{organiser_email}}{% endif %}";

/** The tokens an email knows beyond the ticket's. */
export const EMAIL_TOKEN_KEYS: ReadonlySet<string> = new Set([
  "ticket_url",
  "certificate_url",
  "organiser_email",
  "event_start",
  "doors_in",
]);

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, like #1db9a0.");

export const emailThemeSchema = z.object({
  font: z.enum(["sans", "serif", "mono"]).default("sans"),
  background: hex.default("#F3F4F1"),
  surface: hex.default("#FFFFFF"),
  text: hex.default("#141614"),
  muted: hex.default("#6B716C"),
  /** "brand" follows the ticket design's accent; otherwise a hex colour. */
  accent: z.string().default("brand"),
  accentText: hex.default("#FFFFFF"),
  radius: z.number().int().min(0).max(32).default(12),
  logo: z.enum(["org_logo", "none"]).default("org_logo"),
  footer: z.string().max(1000).default(DEFAULT_FOOTER),
});
export type EmailTheme = z.infer<typeof emailThemeSchema>;

export const blockStyleSchema = z.object({
  align: z.enum(["left", "center", "right"]).default("left"),
  color: hex.nullish(),
  background: hex.nullish(),
  size: z.number().int().min(10).max(72).nullish(),
  weight: z.enum(["400", "600", "700"]).nullish(),
  paddingTop: z.number().int().min(0).max(120).default(0),
  paddingBottom: z.number().int().min(0).max(120).default(8),
  letterSpacing: z.number().min(-2).max(12).default(0),
});
export type BlockStyle = z.infer<typeof blockStyleSchema>;

const base = { id: z.string().min(1).max(40), style: blockStyleSchema.default({}) };
const text = z.string().max(2000);

export const detailsRowSchema = z.object({ label: z.string().max(60), value: text });
export type DetailsRow = z.infer<typeof detailsRowSchema>;

export const emailBlockSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("heading"), text, level: z.union([z.literal(1), z.literal(2)]).default(1) }),
  z.object({ ...base, kind: z.literal("paragraph"), text }),
  z.object({
    ...base,
    kind: z.literal("button"),
    label: z.string().max(120),
    href: z.string().max(1000),
    variant: z.enum(["primary", "secondary"]).default("primary"),
  }),
  z.object({
    ...base,
    kind: z.literal("image"),
    source: z.enum(["upload", "org_logo", "event_icon", "qr"]).default("upload"),
    imageKey: z.string().max(300).nullish(),
    alt: z.string().max(200).default(""),
    width: z.number().int().min(10).max(100).default(100),
    href: z.string().max(1000).nullish(),
  }),
  z.object({ ...base, kind: z.literal("divider"), color: hex.nullish() }),
  z.object({ ...base, kind: z.literal("spacer"), height: z.number().int().min(4).max(160).default(24) }),
  z.object({ ...base, kind: z.literal("list"), items: z.array(text).min(1).max(30), ordered: z.boolean().default(false) }),
  z.object({ ...base, kind: z.literal("details"), rows: z.array(detailsRowSchema).min(1).max(12) }),
  z.object({
    ...base,
    kind: z.literal("ticket_card"),
    showQr: z.boolean().default(true),
    showVenue: z.boolean().default(true),
    eyebrow: text.default("{{ticket_type}}"),
    title: text.default("{{attendee_name}}"),
    rows: z.array(detailsRowSchema).max(10).default([]),
    note: text.default("Show this code at the door, on your phone or printed."),
  }),
]);
export type EmailBlock = z.infer<typeof emailBlockSchema>;
export type BlockKind = EmailBlock["kind"];
export type BlockOf<K extends BlockKind> = Extract<EmailBlock, { kind: K }>;

export const BLOCK_META: Record<BlockKind, { label: string; note: string; glyph: string }> = {
  heading: { label: "Heading", note: "A title line.", glyph: "H" },
  paragraph: { label: "Paragraph", note: "Text, with **bold**, _italic_ and [links](https://…).", glyph: "¶" },
  button: { label: "Button", note: "One clear action: open the ticket, find the venue.", glyph: "▭" },
  image: { label: "Image", note: "A picture you upload, the club's logo, the event poster or the guest's QR.", glyph: "▣" },
  divider: { label: "Divider", note: "A thin rule between sections.", glyph: "—" },
  spacer: { label: "Spacer", note: "Breathing room.", glyph: "↕" },
  list: { label: "List", note: "Bullets or numbers.", glyph: "≡" },
  details: { label: "Details", note: "Label and value rows: when, where, what to bring.", glyph: "☰" },
  ticket_card: { label: "Ticket card", note: "The guest's name, admission number and QR in a card.", glyph: "🎟" },
};
export const BLOCK_KINDS = Object.keys(BLOCK_META) as BlockKind[];

export const emailDesignSchema = z.object({
  theme: emailThemeSchema.default({}),
  blocks: z.array(emailBlockSchema).max(60).default([]),
});
export type EmailDesign = z.infer<typeof emailDesignSchema>;

export const emailAttachmentsSchema = z.object({
  ticketPdf: z.boolean().default(false),
  certificatePdf: z.boolean().default(false),
});
export type EmailAttachments = z.infer<typeof emailAttachmentsSchema>;

export const AUDIENCE_WHO = [
  { value: "ALL", label: "Everyone registered", note: "Every guest with a ticket." },
  { value: "CHECKED_IN", label: "Checked in", note: "Guests who came through the door." },
  { value: "NOT_CHECKED_IN", label: "Not yet inside", note: "Guests who have not checked in." },
] as const;
export type AudienceWho = (typeof AUDIENCE_WHO)[number]["value"];
export const emailAudienceSchema = z.object({
  who: z.enum(["ALL", "CHECKED_IN", "NOT_CHECKED_IN"]).default("ALL"),
  roles: z.array(z.string()).max(10).default([]),
});
export type EmailAudience = z.infer<typeof emailAudienceSchema>;

export const TRIGGER_MODES = [
  { value: "MANUAL", label: "By hand", note: "Sent when you press Send." },
  { value: "ON_TICKETS", label: "With the ticket", note: "Goes out whenever a ticket is sent." },
  { value: "BEFORE_START", label: "Before the start", note: "A timer, counted back from the event's start." },
  { value: "AFTER_END", label: "After the end", note: "A timer, counted on from the event's end." },
] as const;
export type TriggerMode = (typeof TRIGGER_MODES)[number]["value"];
export const emailTriggerSchema = z.object({
  mode: z.enum(["MANUAL", "ON_TICKETS", "BEFORE_START", "AFTER_END"]).default("MANUAL"),
  minutes: z.number().int().min(1).max(60 * 24 * 30).nullish(),
});
export type EmailTrigger = z.infer<typeof emailTriggerSchema>;

export const emailTemplateFieldsSchema = z.object({
  name: z.string().min(1).max(80),
  subject: z.string().min(1).max(200),
  design: emailDesignSchema.default({}),
  attachments: emailAttachmentsSchema.default({}),
  audience: emailAudienceSchema.default({}),
  trigger: emailTriggerSchema.default({}),
  channels: z.array(z.literal("email")).default(["email"]),
  enabled: z.boolean().default(true),
});
export type EmailTemplateFields = z.infer<typeof emailTemplateFieldsSchema>;

export const emailTemplateSchema = emailTemplateFieldsSchema.extend({
  id: z.string(),
  clubId: z.number(),
  eventId: z.number().nullable(),
  stage: z.enum(EMAIL_STAGES),
  version: z.number(),
  sourceId: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EmailTemplate = z.infer<typeof emailTemplateSchema>;

export const messageSchema = z.object({
  id: z.string(),
  kind: z.enum(["BROADCAST", "TEMPLATE", "TEST"]),
  templateId: z.string().nullable(),
  scheduled: z.boolean(),
  subject: z.string().nullable(),
  body: z.string().default(""),
  audience: z.string(),
  roles: z.array(z.string()).default([]),
  channels: z.array(z.string()).default([]),
  status: z.enum(["SENDING", "SENT"]),
  recipients: z.number(),
  sentCount: z.number(),
  failedCount: z.number(),
  skippedCount: z.number(),
  createdAt: z.string(),
  createdByName: z.string().nullish(),
});
export type Message = z.infer<typeof messageSchema>;

export const journeyStageSchema = z.object({
  stage: z.enum(EMAIL_STAGES),
  label: z.string(),
  description: z.string(),
  template: emailTemplateSchema,
  dueAt: z.string().nullish(),
  lastMessage: messageSchema.nullish(),
});
export type JourneyStage = z.infer<typeof journeyStageSchema>;

export const templatesSchema = z.object({
  journey: z.array(journeyStageSchema),
  custom: z.array(emailTemplateSchema),
});
export type Templates = z.infer<typeof templatesSchema>;

export const emailTokenSchema = z.object({
  key: z.string(),
  group: z.string(),
  label: z.string(),
  sample: z.string(),
  note: z.string().nullish(),
});
export type EmailToken = z.infer<typeof emailTokenSchema>;

export const emailContextSchema = z.object({
  tokens: z.array(emailTokenSchema),
  sampleValues: z.record(z.string()),
  brandPrimary: z.string(),
  logoUrl: z.string().nullish(),
  eventIconUrl: z.string().nullish(),
});
export type EmailContext = z.infer<typeof emailContextSchema>;

export const previewResponseSchema = z.object({
  subject: z.string(),
  html: z.string(),
  text: z.string(),
  problems: z.array(z.string()).default([]),
});
export type EmailPreview = z.infer<typeof previewResponseSchema>;

export const testSendResponseSchema = z.object({ sent: z.boolean(), to: z.string(), subject: z.string() });
export const audienceCountSchema = z.object({ recipients: z.number(), withoutEmail: z.number() });
export type AudienceCount = z.infer<typeof audienceCountSchema>;

export const messagePageSchema = z.object({
  items: z.array(messageSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

export const messageDeliverySchema = z.object({
  registrationId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  ticketId: z.string(),
  channel: z.string(),
  status: z.string(),
  error: z.string().nullish(),
  sentAt: z.string().nullish(),
});
export type MessageDelivery = z.infer<typeof messageDeliverySchema>;

export const messageDetailSchema = z.object({
  message: messageSchema,
  deliveries: z.array(messageDeliverySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type MessageDetail = z.infer<typeof messageDetailSchema>;

export const uploadedEmailImageSchema = z.object({
  key: z.string(),
  url: z.string(),
  width: z.number(),
  height: z.number(),
});

/** Where a template lives: on one event, or in the club's library. */
export type EmailScope = { kind: "event"; eventId: number } | { kind: "library" };

const FIELD_KEYS = ["name", "subject", "design", "attachments", "audience", "trigger", "channels", "enabled"] as const;

/** Just the editable part of a template, for a save. */
export const fieldsOf = (t: EmailTemplateFields): EmailTemplateFields =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, t[k]])) as unknown as EmailTemplateFields;

export const newId = (kind: BlockKind) => `${kind.slice(0, 2)}-${Math.random().toString(36).slice(2, 8)}`;

/** A block of the kind, with sensible words in it. */
export const newBlock = (kind: BlockKind): EmailBlock => {
  const id = newId(kind);
  switch (kind) {
    case "heading":
      return { kind, id, text: "A heading", level: 1, style: blockStyleSchema.parse({}) };
    case "paragraph":
      return { kind, id, text: "Hi {{first_name}}, ", style: blockStyleSchema.parse({}) };
    case "button":
      return { kind, id, label: "Open your ticket", href: "{{ticket_url}}", variant: "primary", style: blockStyleSchema.parse({ align: "center", paddingTop: 8, paddingBottom: 16 }) };
    case "image":
      return { kind, id, source: "upload", imageKey: null, alt: "", width: 100, href: null, style: blockStyleSchema.parse({ align: "center" }) };
    case "divider":
      return { kind, id, color: null, style: blockStyleSchema.parse({ paddingTop: 8, paddingBottom: 8 }) };
    case "spacer":
      return { kind, id, height: 24, style: blockStyleSchema.parse({ paddingTop: 0, paddingBottom: 0 }) };
    case "list":
      return { kind, id, items: ["First thing", "Second thing"], ordered: false, style: blockStyleSchema.parse({}) };
    case "details":
      return {
        kind,
        id,
        rows: [
          { label: "When", value: "{{event_start}}" },
          { label: "Where", value: "{{venue}}" },
        ],
        style: blockStyleSchema.parse({ paddingTop: 8, paddingBottom: 8 }),
      };
    case "ticket_card":
      return {
        kind,
        id,
        showQr: true,
        showVenue: true,
        eyebrow: "{{ticket_type}}",
        title: "{{attendee_name}}",
        rows: [],
        note: "Show this code at the door, on your phone or printed.",
        style: blockStyleSchema.parse({ paddingTop: 8, paddingBottom: 8 }),
      };
  }
};

/** A blank custom email a club can start typing into. */
export const blankTemplate = (): EmailTemplateFields =>
  emailTemplateFieldsSchema.parse({
    name: "New email",
    subject: "A note about {{event_name}}",
    design: {
      blocks: [
        { ...newBlock("heading"), text: "Hello {{first_name}}" },
        { ...newBlock("paragraph"), text: "Write your message here." },
      ],
    },
  });

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "2 days before the start", "with the ticket", "by hand". */
export const triggerSummary = (t: EmailTrigger): string => {
  if (t.mode === "MANUAL") return "By hand";
  if (t.mode === "ON_TICKETS") return "With the ticket";
  const m = t.minutes ?? 0;
  const span = m % 1440 === 0 ? plural(m / 1440, "day") : m % 60 === 0 ? plural(m / 60, "hour") : plural(m, "minute");
  return t.mode === "BEFORE_START" ? `${span} before the start` : `${span} after the end`;
};

export const audienceSummary = (a: EmailAudience): string => {
  const who = AUDIENCE_WHO.find((w) => w.value === a.who)?.label ?? a.who;
  return a.roles.length ? `${who} · ${a.roles.join(", ")}` : who;
};

// --- the Emails page (the library with its use and results) ----------------------------------------------------------------------

export const libraryFiguresSchema = z.object({
  messages: z.number(),
  recipients: z.number(),
  sent: z.number(),
  failed: z.number(),
  delivered: z.number(),
  bounced: z.number(),
  read: z.number(),
  delivery_rate: z.number().nullish(),
  open_rate: z.number().nullish(),
});
export type LibraryFigures = z.infer<typeof libraryFiguresSchema>;

export const templateUsageSchema = z.object({
  events: z.number(),
  customised: z.number(),
  off: z.number(),
  sends: z.number(),
  recipients: z.number(),
  delivery_rate: z.number().nullish(),
  open_rate: z.number().nullish(),
  bounced: z.number(),
  last_sent_at: z.string().nullish(),
});

export const libraryTemplateSchema = emailTemplateSchema.extend({ label: z.string(), usage: templateUsageSchema });
export type LibraryTemplate = z.infer<typeof libraryTemplateSchema>;

export const libraryOverviewSchema = z.object({
  figures: libraryFiguresSchema,
  previous: libraryFiguresSchema,
  delta: z.object({ messages: z.number(), recipients: z.number() }).nullish(),
  templates: z.array(libraryTemplateSchema),
  queue: z.array(z.object({ template_id: z.string(), stage: z.string(), label: z.string(), name: z.string(), event: z.object({ id: z.number(), name: z.string() }), due_at: z.string(), audience: z.string() })),
  recent: z.array(z.object({ id: z.string(), subject: z.string(), stage: z.string(), event: z.object({ id: z.number(), name: z.string() }), recipients: z.number(), sent: z.number(), failed: z.number(), scheduled: z.boolean(), created_at: z.string(), delivered: z.number(), read: z.number(), bounced: z.number() })),
  attention: z.object({ disabled_stages: z.array(z.string()), bounced_30d: z.number(), failed_30d: z.number() }),
  all_time: z.object({ messages: z.number(), recipients: z.number() }),
  generated_at: z.string(),
});
export type LibraryOverview = z.infer<typeof libraryOverviewSchema>;
