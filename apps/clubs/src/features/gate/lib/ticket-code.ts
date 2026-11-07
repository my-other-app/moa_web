/**
 * What can let someone in at the door, judged on the phone when the server
 * cannot be asked (no signal). The server is the judge whenever it answers;
 * this only keeps an offline scan from being saved -- and a guest from being
 * waved in -- on something that could never be a ticket.
 *
 * Only the ticket code checks anyone in: `MOA-7K3QF-X9PWM` -- two groups of
 * five from an alphabet without 0/O or 1/I/L -- or, on older tickets, `MOA-`,
 * up to seven hex digits, then five of those letters (`MOA-3F2A9C-K7QXD`).
 * The registration's id works too. (backend app/core/utils/keys.py and
 * app/api/checkins/service.py; the app's ticket_code.dart says the same.)
 *
 * The admission number printed beside the QR (`MOA-0042-E123`) does not:
 * those run in sequence, so anyone could print a QR for one. Online, the
 * scan answers it with whose it is, for a volunteer to check them in by hand.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const TICKET_CODE = new RegExp(`^MOA-[${ALPHABET}]{5}-[${ALPHABET}]{5}$`);
/** The time part was `format(ms % 36**5, "X")`: hex, no leading zero. */
const OLDER_TICKET_CODE = new RegExp(`^MOA-[1-9A-F][0-9A-F]{0,6}-[${ALPHABET}]{5}$`);
const REGISTRATION_ID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
/** PREFIX-0042-E123, PREFIX-0042, or a seat with the event's code (A12-E123). */
const ADMISSION_NUMBER = /^(?:[A-Z0-9]+-)+(?:\d+(?:-E\d+)?|E\d+)$/;

/** The form a code is compared in: trimmed, upper case (as the server looks it up). */
export const normalCode = (text: string) => text.trim().toUpperCase();

/** `text` is shaped like a ticket code, or a registration id. */
export function looksLikeTicketCode(text: string): boolean {
  const code = normalCode(text);
  return TICKET_CODE.test(code) || OLDER_TICKET_CODE.test(code) || REGISTRATION_ID.test(code);
}

/** `text` is shaped like an admission number and not like a ticket code. */
export function looksLikeAdmissionNumber(text: string): boolean {
  return !looksLikeTicketCode(text) && ADMISSION_NUMBER.test(normalCode(text));
}
