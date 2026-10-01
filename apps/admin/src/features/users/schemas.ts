import { paginatedSchema } from "@moa/api";
import { z } from "zod";

/**
 * Runtime shape of an admin user row.
 *
 * Written by hand rather than taken from the generated types because the
 * backend publishes these fields as `anyOf: [string, {}]` (see
 * @moa/api's zod-helpers for why), which generates as `unknown`. Validating
 * here gives the table real types and fails loudly if the shape changes.
 */
export const adminUserSchema = z.object({
  id: z.coerce.number(),
  full_name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  username: z.string(),
  user_type: z.string(),
  provider: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export const adminUserPageSchema = paginatedSchema(adminUserSchema);

export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUserPage = z.infer<typeof adminUserPageSchema>;
