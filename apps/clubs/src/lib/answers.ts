import { ApiError } from "@moa/api";

/**
 * Answers to an event's own registration questions, as the dashboard builds
 * them: the organiser's add-a-guest and correct-a-guest dialog, and the
 * gate's walk-up form.
 *
 * A "several choices" question (field_type checkbox, with options) is
 * answered with the options ticked. The Wave-1 API takes a list for it; an
 * API from before takes only one option, as a string. So one tick is sent
 * as the option itself, which every API takes, and several as a list --
 * which an older API refuses with INVALID_ANSWERS on that question, said
 * under it like any other refusal.
 *
 * Typed answers (number, email, URL, date) are checked by the Wave-1 API;
 * the form asks for them with the matching input so a phone shows the
 * right keyboard, and shows the API's word under the question when it
 * refuses one (`invalidAnswers`).
 */
export interface AnswerField {
  key: string;
  label?: string | null;
  field_type?: string | null;
  options?: string[] | null;
  required?: boolean | null;
}

/** What a question holds while the form is open: the ticked options of a several-choices question, else text. */
export type AnswerValue = string | string[];

/** A question answered by ticking any of its options. */
export const isMultiChoice = (f: AnswerField): boolean => f.field_type === "checkbox" && !!f.options?.length;

/** A question answered by picking one of its options. */
export const isSingleChoice = (f: AnswerField): boolean => !isMultiChoice(f) && !!f.options?.length;

/** The input a typed question asks with; plain text for anything else. */
export const INPUT_TYPE: Record<string, string> = {
  number: "number",
  email: "email",
  url: "url",
  tel: "tel",
  date: "date",
  time: "time",
  datetime: "datetime-local",
};
export const inputTypeOf = (f: AnswerField): string => INPUT_TYPE[f.field_type ?? ""] ?? "text";

/** A stored answer as the form holds it: a list for a several-choices question (one tick was stored as a string), else text. */
export function answerForForm(f: AnswerField, stored: unknown): AnswerValue {
  if (isMultiChoice(f)) {
    if (Array.isArray(stored)) return stored.filter((v) => v !== null && v !== undefined && String(v).trim() !== "").map(String);
    return stored === null || stored === undefined || String(stored).trim() === "" ? [] : [String(stored)];
  }
  if (Array.isArray(stored)) return stored.map(String).join(", ");
  return stored === null || stored === undefined ? "" : String(stored);
}

export const isBlank = (v: AnswerValue | undefined): boolean => (Array.isArray(v) ? v.length === 0 : !v?.trim());

/** One answer as the API is sent it, or undefined when it is blank (a blank is left out, not sent empty). */
export function answerForApi(f: AnswerField, v: AnswerValue | undefined): string | string[] | undefined {
  if (v === undefined || isBlank(v)) return undefined;
  if (Array.isArray(v)) {
    // In the order the question lists them, each once.
    const ticked = (f.options ?? []).filter((o) => v.includes(o));
    const picked = ticked.length ? ticked : [...new Set(v)];
    return picked.length === 1 ? picked[0] : picked;
  }
  return v.trim();
}

/** Every answered question, as the API is sent them. */
export function answersPayload(fields: AnswerField[], values: Record<string, AnswerValue | undefined>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const f of fields) {
    const v = answerForApi(f, values[f.key]);
    if (v !== undefined) out[f.key] = v;
  }
  return out;
}

/** An answer as read: the ticked options of a list joined, anything else as written. */
export function answerText(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  return v === null || v === undefined ? "" : String(v);
}

export const INVALID_ANSWERS = "INVALID_ANSWERS";

/**
 * The API's refusal of the answers, question by question: `errors` is
 * {question key: message}. Null when the refusal is something else.
 */
export function invalidAnswers(error: unknown): Record<string, string> | null {
  if (!(error instanceof ApiError) || error.errorCode !== INVALID_ANSWERS) return null;
  const out: Record<string, string> = {};
  for (const [key, said] of Object.entries((error.fieldErrors ?? {}) as Record<string, unknown>)) {
    if (typeof said === "string") out[key] = said;
    else if (Array.isArray(said) && typeof said[0] === "string") out[key] = said[0];
  }
  return out;
}
