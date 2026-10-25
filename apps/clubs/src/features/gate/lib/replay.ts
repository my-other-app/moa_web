import { ADMISSION_NUMBER_HINT, type ScanResult } from "../schemas";
import type { QueuedScan } from "./queue";
import type { DoorTone } from "../components/door-kit";

/**
 * What became of the scans saved on the phone while it had no signal.
 *
 * Each one was shown as "saved, will sync" when it was taken, and the guest
 * went in. The server decides when the phone is back online, and its answer
 * can be no: the ticket was used already, is for another event, was revoked
 * (a refund revokes it), is unpaid, or matches nothing. The volunteer has to
 * hear about each of those, by name. An admission is only counted.
 */

/** One saved scan as the server answered it on replay. */
export interface ReplayedScan {
  client_ref: string;
  response: ScanResult;
  /** The scan as it was saved, when the phone still had it. */
  scan?: QueuedScan;
}

/** A saved scan the server did not admit: who or which ticket, and why. */
export interface ReplayProblem {
  ref: string;
  /** The guest's name, when the server knows whose the ticket is. */
  name: string | null;
  /** The ticket as printed, else the code as it was scanned. */
  ticket: string;
  tag: string;
  reason: string;
  tone: DoorTone;
  door: string | null;
  scannedAt: string | null;
}

export interface ReplayReport {
  /** Saved scans the server has answered, this time back online. */
  synced: number;
  /** Of those, the ones it admitted (or had admitted from this phone already). */
  admitted: number;
  problems: ReplayProblem[];
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Why the server said no, for a scan the guest was already let in on. */
function why(res: ScanResult): { tag: string; reason: string; tone: DoorTone } {
  switch (res.outcome) {
    case "ALREADY_CHECKED_IN": {
      const by = res.checked_in_by ? ` by ${res.checked_in_by.name} at ${res.checked_in_by.door}` : "";
      return { tone: "caution", tag: "Already used", reason: `This ticket was already checked in${by}. Check it was the same person.` };
    }
    case "WRONG_EVENT":
      return { tone: "refuse", tag: "Wrong event", reason: `The ticket is for ${res.other_event ? res.other_event.name : "another event"}, not this one.` };
    case "REVOKED":
      return { tone: "refuse", tag: "Revoked", reason: `The ticket was revoked${res.revoked_at ? ` on ${day(res.revoked_at)}` : ""}: cancelled or refunded.` };
    case "UNPAID":
      return { tone: "refuse", tag: "Not paid", reason: "The ticket has not been paid for. Take the payment at the desk." };
    case "EVENT_NOT_OPEN":
      return { tone: "caution", tag: "Door shut", reason: "The door was shut when this synced, so nobody was checked in. Scan it again once it is open." };
    case "INVALID":
    default:
      if (res.hint === ADMISSION_NUMBER_HINT)
        return { tone: "caution", tag: "Admission number", reason: "An admission number, not a ticket: nobody was checked in. If it was them, check them in by hand under Find." };
      return { tone: "refuse", tag: "Not found", reason: "No ticket matches this code." };
  }
}

/** The problem a replayed scan is, or null when the server admitted it. */
export function replayProblem(r: ReplayedScan): ReplayProblem | null {
  const res = r.response;
  // Admitted now, or this very scan was admitted on an earlier try (replayed).
  if (res.outcome === "CHECKED_IN") return null;
  return {
    ref: r.client_ref,
    name: res.attendee?.name || null,
    ticket: res.attendee?.ticket_id || r.scan?.code || r.client_ref,
    door: r.scan?.door ?? null,
    scannedAt: r.scan?.scanned_at ?? null,
    ...why(res),
  };
}

/** The report so far with one more batch of answers in it. */
export function withReplayed(report: ReplayReport | null, results: ReplayedScan[]): ReplayReport {
  const problems = results.map(replayProblem).filter((p): p is ReplayProblem => p !== null);
  const before = report ?? { synced: 0, admitted: 0, problems: [] };
  const known = new Set(before.problems.map((p) => p.ref));
  return {
    synced: before.synced + results.length,
    admitted: before.admitted + results.length - problems.length,
    problems: [...before.problems, ...problems.filter((p) => !known.has(p.ref))],
  };
}
