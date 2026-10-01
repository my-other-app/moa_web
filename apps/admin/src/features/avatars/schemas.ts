import { z } from "zod";

import { imageFieldSchema } from "@/lib/schemas";

export const avatarSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  image: imageFieldSchema,
});

export const avatarListSchema = z
  .union([z.array(avatarSchema), z.object({ items: z.array(avatarSchema) })])
  .transform((value) => (Array.isArray(value) ? value : value.items));

export type AppAvatar = z.infer<typeof avatarSchema>;
