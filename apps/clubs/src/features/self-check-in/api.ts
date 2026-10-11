import { api } from "@moa/app-kit";

import { z } from "zod";

/** Public: the scanned token is the only credential, then the session it starts. */
export const selfSessionSchema = z.object({
  session: z.string(),
  expires_at: z.string(),
  event: z.object({ name: z.string(), venue: z.string().nullish(), starts_at: z.string().nullish(), org_name: z.string().default(""), brand_primary: z.string().default("#1db9a0"), kiosk: z.object({ name: z.string(), door: z.string() }) }),
  verify: z.enum(["name", "email", "phone"]),
  print: z.boolean(),
  door_open: z.boolean(),
});
export type SelfSession = z.infer<typeof selfSessionSchema>;

export const lookupResultSchema = z.object({
  outcome: z.enum(["READY", "CODE_SENT", "NOT_FOUND", "AMBIGUOUS", "ALREADY_IN", "NO_CONTACT", "EVENT_NOT_OPEN", "DISABLED"]),
  channel: z.string().nullable(),
  masked: z.string().nullable(),
  checked_in_at: z.string().nullable(),
  door: z.string().nullable(),
});
export type LookupResult = z.infer<typeof lookupResultSchema>;

export const verifyResultSchema = z.object({ outcome: z.enum(["READY", "WRONG_CODE", "EXPIRED", "LOCKED"]), attempts_left: z.number().nullable() });
export const checkInResultSchema = z.object({
  outcome: z.enum(["CHECKED_IN", "ALREADY_IN", "NOT_VERIFIED", "EVENT_NOT_OPEN", "REFUSED"]),
  guest: z.object({ first_name: z.string(), display_name: z.string(), role_label: z.string(), ticket_id: z.string() }).nullable(),
  can_print: z.boolean(),
});
export type CheckInResult = z.infer<typeof checkInResultSchema>;
export const printResultSchema = z.object({ outcome: z.enum(["QUEUED", "NO_PRINTER", "ALREADY_PRINTED", "NOT_CHECKED_IN"]) });
export const statusSchema = z.object({ checked_in: z.boolean(), print: z.object({ status: z.string() }).nullable() });

const base = "/api/v1/self";
export const startSelf = async (token: string) => selfSessionSchema.parse(await api.post<unknown>(`${base}/start`, { token }));
export const lookupSelf = async (session: string, name: string, contact?: string) => lookupResultSchema.parse(await api.post<unknown>(`${base}/lookup`, { session, name, ...(contact ? { contact } : {}) }));
export const verifySelf = async (session: string, code: string) => verifyResultSchema.parse(await api.post<unknown>(`${base}/verify`, { session, code }));
export const resendSelf = async (session: string) => lookupResultSchema.parse(await api.post<unknown>(`${base}/resend`, { session }));
export const checkInSelf = async (session: string) => checkInResultSchema.parse(await api.post<unknown>(`${base}/check-in`, { session }));
export const printSelf = async (session: string) => printResultSchema.parse(await api.post<unknown>(`${base}/print`, { session }));
export const statusSelf = async (session: string) => statusSchema.parse(await api.get<unknown>(`${base}/status`, { query: { session } }));
