import { ADMISSION_NUMBER_HINT, QUEST_STATION_HINT, QUEST_SWAG_DESK_HINT, ROLE_LABEL, type ScanResult, type StationVisit, type SwagDesk, type WalkupResult } from "../schemas";

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

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/*
 * No signal. Nothing has checked the ticket, so no card says "welcome in":
 * the volunteer looks at the person. (The app's door scanner says the same.)
 */

/** A ticket code saved on the phone, unchecked: the server decides when the signal is back. */
export const UNVERIFIED_CARD: OutcomeCardModel = {
  tone: "caution",
  tag: "Unverified",
  title: "No signal — this ticket can't be checked right now.",
  sub: "NOT CHECKED · SAVED ON THIS PHONE · WILL SYNC",
  note: "Check their name or ID before letting them in. The scan is sent when the signal is back; anything the server refuses is listed here by name.",
};

/** What was scanned or typed is not a ticket code: refused on the phone, as the server would, and not saved. */
export const OFFLINE_NOT_A_TICKET_CARD: OutcomeCardModel = {
  tone: "refuse",
  tag: "Not recognised",
  title: "That isn't a ticket code.",
  sub: "NOT A TICKET CODE · NOT SAVED",
  note: "Type the ticket code printed under the QR (MOA-XXXXX-XXXXX), or try the scan again.",
};

/** An admission number never lets anyone in by itself, and finding whose it is needs the server. */
export const OFFLINE_ADMISSION_NUMBER_CARD: OutcomeCardModel = {
  tone: "refuse",
  tag: "Admission number",
  title: "That's an admission number, not a ticket code.",
  sub: "NOT A TICKET CODE · NOT SAVED",
  note: "An admission number does not let anyone in by itself, and finding whose it is needs the signal. Ask for the ticket code under the QR (MOA-XXXXX-XXXXX).",
};

/** This ticket is already waiting on this phone, saved at `at`: refused, and not saved again. */
export const offlineRepeatCard = (at: string): OutcomeCardModel => ({
  tone: "refuse",
  tag: "Already scanned",
  title: `Already scanned on this phone at ${clock(at)}.`,
  sub: "NO SIGNAL · NOT SAVED AGAIN",
  note: `A ticket lets one person in. Unless this is the person who came through at ${clock(at)}, don't let them in on it.`,
});

/*
 * Stations and swag desks (quests contract §7). Nobody is checked in at
 * either: a station records a visit, a swag desk shows what the guest is
 * owed. Station staff see the guest's name only.
 */

/** Why a visit was recorded but earns nothing right now. */
const NOT_COUNTED_NOTE: Record<string, string> = {
  QUESTS_OFF: "Quests are off for this event, so the visit earns nothing yet. It counts once the organiser turns them on.",
  OUTSIDE_WINDOW: "Outside the quest's hours, so the visit earns nothing for now. It counts if the organiser widens them.",
  NO_TASK: "No quest task names this station yet, so the visit earns nothing for now. It counts once one does.",
};

/** STATION_VISIT: recorded, already recorded, or recorded without earning anything. */
export function stationCard(res: ScanResult, door: string): OutcomeCardModel {
  const v: StationVisit | null | undefined = res.station;
  const who = res.attendee?.name || "This guest";
  const place = v?.name || door;
  // Points only when the quest scores by points: in checkmarks mode every task counts one.
  const points = v?.mode === "points" && v.task?.points ? `+${v.task.points} POINTS` : null;
  switch (v?.result) {
    case "VISITED":
      return {
        tone: "admit",
        tag: res.replayed ? "Already recorded" : "Visit recorded",
        title: `${who} — visit recorded ✓`,
        sub: [place.toUpperCase(), points].filter(Boolean).join(" · "),
        note: v.task?.title ? `Ticks “${v.task.title}” on their quest.` : undefined,
      };
    case "ALREADY_VISITED":
      return {
        tone: "caution",
        tag: "Already visited",
        title: `${who} already visited ${place}.`,
        sub: [v.visited_at ? `FIRST VISIT ${clock(v.visited_at)}` : null, place.toUpperCase()].filter(Boolean).join(" · "),
        note: "One visit per guest counts here, so nothing changes. Wave them on.",
      };
    default:
      return {
        tone: "accent",
        tag: "Visit recorded",
        title: `${who} — visit recorded.`,
        sub: place.toUpperCase(),
        note: NOT_COUNTED_NOTE[v?.reason ?? ""] ?? "It doesn't count towards the quest right now.",
      };
  }
}

/** SWAG_DESK: the card's verdict; the rewards themselves are listed under it, each with its handover. */
export function swagDeskCard(res: ScanResult): OutcomeCardModel {
  const s: SwagDesk | null | undefined = res.swag;
  const who = res.attendee?.name || "This guest";
  const rewards = s?.rewards ?? [];
  const toHand = rewards.filter((r) => r.status === "reserved").length;
  const collected = rewards.filter((r) => r.status === "collected").length;
  const sub = s ? [`${s.tasks_done} ${s.tasks_done === 1 ? "TASK" : "TASKS"} DONE`, s.mode === "points" && s.points ? `${s.points} POINTS` : null].filter(Boolean).join(" · ") : undefined;
  const off = s && !s.enabled ? " Quests are off for this event; rewards already held can still be handed over." : "";
  if (toHand > 0)
    return { tone: "admit", tag: "Rewards to collect", title: `${who} — ${toHand === 1 ? "1 reward" : `${toHand} rewards`} to hand over.`, sub, note: off.trim() || undefined };
  if (collected > 0 && collected === rewards.length)
    return { tone: "caution", tag: "Already collected", title: `${who} already collected ${collected === 1 ? "their reward" : "their rewards"}.`, sub, note: `Nothing more to hand over.${off}` };
  if (rewards.length > 0)
    return { tone: "caution", tag: "Nothing to hand over", title: `Nothing is held for ${who} right now.`, sub, note: `What they unlocked is sold out or on the waiting list: it's listed below.${off}` };
  return { tone: "caution", tag: "Nothing unlocked", title: `${who} hasn't unlocked a reward yet.`, sub, note: `Rewards show here once they reach a milestone.${off}` };
}

/** The swag desk's verdict once a reward was handed over here: all done, or what is still to hand over. */
export function afterHandover(res: ScanResult): OutcomeCardModel {
  const rewards = res.swag?.rewards ?? [];
  if (rewards.length && rewards.every((r) => r.status !== "reserved") && rewards.some((r) => r.status === "collected")) {
    const card = swagDeskCard(res);
    return { ...card, tone: "admit", tag: "Handed over", title: `${res.attendee?.name || "This guest"} has everything they unlocked.`, note: undefined };
  }
  return swagDeskCard(res);
}

/** No signal at a station: the visit is saved on the phone, and sent when the signal is back. */
export const STATION_SAVED_CARD: OutcomeCardModel = {
  tone: "accent",
  tag: "Saved",
  title: "No signal — the visit is saved on this phone.",
  sub: "NOT SENT YET · WILL SYNC",
  note: "It is sent when the signal is back. Nobody is checked in at a station either way.",
};

/** No signal at a station, and this ticket's visit here is already waiting on the phone. */
export const stationOfflineRepeatCard = (at: string): OutcomeCardModel => ({
  tone: "caution",
  tag: "Already scanned",
  title: `Already scanned here at ${clock(at)}.`,
  sub: "NO SIGNAL · NOT SAVED AGAIN",
  note: "One visit per guest counts at a station, and the first one is waiting to sync.",
});

/** No signal at a swag desk: a handover needs the server, so nothing is saved for later. */
export const OFFLINE_DESK_CARD: OutcomeCardModel = {
  tone: "caution",
  tag: "No signal",
  title: "No signal — their rewards can't be looked up.",
  sub: "NOTHING HANDED OVER · NOT SAVED",
  note: "Handing a reward over needs the server. Try again when the signal is back.",
};

/** Every outcome card in one place: plain, direct, and it says what to do next. */
export const outcomeCard = (res: ScanResult, door: string): OutcomeCardModel => {
  const a = res.attendee;
  const who = a ? a.name : "This guest";
  const sub = a ? [a.ticket_id, (ROLE_LABEL[a.role] ?? a.role).toUpperCase(), door.toUpperCase()].filter(Boolean).join(" · ") : undefined;
  switch (res.outcome) {
    case "CHECKED_IN":
      return { tone: "admit", tag: res.replayed ? "Already recorded" : "Welcome in", title: `${who} — welcome in.`, sub };
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
        sub: a ? [a.ticket_id, res.revoked_at ? `REVOKED ${new Date(res.revoked_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase()}` : ""].filter(Boolean).join(" · ") || undefined : undefined,
        note: "The organiser cancelled it, usually because it was lost or passed on. A replacement may have been issued in their name.",
      };
    case "UNPAID":
      return { tone: "refuse", tag: "Not paid", title: `${who} has not paid for this ticket.`, sub, note: "Take the payment at the desk and record it on their registration, then scan again." };
    case "EVENT_NOT_OPEN":
      return { tone: "caution", tag: "Door shut", title: "This event's door is closed.", note: "The organiser opens it under Team & doors. Nothing is wrong with the ticket." };
    case "STATION_VISIT":
      return stationCard(res, door);
    case "SWAG_DESK":
      return swagDeskCard(res);
    case "INVALID":
    default:
      // Only a console from before stations hears these; nobody was checked in.
      if (res.hint === QUEST_STATION_HINT || res.hint === QUEST_SWAG_DESK_HINT)
        return {
          tone: "refuse",
          tag: res.hint === QUEST_STATION_HINT ? "Station" : "Swag desk",
          title: `This door is a ${res.hint === QUEST_STATION_HINT ? "station" : "swag desk"}, not an entrance.`,
          sub: "NOBODY IS CHECKED IN HERE",
          note: "Reload this page to use it as one, or pick an entrance from the door menu to check guests in.",
        };
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
