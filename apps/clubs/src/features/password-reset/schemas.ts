import { z } from "zod";

import { MIN_PASSWORD } from "@/features/access/schemas";

export const emailStepSchema = z.object({
  email: z.string().trim().min(1, "Enter the email address you sign in with").email("Enter a valid email address"),
});

export const codeStepSchema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
    new_password: z.string().min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters`),
    confirm: z.string().min(1, "Repeat the new password"),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

/** The server's answers to a wrong, spent or locked code, and to an account that also wants its authenticator. */
export const CODE_INVALID = "CODE_INVALID";
export const CODE_LOCKED = "CODE_LOCKED";
export const CODE_EXPIRED = "CODE_EXPIRED";
export const TOTP_REQUIRED = "TOTP_REQUIRED";
export const TOTP_INVALID = "TOTP_INVALID";

export const NOT_AVAILABLE = "Password reset isn't available yet — contact MyOtherApp to get back in.";
export const SENT_NOTE = "If an account uses that address, a 6-digit code is on its way. It works for 15 minutes.";
