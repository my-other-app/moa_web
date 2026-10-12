import { imageFieldSchema } from "@moa/app-kit";
import { z } from "zod";

export const pollOptionSchema = z.object({ id: z.string(), label: z.string(), votes: z.number(), share: z.number() });

export const threadSchema = z.object({
  id: z.string(),
  body: z.string(),
  image: imageFieldSchema,
  kind: z.enum(["post", "poll"]).catch("post"),
  poll: z.object({ options: z.array(pollOptionSchema), votes: z.number(), voted_option_id: z.string().nullable() }).nullable(),
  pinned: z.boolean(),
  notify_followers: z.boolean(),
  likes: z.number(),
  comments: z.number(),
  views: z.number(),
  liked: z.boolean().default(false),
  created_at: z.string(),
});

export const threadPageSchema = z.object({
  items: z.array(threadSchema),
  total: z.number().default(0),
  limit: z.number().default(20),
  offset: z.number().default(0),
});

export const commentSchema = z.object({
  id: z.string(),
  body: z.string(),
  author: z.object({ id: z.number().nullable(), name: z.string(), is_club: z.boolean().default(false) }),
  created_at: z.string(),
});

export type Thread = z.infer<typeof threadSchema>;
export type ThreadComment = z.infer<typeof commentSchema>;

export const MAX_BODY = 500;
export const MAX_POLL_OPTIONS = 4;

export const composeSchema = z
  .object({
    body: z.string().trim().min(1, "Write something first").max(MAX_BODY, `Keep it under ${MAX_BODY} characters`),
    notify_followers: z.boolean(),
    poll_options: z.array(z.string().trim().max(60, "Keep each option under 60 characters")),
  })
  .superRefine((v, ctx) => {
    const filled = v.poll_options.filter((o) => o.length > 0);
    if (v.poll_options.length > 0 && filled.length < 2) ctx.addIssue({ code: "custom", path: ["poll_options"], message: "A poll needs at least two options" });
    if (new Set(filled.map((o) => o.toLowerCase())).size !== filled.length) ctx.addIssue({ code: "custom", path: ["poll_options"], message: "Two options say the same thing" });
  });
export type ComposeInput = z.infer<typeof composeSchema>;
