import { z } from "zod";
import { ApiError } from "@moa/api";

import { CYCLES, FREE_PLAN, type Catalog, type Cycle } from "@/features/billing";

/**
 * A club applying to join: the form, what it sends, and how the server's
 * refusals map back onto it.
 *
 * The rules are POST /clubs/create's own (CreateClub): a name of 3 to 20
 * characters, a password of 6 to 100, a login phone of at most 15. Checking
 * them here only says so sooner; the server is what holds them.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 20;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 100;
export const ABOUT_MAX = 2000;
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;

/** "+91 98470-12345" as the server keeps it: no spaces, no dashes. */
export const compactPhone = (value: string) => value.replace(/[\s-]/g, "");

const phone = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\+?\d{7,14}$/.test(compactPhone(v)), "Enter a phone number, like +91 98470 12345");

const optionalUrl = z.string().trim().url("Enter the full link, starting with https://").or(z.literal(""));

export const signupSchema = z
  .object({
    // Step 1: the club
    name: z.string().trim().min(NAME_MIN, `At least ${NAME_MIN} characters`).max(NAME_MAX, `${NAME_MAX} characters at most`),
    about: z.string().trim().max(ABOUT_MAX, `${ABOUT_MAX.toLocaleString("en-IN")} characters at most`),
    org_id: z.number().nullable(),
    location_name: z.string().trim().max(200),
    /** Set when a place is picked from the suggestions, so the server can pin it. */
    location_link: z.string(),
    // Step 2: contact and login
    email: z.string().trim().min(1, "Enter the email the club will sign in with").email("Enter a valid email address"),
    password: z.string().min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters`).max(PASSWORD_MAX, `${PASSWORD_MAX} characters at most`),
    confirm_password: z.string().min(1, "Type the password again"),
    contact_phone: phone,
    contact_email: z.string().trim().email("Enter a valid email address").or(z.literal("")),
    // Step 3: interests and links
    interest_ids: z.array(z.number()),
    instagram: optionalUrl,
    linkedin: optionalUrl,
    youtube: optionalUrl,
    website: optionalUrl,
    // Step 4: the plan from the pricing page
    requested_plan: z.string().min(1),
    requested_cycle: z.enum(CYCLES),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm_password) {
      ctx.addIssue({ code: "custom", path: ["confirm_password"], message: "The two passwords don't match" });
    }
    if (v.password && v.password.trim().toLowerCase() === v.email.trim().toLowerCase()) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "Use something other than the email address" });
    }
  });

export type SignupValues = z.infer<typeof signupSchema>;
export type SignupField = keyof SignupValues;

export function emptySignup(plan: string = FREE_PLAN, cycle: Cycle = "monthly"): SignupValues {
  return {
    name: "",
    about: "",
    org_id: null,
    location_name: "",
    location_link: "",
    email: "",
    password: "",
    confirm_password: "",
    contact_phone: "",
    contact_email: "",
    interest_ids: [],
    instagram: "",
    linkedin: "",
    youtube: "",
    website: "",
    requested_plan: plan,
    requested_cycle: cycle,
  };
}

export const STEPS = [
  { id: "club", title: "Your club", fields: ["name", "about", "org_id", "location_name", "location_link"] },
  { id: "contact", title: "Contact and login", fields: ["email", "password", "confirm_password", "contact_phone", "contact_email"] },
  { id: "more", title: "Interests and links", fields: ["interest_ids", "instagram", "linkedin", "youtube", "website"] },
  { id: "review", title: "Review", fields: ["requested_plan", "requested_cycle"] },
] as const satisfies readonly { id: string; title: string; fields: readonly SignupField[] }[];

export type StepId = (typeof STEPS)[number]["id"];

export function stepOf(field: SignupField | "logo"): number {
  if (field === "logo") return 0;
  const i = STEPS.findIndex((s) => (s.fields as readonly string[]).includes(field));
  return i < 0 ? STEPS.length - 1 : i;
}

/** A picked place, as a map link the server reads its point from. */
export const mapLinkFor = (point: { lat: number; lng: number }) => `https://www.google.com/maps?q=${point.lat},${point.lng}`;

/**
 * The plan to ask for: the one from the pricing page when it is on sale,
 * else Free. Without a catalogue (it did not load) the page's key stands;
 * the server checks it.
 */
export function resolvePlanKey(key: string, catalog?: Pick<Catalog, "plans"> | null): string {
  if (!catalog) return key;
  if (catalog.plans.some((p) => p.key === key)) return key;
  return catalog.plans.some((p) => p.key === FREE_PLAN) ? FREE_PLAN : (catalog.plans[0]?.key ?? key);
}

/**
 * The multipart body POST /clubs/create reads.
 *
 * Empty optional fields are left out rather than sent empty: `org_id` is an
 * int and an empty string is a 422, and the rest are better absent than
 * blank. `phone` (the club account's own number, the one the server keeps
 * today) and `contact_phone` (the public one) carry the same number: the
 * form asks for it once.
 */
export function toFormData(values: SignupValues, logo: File | null): FormData {
  const form = new FormData();
  form.append("name", values.name.trim());
  form.append("email", values.email.trim());
  form.append("password", values.password);

  const phoneNumber = compactPhone(values.contact_phone.trim());
  if (phoneNumber) {
    form.append("phone", phoneNumber);
    form.append("contact_phone", phoneNumber);
  }
  const optional: [string, string][] = [
    ["contact_email", values.contact_email],
    ["about", values.about],
    ["location_name", values.location_name],
    ["location_link", values.location_name.trim() ? values.location_link : ""],
    ["instagram", values.instagram],
    ["linkedin", values.linkedin],
    ["youtube", values.youtube],
    ["website", values.website],
  ];
  for (const [key, value] of optional) {
    if (value.trim()) form.append(key, value.trim());
  }
  if (values.org_id != null) form.append("org_id", String(values.org_id));
  if (values.interest_ids.length) form.append("interest_ids", values.interest_ids.join(","));
  if (logo) form.append("logo", logo);
  form.append("requested_plan", values.requested_plan);
  form.append("requested_cycle", values.requested_cycle);
  return form;
}

/** Server field names that are not the form's own. */
const SERVER_FIELD: Record<string, SignupField | "logo"> = {
  phone: "contact_phone",
  location_link: "location_name",
};

const FIELD_WORDS: Record<string, string> = {
  "email already exists": "There's already a club account with this email. Sign in instead, or use another address.",
  "phone already exists": "Another club account already uses this phone number.",
};

export interface SignupErrors {
  /** Per field, in the form's own names. */
  fields: Partial<Record<SignupField | "logo", string>>;
  /** What to say above the form, if anything. */
  message: string | null;
}

const asText = (v: unknown): string | null => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null);

/**
 * The server's refusal, in the form's terms.
 *
 * Two shapes arrive: `{message, errors: {field: "msg"}}` from the app's own
 * checks and its 422 handler (a duplicate email is a 400 with
 * `errors.email`), and a bare `{message}` (a taken club name). Either way a
 * field the form has gets its message under the field.
 */
export function signupErrors(error: unknown): SignupErrors {
  if (!(error instanceof ApiError)) {
    return { fields: {}, message: "Could not reach MyOtherApp. Check your connection and try again." };
  }
  if (error.status === 429) {
    return { fields: {}, message: "Too many applications from this connection. Wait a few minutes, then send it again." };
  }
  if (error.isServer) {
    return { fields: {}, message: "Something went wrong on our side. Try again in a minute." };
  }

  const fields: SignupErrors["fields"] = {};
  const leftover: string[] = [];
  for (const [key, raw] of Object.entries(error.fieldErrors ?? {})) {
    const text = asText(raw);
    if (!text) continue;
    const field = SERVER_FIELD[key] ?? (key in emptySignup() || key === "logo" ? (key as SignupField | "logo") : null);
    const words = FIELD_WORDS[text.toLowerCase()] ?? text.charAt(0).toUpperCase() + text.slice(1);
    if (field) fields[field] = words;
    else leftover.push(words);
  }
  if (/name already exists/i.test(error.message)) {
    fields.name = "A club with this name is already on MyOtherApp. Try a different name.";
  }

  const vague = /^invalid request$/i.test(error.message) || error.message === "Some of the submitted values were not valid.";
  const message = leftover.length ? leftover.join(" ") : Object.keys(fields).length ? (vague ? "Some details need another look." : null) : error.message;
  return { fields, message };
}
