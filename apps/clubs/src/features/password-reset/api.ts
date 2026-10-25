import { api } from "@moa/app-kit";

/**
 * A forgotten password, for the club's own login and its team members.
 * Neither call needs a session. Asking always answers the same, whether or
 * not the address has an account (the server never says).
 */
export async function askForResetCode(email: string): Promise<void> {
  await api.post<unknown>("/api/v1/auth/club/password/forgot", { email });
}

export interface ResetInput {
  email: string;
  code: string;
  new_password: string;
  totp_code?: string;
}

export async function resetPassword(input: ResetInput): Promise<void> {
  await api.post<unknown>("/api/v1/auth/club/password/reset", input);
}
