import { ADMISSION_NUMBER_HINT, ROLE_LABEL, type ScanResult, type WalkupResult } from "../schemas";

export type Tone = "admit" | "caution" | "refuse" | "accent";

export interface OutcomeCardModel {
  tone: Tone;
  tag: string;
  title: string;
  sub?: string;
  attribution?: string;
  note?: string;
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? "moments ago" : m === 1 ? "1 minute ago" : m < 60 ? `${m} minutes ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

/**
 * An admission number typed (or scanned) at the door: not a ticket, so
 * nobody was let in, but the server says whose it is. Staff look at the
 * person in front of them and check them in by hand -- or do not.
 */
export const needsHandCheckIn = (res: ScanResult | null | undefined): res is ScanResult & { attendee: NonNullable<ScanResult["attendee"]> } =>
  !!res && res.outcome === "INVALID" && res.hint === ADMISSION_NUMBER_HINT && !!res.attendee;

/** Every outcome card in one place: plain, direct, and it says what to do next. */
export const outcomeCard = (res: ScanResult, door: string, queued = false): OutcomeCardModel => {
  const a = res.attendee;
  const who = a ? a.name : "This guest";
  const sub = a ? [a.ticket_id, (ROLE_LABEL[a.role] ?? a.role).toUpperCase(), door.toUpperCase()].join(" · ") : undefined;
  switch (res.outcome) {
    case "CHECKED_IN":
      return queued
        ? { tone: "accent", tag: "Queued", title: `${who} — welcome in.`, sub: "SAVED ON THIS PHONE · WILL SYNC", note: "Held locally until signal returns. The server still catches duplicates when it syncs, so a second scan elsewhere cannot double them in." }
        : { tone: "admit", tag: res.replayed ? "Already recorded" : "Welcome in", title: `${who} — welcome in.`, sub };
    case "ALREADY_CHECKED_IN":
      return {
        tone: "caution",
        tag: "Already in",
        title: `${who} already checked in.`,
        sub,
        attribution: res.checked_in_by && res.checked_in_at ? `${res.checked_in_by.name} at ${res.checked_in_by.door}, ${ago(res.checked_in_at)}.` : undefined,
        note: "A second scan is normal — nothing went wrong. Wave them through.",
      };
    case "WRONG_EVENT":
      return {
        tone: "refuse",
        tag: "Wrong event",
        title: "That ticket is for another event.",
        sub: res.other_event ? `VALID TICKET · ${res.other_event.name.toUpperCase()}` : "VALID TICKET · ANOTHER EVENT",
        note: "Point them at the right event rather than turning them away.",
      };
    case "REVOKED":
      return {
        tone: "refuse",
        tag: "Revoked",
        title: "This ticket was revoked.",
        sub: a ? `${a.ticket_id}${res.revoked_at ? ` · REVOKED ${new Date(res.revoked_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase()}` : ""}` : undefined,
        note: "The organiser cancelled it, usually because it was lost or passed on. A replacement may have been issued in their name.",
      };
    case "UNPAID":
      return { tone: "refuse", tag: "Not paid", title: `${who} has not paid for this ticket.`, sub, note: "Take the payment at the desk and record it on their registration, then scan again." };
    case "EVENT_NOT_OPEN":
      return { tone: "caution", tag: "Door shut", title: "This event's door is closed.", note: "The organiser opens it under Team & doors. Nothing is wrong with the ticket." };
    case "INVALID":
    default:
      if (needsHandCheckIn(res))
        return {
          tone: "caution",
          tag: "Admission number",
          title: `${res.attendee.name}, admission no. ${res.attendee.admission_no ?? "on their ticket"}: check in by hand?`,
          sub: sub ? `NOT A TICKET CODE · ${sub}` : "NOT A TICKET CODE",
          note: "An admission number does not let anyone in by itself. If this is them, check them in by hand; otherwise ask for the ticket code under the QR.",
        };
      return { tone: "refuse", tag: "Not recognised", title: "Not a recognised ticket code.", sub: "NO TICKET MATCHES THIS CODE", note: "Type the ticket code printed under the QR (MOA-XXXXX-XXXXX), or try the scan again." };
  }
};

export const walkupCard = (res: WalkupResult, door: string, name: string): OutcomeCardModel | null => {
  switch (res.outcome) {
    case "REGISTERED":
      return {
        tone: "admit",
        tag: res.checked_in ? "Walk-in" : "Registered",
        title: res.checked_in ? `${res.attendee?.name ?? name} is registered and checked in.` : `${res.attendee?.name ?? name} is registered.`,
        sub: [res.attendee?.ticket_id, (ROLE_LABEL[res.attendee?.role ?? ""] ?? "").toUpperCase(), door.toUpperCase()].filter(Boolean).join(" · "),
        note: res.ticket_sent ? "Their ticket is on its way to the address they gave." : "No address given, so no ticket email. They are on the list and recorded as present.",
      };
    case "DUPLICATE":
      return res.duplicate_by === "NAME"
        ? { tone: "caution", tag: "Same name on the list", title: `Someone called ${res.duplicate_of?.name ?? name} is already on the list.`, note: "If it is them, check them in from Find. If it is a different person with the same name, register them anyway — an email or mobile tells them apart next time." }
        : { tone: "caution", tag: "Already on the list", title: `${res.duplicate_of?.name ?? name} is already on the list.`, note: "Find them under Find instead of making a second record." };
    case "EVENT_NOT_OPEN":
      return { tone: "caution", tag: "Door shut", title: "This event's door is closed.", note: "The organiser opens it under Team & doors before anyone can be registered at the door." };
    default:
      return null;
  }
};

export const HAPTIC: Record<Tone, number[]> = { admit: [40], caution: [40, 60, 40], refuse: [40, 60, 40], accent: [40] };
