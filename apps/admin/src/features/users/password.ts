/**
 * Generate a password for another account.
 *
 * Generated in the browser rather than typed, so nobody reuses a password
 * they also use elsewhere. Crypto RNG, not Math.random -- these are handed to
 * real accounts, including club logins that then hold money.
 *
 * The alphabet omits characters that are read wrong down a phone line or off
 * a screenshot: I, l, 1, O, 0. A password nobody can dictate accurately gets
 * reset again an hour later.
 *
 * Shared by the v1 dialog and the v2 drawer panel so the two cannot drift to
 * different strengths for the same action.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 16 characters from a 56-character alphabet: ~93 bits. */
export const PASSWORD_LENGTH = 16;

export function generatePassword(): string {
  const values = new Uint32Array(PASSWORD_LENGTH);
  crypto.getRandomValues(values);
  return Array.from(values, (n) => ALPHABET[n % ALPHABET.length]).join("");
}
