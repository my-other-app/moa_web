import { z } from "zod";

/**
 * Values the API shows in part: door staff see a guest's email, phone and
 * ticket code masked ("a•••@gmail.com", "•••• 4321") -- enough to tell two
 * people apart at the gate, not a list to take away. A masked value is
 * shown as it came and never acted on: no copy, mail or call link, never
 * sent back as a correction.
 *
 * Any of the usual mask marks counts (bullets, asterisks, an ellipsis), so
 * the screens hold whatever exact form the API settles on. None of them
 * appears in a real email address, phone number or ticket code.
 */
const MASK = /[\u2022\u2219\u22C5\u25CF\u2026*]|\.{3}/;

export function isMasked(value: unknown): value is string {
  return typeof value === "string" && MASK.test(value);
}

/** Any of these was masked. */
export const anyMasked = (...values: unknown[]) => values.some(isMasked);

/**
 * A text field the API may mask, leave out, or send empty: a string, or
 * null when there is none. Never a parse failure that blanks the list.
 */
export const partialText = z.string().nullish().catch(null).transform((v) => v ?? null);

/** A ticket code the API may mask or leave out for this role: "" when there is none to show. */
export const partialCode = z.string().nullish().catch(null).transform((v) => v ?? "");
