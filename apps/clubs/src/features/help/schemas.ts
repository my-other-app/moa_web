import { z } from "zod";

/**
 * Help (support-leads-contract.md): the answers MyOtherApp keeps for common
 * questions, a request to the Support team with the page the club was on,
 * and the club's own requests with their replies.
 */
const id = z.coerce.number();
const text = z.string().nullish().transform((v) => v ?? "");

export const helpAnswerSchema = z.object({ id, topic: z.string().nullish(), question: z.string(), answer: text });
export type HelpAnswer = z.infer<typeof helpAnswerSchema>;
export const helpAnswersSchema = z.array(helpAnswerSchema);

export const topicSchema = z.object({ key: z.string(), label: z.string() });
export type Topic = z.infer<typeof topicSchema>;
export const topicsSchema = z.array(topicSchema).catch([]);

export const STATUS_LABEL: Record<string, string> = { new: "Sent", open: "Being looked at", waiting: "Waiting on you", resolved: "Solved", closed: "Closed" };
export const STATUS_TONE: Record<string, "default" | "info" | "warning" | "success"> = { new: "info", open: "info", waiting: "warning", resolved: "success", closed: "default" };
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;

export const requestRowSchema = z.object({
  id,
  number: id,
  subject: text,
  topic: z.string().nullish(),
  status: z.string().catch("open"),
  updated_at: z.string().nullish(),
  unread: z.boolean().catch(false),
});
export type RequestRow = z.infer<typeof requestRowSchema>;
export const requestRowsSchema = z.array(requestRowSchema);

export const attachmentSchema = z.object({ name: z.string().nullish().transform((v) => v ?? "file"), url: z.string().nullish() });

export const messageSchema = z.object({
  id,
  /** reply_in: the club's own; reply_out: MyOtherApp's. Notes never reach here. */
  kind: z.string().catch("reply_in"),
  body_text: text,
  author_name: z.string().nullish(),
  created_at: z.string().nullish(),
  attachments: z.array(attachmentSchema).catch([]),
});
export type RequestMessage = z.infer<typeof messageSchema>;

export const requestDetailSchema = z.object({
  id,
  number: id,
  subject: text,
  topic: z.string().nullish(),
  status: z.string().catch("open"),
  created_at: z.string().nullish(),
  messages: z.array(messageSchema).catch([]),
  can_reply: z.boolean().catch(true),
  can_survey: z.boolean().nullish(),
  survey: z.object({ solved: z.boolean().nullish(), comment: z.string().nullish() }).nullish(),
});
export type RequestDetail = z.infer<typeof requestDetailSchema>;

export const createdSchema = z.object({ id, number: id, status: z.string().catch("new") });

/** What a reply answers: the message, and the case it landed on (a new one after a closed case). */
export const replyResultSchema = z.object({ case_id: id.nullish(), number: id.nullish(), new_case: z.boolean().catch(false) }).passthrough();

export const uploadSchema = z
  .object({ key: z.string(), name: z.string().nullish(), size: z.coerce.number().nullish(), files: z.array(z.object({ key: z.string(), name: z.string().nullish(), size: z.coerce.number().nullish() })).nullish() })
  .transform((u) => u.files ?? [{ key: u.key, name: u.name, size: u.size }]);

/** Screenshots or a PDF: three at most, 5 MB each, as the API takes them. */
export const MAX_FILES = 3;
export const MAX_BYTES = 5 * 1024 * 1024;
export const FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;
export const FILE_ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf";
export const MESSAGE_MAX = 5000;

/** Why a picked file can't go, in plain words; null when it can. */
export function fileProblem(file: File): string | null {
  if (!(FILE_TYPES as readonly string[]).includes(file.type)) return `${file.name} isn't a picture or a PDF.`;
  if (file.size > MAX_BYTES) return `${file.name} is over 5 MB.`;
  return null;
}

/**
 * What the request says about where it was sent from: the dashboard, the
 * page the club was on (and its event, when it was an event's page), and
 * the club. The Support team sees it beside the message.
 */
export function requestContext(page: string | null, origin: string, clubId: number | null | undefined) {
  const path = page && page.startsWith("/") ? page : null;
  const event = path ? /^\/events\/(\d+)(?:\/|$)/.exec(path)?.[1] : undefined;
  return {
    platform: "dashboard" as const,
    ...(path ? { page_url: `${origin}${path}`.slice(0, 1000) } : {}),
    ...(event ? { event_id: Number(event) } : {}),
    ...(clubId ? { club_id: clubId } : {}),
  };
}

/** Where an attachment opens: an API path through the gateway, so the session cookie goes with it. */
export function attachmentHref(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/v1/")) return `/api/gateway${url}`;
  if (url.startsWith("https://")) return url;
  return null;
}
