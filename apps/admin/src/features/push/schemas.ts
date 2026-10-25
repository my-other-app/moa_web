import { z } from "zod";

/** GET /notifications/test/tokens: the newest tokens and how many there are. Only `count` is used. */
export const tokenCountSchema = z.object({ count: z.number().catch(0) });

/** GET /notifications/topics/adoption. */
export const adoptionSchema = z.object({
  devices: z.number().catch(0),
  topic_devices: z.number().catch(0),
  share: z.number().catch(0),
  by_platform: z.record(z.string(), z.unknown()).catch({}),
  push_topics: z.boolean().catch(false),
  push_topics_legacy: z.boolean().catch(true),
});
export type Adoption = z.infer<typeof adoptionSchema>;

/** GET /notifications/test/firebase-status. */
export const firebaseStatusSchema = z.object({
  has_path_config: z.boolean().catch(false),
  has_base64_config: z.boolean().catch(false),
  firebase_initialized: z.boolean().catch(false),
  project_id: z.string().nullish(),
  error: z.string().nullish(),
});
export type FirebaseStatus = z.infer<typeof firebaseStatusSchema>;

export const sendResultSchema = z.object({
  success: z.boolean().catch(false),
  tokens_count: z.number().catch(0),
  sent_count: z.number().catch(0),
  message: z.string().catch(""),
});
export type SendResult = z.infer<typeof sendResultSchema>;

export const TITLE_MAX = 65;
export const BODY_MAX = 240;

export const pushInputSchema = z.object({
  title: z.string().trim().min(1, "Write a title").max(TITLE_MAX, `At most ${TITLE_MAX} characters`),
  body: z.string().trim().min(1, "Write the message").max(BODY_MAX, `At most ${BODY_MAX} characters`),
  image_url: z
    .string()
    .trim()
    .url("The image must be a full https:// address")
    .refine((v) => v.startsWith("https://"), "The image must be a full https:// address")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type PushInput = z.infer<typeof pushInputSchema>;
