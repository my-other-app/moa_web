import { z } from "zod";

/**
 * The API is the authority on credentials; this schema only catches empty
 * submissions client-side so the user gets instant feedback instead of a
 * round-trip. It deliberately does not impose password composition rules the
 * backend does not enforce -- that would reject valid existing passwords.
 */
export const loginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username"),
  password: z.string().min(1, "Enter your password"),
});

export type LoginInput = z.infer<typeof loginSchema>;
