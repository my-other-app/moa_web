import { describe, expect, it, vi } from "vitest";

import { chunk, confirmAllWaiting, confirmIds, declineAllWaiting, declineIds, overCapacity, summarise, type BulkProgress } from "./bulk";
import { CHUNK_SIZE, DECLINE_CHUNK_SIZE, MAX_IDS_PER_CALL, answerRows, indiaTime, queueOrder, reopenResultSchema, requestPageSchema, skipReasonText, skippedLines, type ApproveResult, type DeclineResult } from "./schemas";

/**
 * Deciding many requests: ids go in chunks the server accepts, in queue
 * order, with progress; confirming stops once the event is full; "every
 * waiting request" goes through all_pending without loading anyone; and
 * the outcome is said in plain words.
 */

const ids = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `r${from + i}`);

/** A fake server holding `places` places: confirms in the order it is sent, skips the rest as full. */
function server(places: number | null, skip: Record<string, string> = {}) {
  let left = places;
  const calls: string[][] = [];
  const send = vi.fn(async (part: string[]): Promise<ApproveResult> => {
    calls.push(part);
    const approved: ApproveResult["approved"] = [];
    const skipped: ApproveResult["skipped"] = [];
    for (const id of part) {
      if (skip[id]) skipped.push({ id, reason: skip[id]! });
      else if (left === 0) skipped.push({ id, reason: "event_full" });
      else {
        approved.push({ id, registration_id: `reg-${id}`, pay_by: null });
        if (left !== null) left--;
      }
    }
    return { approved, skipped, places_left: left };
  });
  return { send, calls };
}

describe("chunks", () => {
  it("never sends more than the server takes in one call", () => {
    expect(CHUNK_SIZE).toBeLessThanOrEqual(MAX_IDS_PER_CALL);
    const parts = chunk(ids(1234));
    expect(parts.every((p) => p.length <= CHUNK_SIZE)).toBe(true);
    expect(parts.flat()).toEqual(ids(1234));
    expect(chunk(ids(1000), 500).map((p) => p.length)).toEqual([500, 500]);
    expect(() => chunk(ids(3), 501)).toThrow();
    expect(() => chunk(ids(3), 0)).toThrow();
    expect(chunk([])).toEqual([]);
  });
});

describe("confirming ticked requests", () => {
  it("sends them in queue order, a chunk at a time, and reports progress", async () => {
    const { send, calls } = server(null);
    const progress: BulkProgress[] = [];
    const out = await confirmIds(ids(250), send, (p) => progress.push(p));
    expect(calls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(calls.flat()).toEqual(ids(250));
    expect(out.done).toHaveLength(250);
    expect(progress.at(-1)).toEqual({ done: 250, total: 250 });
    expect(progress.map((p) => p.done)).toEqual([0, 100, 200, 250]);
    expect(summarise(out)).toMatchObject({ tone: "admit", title: "250 confirmed" });
  });

  it("stops once no place is left, and says the rest are still under review", async () => {
    const { send, calls } = server(130);
    const out = await confirmIds(ids(400), send);
    // The second call fills the event; the last two are never sent.
    expect(calls).toHaveLength(2);
    expect(out.done).toHaveLength(130);
    expect(out.skipped.size).toBe(70);
    expect(out.unsent).toBe(200);
    expect(out.stopped).toEqual({ reason: "event_full" });
    const s = summarise(out);
    expect(s.tone).toBe("caution");
    expect(s.title).toBe("130 confirmed, 70 skipped");
    expect(s.lines).toContain("Skipped: 70 because the event is full.");
    expect(s.lines).toContain("The event filled up, so the other 200 people weren't sent. They're still under review.");
  });

  it("stops at a failed call: what was decided stays decided", async () => {
    const send = vi.fn(async (part: string[]): Promise<ApproveResult> => {
      if (part[0] === "r101") throw new Error("Network down.");
      return { approved: part.map((id) => ({ id, registration_id: null, pay_by: null })), skipped: [], places_left: null };
    });
    const out = await confirmIds(ids(300), send);
    expect(out.done).toHaveLength(100);
    expect(out.unsent).toBe(200);
    const s = summarise(out);
    expect(s.tone).toBe("refuse");
    expect(s.lines.at(-1)).toBe("Stopped: Network down. The other 200 people weren't sent and are still under review. Try again.");
  });

  it("names each skip in plain words, the largest first, and the paid ones' hold", async () => {
    const send = vi.fn(async (): Promise<ApproveResult> => ({
      approved: [
        { id: "a", registration_id: "reg-a", pay_by: null },
        { id: "b", registration_id: null, pay_by: "2026-10-27T12:30:00+00:00" },
        { id: "c", registration_id: null, pay_by: "2026-10-27T10:30:00+00:00" },
      ],
      skipped: [
        { id: "d", reason: "type_sold_out" },
        { id: "e", reason: "code_invalid" },
        { id: "f", reason: "type_sold_out" },
        { id: "g", reason: "not_pending" },
        { id: "h", reason: "something_new" },
      ],
      places_left: 4,
    }));
    const out = await confirmIds(["a", "b", "c", "d", "e", "f", "g", "h"], send);
    expect(out.payLinks).toBe(2);
    expect(out.payBy).toBe("2026-10-27T10:30:00+00:00");
    const s = summarise(out);
    expect(s.title).toBe("3 confirmed, 5 skipped");
    expect(s.lines[0]).toBe(
      "Skipped: 2 because their ticket type is sold out; 1 because their discount code no longer applies, so their registration stays under review (they're never charged full price without being asked); 1 because they were already reviewed or cancelled, or someone else was reviewing them at that moment; 1 because of “something new”.",
    );
    expect(s.lines[1]).toBe(`1 person got their ticket by email. 2 people have a paid ticket and were sent a link to pay; their tickets are held until ${indiaTime("2026-10-27T10:30:00+00:00")}. If they aren't paid by then, those registrations expire.`);
  });
});

describe("confirming every waiting request (all_pending)", () => {
  /** A queue on the server: all_pending takes the oldest `limit` still waiting. */
  function queue(n: number, places: number | null, skip: Record<string, string> = {}) {
    const waiting = ids(n);
    let left = places;
    const limits: number[] = [];
    const send = vi.fn(async (limit: number): Promise<ApproveResult> => {
      limits.push(limit);
      const batch = waiting.slice(0, limit);
      const approved: ApproveResult["approved"] = [];
      const skipped: ApproveResult["skipped"] = [];
      for (const id of batch) {
        if (skip[id]) skipped.push({ id, reason: skip[id]! });
        else if (left === 0) skipped.push({ id, reason: "event_full" });
        else {
          approved.push({ id, registration_id: `reg-${id}`, pay_by: null });
          waiting.splice(waiting.indexOf(id), 1);
          if (left !== null) left--;
        }
      }
      return { approved, skipped, places_left: left };
    });
    return { send, limits, waiting };
  }

  it("confirms them all without loading the list, never past the number shown", async () => {
    const q = queue(1200, null);
    const out = await confirmAllWaiting(1000, q.send);
    expect(out.done).toHaveLength(1000);
    expect(q.limits.every((l) => l <= MAX_IDS_PER_CALL)).toBe(true);
    expect(q.waiting).toHaveLength(200); // the 200 newest were not asked about
    expect(summarise(out).title).toBe("1,000 confirmed");
  });

  it("gets past the ones it skips: they stay waiting at the front", async () => {
    const skip = Object.fromEntries(ids(150).map((id) => [id, "type_sold_out"]));
    const q = queue(400, null, skip);
    const out = await confirmAllWaiting(400, q.send);
    expect(out.done).toHaveLength(250);
    expect(out.skipped.size).toBe(150);
    // Each round asks again for the ones skipped so far, plus the next chunk.
    expect(q.limits).toEqual([100, 200, 250, 250]);
    expect(summarise(out).lines[0]).toBe("Skipped: 150 because their ticket type is sold out.");
  });

  it("stops when the event fills", async () => {
    const q = queue(500, 120);
    const out = await confirmAllWaiting(500, q.send);
    expect(out.done).toHaveLength(120);
    expect(out.stopped).toEqual({ reason: "event_full" });
    expect(out.unsent + out.skipped.size).toBe(380);
  });

  it("stops when nobody new comes back (others decided them meanwhile)", async () => {
    const q = queue(30, null);
    const out = await confirmAllWaiting(80, q.send);
    expect(out.done).toHaveLength(30);
    expect(out.stopped).toBeNull();
    expect(q.send).toHaveBeenCalledTimes(2);
  });

  it("says so when the ones it can't confirm fill the server's window", async () => {
    const skip = Object.fromEntries(ids(450).map((id) => [id, "code_invalid"]));
    const q = queue(700, null, skip);
    const out = await confirmAllWaiting(700, q.send);
    expect(out.stopped).toEqual({ reason: "stuck" });
    expect(summarise(out).lines.at(-1)).toMatch(/Tick the ones you want and confirm them\.$/);
  });
});

describe("declining", () => {
  it("sends the choice to email them and the note with every chunk, up to the server's 500 a call", async () => {
    expect(DECLINE_CHUNK_SIZE).toBe(MAX_IDS_PER_CALL);
    const calls: string[][] = [];
    const out = await declineIds(
      ids(650),
      async (part) => {
        calls.push(part);
        return { declined: part.filter((id) => id !== "r7"), skipped: part.includes("r7") ? [{ id: "r7", reason: "not_pending" }] : [] };
      },
      { notify: false, note: "Full house" },
    );
    expect(calls.map((c) => c.length)).toEqual([500, 150]);
    expect(out.done).toHaveLength(649);
    expect(summarise(out)).toMatchObject({ title: "649 declined, not emailed, 1 skipped", tone: "caution" });
  });

  /** A queue on the server: decline's all_pending takes the oldest `limit` still waiting. */
  function waitingQueue(n: number, locked: string[] = []) {
    const waiting = ids(n);
    const limits: number[] = [];
    const send = vi.fn(async (limit: number): Promise<DeclineResult> => {
      limits.push(limit);
      const batch = waiting.slice(0, limit);
      const declined = batch.filter((id) => !locked.includes(id));
      for (const id of declined) waiting.splice(waiting.indexOf(id), 1);
      return { declined, skipped: batch.filter((id) => locked.includes(id)).map((id) => ({ id, reason: "not_pending" })) };
    });
    return { send, limits, waiting };
  }

  it("declines every waiting request in all_pending rounds, never past the number shown", async () => {
    const q = waitingQueue(1300);
    const progress: BulkProgress[] = [];
    const out = await declineAllWaiting(1200, q.send, { notify: true }, (p) => progress.push(p));
    expect(q.limits).toEqual([500, 500, 200]);
    expect(out.done).toHaveLength(1200);
    expect(q.waiting).toHaveLength(100);
    expect(progress.at(-1)).toEqual({ done: 1200, total: 1200 });
    expect(summarise(out)).toMatchObject({ title: "1,200 declined and emailed", tone: "admit" });
  });

  it("stops when a round declines nobody new (others decided them, or a confirmation holds them)", async () => {
    const q = waitingQueue(40, ["r1", "r2"]);
    const out = await declineAllWaiting(60, q.send, { notify: false });
    expect(out.done).toHaveLength(38);
    expect([...out.skipped.keys()]).toEqual(["r1", "r2"]);
    expect(q.send).toHaveBeenCalledTimes(2);
  });

  it("stops at a failed round and says how many are still under review", async () => {
    let n = 0;
    const out = await declineAllWaiting(700, async (limit) => {
      if (++n === 2) throw new Error("Network down.");
      return { declined: ids(limit), skipped: [] };
    }, { notify: true });
    expect(out.done).toHaveLength(500);
    expect(out.unsent).toBe(200);
    expect(summarise(out).lines.at(-1)).toBe("Stopped: Network down. The other 200 people weren't sent and are still under review. Try again.");
  });
});

describe("reopening", () => {
  it("reads the answer, and says why one couldn't go back under review", () => {
    const res = reopenResultSchema.parse({ reopened: ["a"], skipped: [{ id: "b", reason: "already_open" }, { id: "c", reason: "not_reopenable" }] });
    expect(res.reopened).toEqual(["a"]);
    expect(res.skipped.map((s) => skipReasonText(s.reason))).toEqual([
      "they have registered again since, and that registration is still open",
      "their registration isn't declined or expired any more",
    ]);
    expect(reopenResultSchema.parse({})).toEqual({ reopened: [], skipped: [] });
  });
});

describe("the warning before confirming", () => {
  it("warns before going past the places left, and says only the first ones go", () => {
    expect(overCapacity(30, null)).toBeNull();
    expect(overCapacity(30, 40)).toBeNull();
    expect(overCapacity(100, 40)).toEqual({
      full: false,
      text: "Only 40 places are left. Only the first 40 in order (oldest registration first) will be confirmed; the other 60 people stay under review.",
    });
    expect(overCapacity(1, 0)?.full).toBe(true);
  });
});

describe("reading the list", () => {
  it("parses a page, filling the counts and reading an unknown status as closed", () => {
    const page = requestPageSchema.parse({
      items: [{ id: "x", status: "frozen", full_name: "  ", submitted_at: "2026-10-26T04:00:00Z", ticket_type: { id: 3, name: "Student" } }],
      next: "",
      counts: { pending: 4, approved: 2 },
      places_left: null,
    });
    expect(page.items[0]).toMatchObject({ status: "closed", full_name: "Unnamed", email: null, decided_by: null });
    expect(page.counts).toEqual({ pending: 4, approved: 2, declined: 0, withdrawn: 0, lapsed: 0, closed: 0 });
    expect(page.next).toBeNull();
    expect(page.places_left).toBeNull();
  });

  it("puts ticked requests in queue order, oldest first", () => {
    const rows = [
      { id: "b", submitted_at: "2026-10-26T10:00:00+05:30" },
      { id: "a", submitted_at: "2026-10-26T04:00:00Z" },
      { id: "c", submitted_at: "2026-10-26T04:30:00Z" },
    ];
    expect(queueOrder(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("labels the answers by the event's own questions, whatever shape they come in", () => {
    const fields = [
      { key: "college", label: "College" },
      { key: "year", label: "Year of study" },
    ];
    expect(answerRows({ year: "3", college: "CET", diet: ["veg", "no nuts"] }, fields)).toEqual([
      { key: "college", label: "College", value: "CET" },
      { key: "year", label: "Year of study", value: "3" },
      { key: "diet", label: "diet", value: "veg, no nuts" },
    ]);
    expect(answerRows({ year: { label: "Year", value: 2 } })).toEqual([{ key: "year", label: "Year", value: "2" }]);
    expect(answerRows([{ key: "team", label: "Team name", value: "Byte Me" }])).toEqual([{ key: "team", label: "Team name", value: "Byte Me" }]);
    expect(answerRows(null)).toEqual([]);
  });

  it("groups skips by reason", () => {
    expect(skippedLines(["event_full", "event_full", "event_closed"]).map((l) => l.text)).toEqual(["2 because the event is full", "1 because the event has closed"]);
  });
});

describe("one person's decision, by name", () => {
  it("says “{name} is confirmed” or “{name} is declined”, and whether they were emailed", async () => {
    const confirmed = await confirmIds(["r1"], async (part) => ({ approved: part.map((id) => ({ id, registration_id: "reg-1", pay_by: null })), skipped: [], places_left: null }));
    expect(summarise(confirmed, "Meera Nair").title).toBe("Meera Nair is confirmed");
    const declined = await declineIds(["r2"], async (part) => ({ declined: part, skipped: [] }), { notify: true });
    expect(summarise(declined, "Arjun Das")).toMatchObject({ title: "Arjun Das is declined", lines: ["They were emailed to say so."] });
    const quiet = await declineIds(["r3"], async (part) => ({ declined: part, skipped: [] }), { notify: false });
    expect(summarise(quiet, "Arjun Das").lines).toEqual(["They weren't emailed."]);
    // Skipped, or many: the counts as before.
    const skipped = await declineIds(["r4"], async () => ({ declined: [], skipped: [{ id: "r4", reason: "not_pending" }] }), { notify: true });
    expect(summarise(skipped, "Arjun Das").title).toBe("0 declined, 1 skipped");
    expect(summarise(declined).title).toBe("1 declined and emailed");
  });
});
