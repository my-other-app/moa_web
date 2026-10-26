import {
  CHUNK_SIZE,
  MAX_IDS_PER_CALL,
  indiaTime,
  people,
  skippedLines,
  type ApproveResult,
  type DeclineResult,
  type RegistrationRequest,
} from "./schemas";

/**
 * Deciding many requests at once, without the browser holding them all.
 *
 * Ids go to the server in chunks (CHUNK_SIZE, never over the server's 500),
 * one after another, so each call is short and the progress bar moves. A
 * call that fails stops the run: what was decided stays decided, and the
 * rest are still waiting, which the summary says. Confirming stops early
 * once the server says no place is left (the rest would only be skipped).
 *
 * "Every waiting request" uses the server's `all_pending`: the oldest
 * waiting, whoever they are, so nothing is loaded first. A request the
 * server skips stays waiting at the front of the queue, so each round asks
 * for the ones it skipped plus the next few, and stops when a round brings
 * no one new. Declining has no `all_pending`, so its ids are read from the
 * list a page at a time first.
 *
 * Pure (the calls are passed in), so every rule is tested without a server.
 */

export interface BulkProgress {
  done: number;
  total: number;
  /** "Reading the list" while declining everyone: the ids come first. */
  phase: "reading" | "sending";
}

export type StopReason = { reason: "event_full" } | { reason: "error"; message: string } | { reason: "stuck" };

export interface BulkOutcome {
  kind: "confirm" | "decline";
  /** How many the club asked about. */
  asked: number;
  /** Confirmed, or declined. */
  done: string[];
  /** Of those confirmed, the ones sent a link to pay (a paid ticket). */
  payLinks: number;
  /** The earliest time one of those has to pay by. */
  payBy: string | null;
  /** id → the server's reason for skipping it. */
  skipped: Map<string, string>;
  /** Never sent: the run stopped first. */
  unsent: number;
  stopped: StopReason | null;
  /** The places left after the last call (confirming); undefined when unknown. */
  placesLeft?: number | null;
  /** Declining: whether they were emailed. */
  notified?: boolean;
}

export type Progress = (p: BulkProgress) => void;

export function chunk<T>(items: readonly T[], size: number = CHUNK_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1 || size > MAX_IDS_PER_CALL) throw new Error(`A chunk is 1 to ${MAX_IDS_PER_CALL} ids.`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : "The server didn't answer.");

function outcome(kind: BulkOutcome["kind"], asked: number): BulkOutcome {
  return { kind, asked, done: [], payLinks: 0, payBy: null, skipped: new Map(), unsent: 0, stopped: null };
}

function absorbApproved(out: BulkOutcome, res: ApproveResult, approved: Set<string>) {
  for (const a of res.approved) {
    if (approved.has(a.id)) continue;
    approved.add(a.id);
    out.skipped.delete(a.id);
    if (a.pay_by) {
      out.payLinks++;
      if (!out.payBy || Date.parse(a.pay_by) < Date.parse(out.payBy)) out.payBy = a.pay_by;
    }
  }
  for (const s of res.skipped) if (!approved.has(s.id)) out.skipped.set(s.id, s.reason);
  out.placesLeft = res.places_left;
}

/** Confirms these ids, in the order given (queue order: oldest first), a chunk at a time. */
export async function confirmIds(ids: readonly string[], send: (ids: string[]) => Promise<ApproveResult>, onProgress?: Progress, size: number = CHUNK_SIZE): Promise<BulkOutcome> {
  const out = outcome("confirm", ids.length);
  const approved = new Set<string>();
  const parts = chunk(ids, size);
  let sent = 0;
  onProgress?.({ done: 0, total: ids.length, phase: "sending" });
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    let res: ApproveResult;
    try {
      res = await send(part);
    } catch (e) {
      out.stopped = { reason: "error", message: messageOf(e) };
      out.unsent = ids.length - sent;
      break;
    }
    absorbApproved(out, res, approved);
    sent += part.length;
    onProgress?.({ done: sent, total: ids.length, phase: "sending" });
    if (res.places_left === 0 && i < parts.length - 1) {
      out.stopped = { reason: "event_full" };
      out.unsent = ids.length - sent;
      break;
    }
  }
  out.done = [...approved];
  return out;
}

/**
 * Confirms the oldest `total` waiting with `all_pending`, never past them:
 * a round asks for the ones skipped so far plus the next chunk.
 */
export async function confirmAllWaiting(total: number, send: (limit: number) => Promise<ApproveResult>, onProgress?: Progress, size: number = CHUNK_SIZE): Promise<BulkOutcome> {
  const out = outcome("confirm", total);
  const approved = new Set<string>();
  const seen = new Set<string>();
  onProgress?.({ done: 0, total, phase: "sending" });
  // Each round either brings someone new or ends the run, so it ends; the bound is a backstop.
  for (let round = 0; round < total + 2; round++) {
    const reached = approved.size + out.skipped.size;
    const next = Math.min(size, total - reached);
    if (next <= 0) break;
    if (out.skipped.size + next > MAX_IDS_PER_CALL) {
      // The ones it can't confirm fill the server's window: nobody behind them can be reached this way.
      out.stopped = { reason: "stuck" };
      out.unsent = total - reached;
      break;
    }
    let res: ApproveResult;
    try {
      res = await send(out.skipped.size + next);
    } catch (e) {
      out.stopped = { reason: "error", message: messageOf(e) };
      out.unsent = total - reached;
      break;
    }
    const fresh = [...res.approved.map((a) => a.id), ...res.skipped.map((s) => s.id)].filter((id) => !seen.has(id));
    for (const id of fresh) seen.add(id);
    absorbApproved(out, res, approved);
    onProgress?.({ done: Math.min(total, approved.size + out.skipped.size), total, phase: "sending" });
    if (res.places_left === 0) {
      const left = total - approved.size - out.skipped.size;
      if (left > 0) {
        out.stopped = { reason: "event_full" };
        out.unsent = left;
      }
      break;
    }
    // Nobody new: nobody else is waiting (someone else decided them, or they withdrew).
    if (fresh.length === 0) break;
  }
  out.done = [...approved];
  return out;
}

export interface DeclineOptions {
  notify: boolean;
  note?: string;
}

/** Declines these ids, a chunk at a time. */
export async function declineIds(ids: readonly string[], send: (ids: string[]) => Promise<DeclineResult>, options: DeclineOptions, onProgress?: Progress, size: number = CHUNK_SIZE): Promise<BulkOutcome> {
  const out = { ...outcome("decline", ids.length), notified: options.notify };
  const declined = new Set<string>();
  let sent = 0;
  onProgress?.({ done: 0, total: ids.length, phase: "sending" });
  for (const part of chunk(ids, size)) {
    let res: DeclineResult;
    try {
      res = await send(part);
    } catch (e) {
      out.stopped = { reason: "error", message: messageOf(e) };
      out.unsent = ids.length - sent;
      break;
    }
    for (const id of res.declined) {
      declined.add(id);
      out.skipped.delete(id);
    }
    for (const s of res.skipped) if (!declined.has(s.id)) out.skipped.set(s.id, s.reason);
    sent += part.length;
    onProgress?.({ done: sent, total: ids.length, phase: "sending" });
  }
  out.done = [...declined];
  return out;
}

/** Every waiting request's id, oldest first, read a page at a time (up to `total`). */
export async function collectWaitingIds(
  total: number,
  fetchPage: (after: string | null) => Promise<{ items: Pick<RegistrationRequest, "id">[]; next: string | null } | null>,
  onProgress?: Progress,
): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  let after: string | null = null;
  onProgress?.({ done: 0, total, phase: "reading" });
  // A page always moves the cursor on; the bound stops a server that doesn't.
  for (let pages = 0; pages < total + 2; pages++) {
    const page = await fetchPage(after);
    if (!page) break;
    for (const r of page.items) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      ids.push(r.id);
    }
    onProgress?.({ done: Math.min(ids.length, total), total, phase: "reading" });
    if (!page.next || page.next === after || ids.length >= total || page.items.length === 0) break;
    after = page.next;
  }
  return ids.slice(0, total);
}

// ─── The summary ────────────────────────────────────────────────────────

export interface OutcomeSummary {
  tone: "admit" | "caution" | "refuse";
  /** "38 confirmed, 12 skipped". */
  title: string;
  /** The reasons and what happens next, in plain words. */
  lines: string[];
}

const num = (n: number) => n.toLocaleString("en-IN");

/** "the other person wasn't sent", "the other 40 people weren't sent". */
const theOthers = (n: number, one: string, many: string) => (n === 1 ? `the other person ${one}` : `the other ${num(n)} people ${many}`);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function summarise(o: BulkOutcome): OutcomeSummary {
  const done = o.done.length;
  const skipped = o.skipped.size;
  const verb = o.kind === "confirm" ? "confirmed" : "declined";
  const head = o.kind === "decline" && done > 0 ? `${num(done)} ${verb}${o.notified ? " and emailed" : ", not emailed"}` : `${num(done)} ${verb}`;
  const title = skipped > 0 ? `${head}, ${num(skipped)} skipped` : head;

  const lines: string[] = [];
  if (skipped > 0) lines.push(`Skipped: ${skippedLines(o.skipped.values()).map((l) => l.text).join("; ")}.`);
  if (o.kind === "confirm" && done > 0) {
    const free = done - o.payLinks;
    if (o.payLinks > 0) {
      lines.push(
        `${free > 0 ? `${people(free)} got their ticket by email. ` : ""}${o.payLinks === 1 ? "1 person has a paid ticket and was" : `${num(o.payLinks)} people have a paid ticket and were`} sent a link to pay; ${o.payLinks === 1 ? "their place is" : "their places are"} held until ${indiaTime(o.payBy)}. Unpaid by then, ${o.payLinks === 1 ? "it goes" : "they go"} back.`,
      );
    } else {
      lines.push(done === 1 ? "Their ticket is on its way by email." : "Their tickets are on their way by email.");
    }
  }
  const stop = o.stopped;
  if (stop?.reason === "event_full" && o.unsent > 0) {
    lines.push(`The event filled up, so ${theOthers(o.unsent, "wasn't sent", "weren't sent")}. They're still waiting.`);
  } else if (stop?.reason === "stuck" && o.unsent > 0) {
    lines.push(
      `The oldest requests can't be confirmed (see why above), so ${o.unsent === 1 ? "the person behind them wasn't" : `the ${num(o.unsent)} people behind them weren't`} reached. Tick the ones you want and confirm them.`,
    );
  } else if (stop?.reason === "error") {
    lines.push(`Stopped: ${stop.message} ${o.unsent > 0 ? `${capital(theOthers(o.unsent, "wasn't sent and is", "weren't sent and are"))} still waiting. Try again.` : "Try again."}`);
  }
  const tone: OutcomeSummary["tone"] = stop?.reason === "error" ? "refuse" : skipped > 0 || o.unsent > 0 || done === 0 ? "caution" : "admit";
  return { tone, title, lines };
}

/**
 * What a confirmation of `count` will do with `placesLeft` (null: no cap):
 * the warning before it is sent, or null when they all fit.
 */
export function overCapacity(count: number, placesLeft: number | null | undefined): { full: boolean; text: string } | null {
  if (placesLeft === null || placesLeft === undefined || count <= placesLeft) return null;
  if (placesLeft <= 0) return { full: true, text: "No places are left, so nobody can be confirmed. Raise the places under Settings, or wait for someone to cancel." };
  return {
    full: false,
    text: `Only ${num(placesLeft)} ${placesLeft === 1 ? "place is" : "places are"} left. Only the first ${num(placesLeft)} in order (oldest request first) will be confirmed; ${theOthers(count - placesLeft, "stays", "stay")} waiting.`,
  };
}
