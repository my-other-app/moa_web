import { describe, expect, it } from "vitest";

import { needsHandCheckIn, outcomeCard, walkupCard } from "./lib/outcome-copy";
import { scanResultSchema, type ScanResult, type WalkupResult } from "./schemas";

const base: ScanResult = {
  outcome: "CHECKED_IN",
  attendee: { id: "r1", name: "Ananya Iyer", ticket_id: "MOA-1", role: "speaker", has_contact: true, is_paid: true },
  checked_in_at: null,
  checked_in_by: null,
  other_event: null,
  revoked_at: null,
  capture: { ask: false, required: false, reason: "DISABLED" },
  replayed: false,
  badge: { auto: false, may_print: true, printed_at: null, policy: "anyone" },
};

describe("the outcome card", () => {
  it("welcomes a guest in with their ticket, role and door", () => {
    const c = outcomeCard(base, "Gate A");
    expect(c.tone).toBe("admit");
    expect(c.title).toBe("Ananya Iyer — welcome in.");
    expect(c.sub).toBe("MOA-1 · SPEAKER · GATE A");
  });

  it("says who scanned them already, and that nothing went wrong", () => {
    const c = outcomeCard({ ...base, outcome: "ALREADY_CHECKED_IN", checked_in_at: new Date(Date.now() - 5 * 60_000).toISOString(), checked_in_by: { name: "Vani", door: "Gate B" } }, "Gate A");
    expect(c.tone).toBe("caution");
    expect(c.attribution).toBe("Vani at Gate B, 5 minutes ago.");
    expect(c.note).toContain("Wave them through");
  });

  it("names the other event, the revocation, the fee and the shut door", () => {
    expect(outcomeCard({ ...base, outcome: "WRONG_EVENT", attendee: null, other_event: { name: "Demo Day" } }, "Gate A").sub).toBe("VALID TICKET · DEMO DAY");
    expect(outcomeCard({ ...base, outcome: "REVOKED", revoked_at: "2026-11-01T00:00:00Z" }, "Gate A").sub).toBe("MOA-1 · REVOKED 01 NOV");
    expect(outcomeCard({ ...base, outcome: "UNPAID" }, "Gate A").title).toBe("Ananya Iyer has not paid for this ticket.");
    expect(outcomeCard({ ...base, outcome: "EVENT_NOT_OPEN", attendee: null }, "Gate A").tag).toBe("Door shut");
    expect(outcomeCard({ ...base, outcome: "INVALID", attendee: null }, "Gate A").tone).toBe("refuse");
  });

  it("asks staff to check an admission number's holder in by hand, and admits nobody", () => {
    const res: ScanResult = { ...base, outcome: "INVALID", attendee: { ...base.attendee!, admission_no: "MOA-0042-E123" }, hint: "ADMISSION_NUMBER" };
    const c = outcomeCard(res, "Gate A");
    expect(c.tone).toBe("caution");
    expect(c.title).toBe("Ananya Iyer, admission no. MOA-0042-E123: check in by hand?");
    expect(c.sub).toBe("NOT A TICKET CODE · MOA-1 · SPEAKER · GATE A");
    expect(needsHandCheckIn(res)).toBe(true);
    // Today's API sends no hint: an unknown code is just that.
    expect(needsHandCheckIn({ ...base, outcome: "INVALID", attendee: null })).toBe(false);
    expect(needsHandCheckIn({ ...res, attendee: null })).toBe(false);
    expect(outcomeCard({ ...base, outcome: "INVALID", attendee: null }, "Gate A").note).toContain("MOA-XXXXX-XXXXX");
  });

  it("marks a queued scan as saved, not admitted", () => {
    const c = outcomeCard({ ...base, attendee: null }, "Gate A", true);
    expect(c.tag).toBe("Queued");
    expect(c.sub).toContain("WILL SYNC");
  });

  it("tells a walk-up apart from a namesake and a repeat", () => {
    const registered: WalkupResult = { outcome: "REGISTERED", attendee: { ...base.attendee!, name: "Devika Menon", role: "attendee" }, duplicate_of: null, duplicate_by: null, checked_in: true, ticket_sent: true };
    expect(walkupCard(registered, "Gate A", "Devika")?.title).toBe("Devika Menon is registered and checked in.");
    expect(walkupCard({ ...registered, checked_in: false, ticket_sent: false }, "Gate A", "Devika")?.note).toContain("No address given");
    expect(walkupCard({ ...registered, outcome: "DUPLICATE", attendee: null, duplicate_of: { id: "x", name: "Ananya Iyer" }, duplicate_by: "NAME" }, "Gate A", "Ananya")?.tag).toBe("Same name on the list");
    expect(walkupCard({ ...registered, outcome: "DUPLICATE", attendee: null, duplicate_of: { id: "x", name: "Ananya Iyer" }, duplicate_by: "CONTACT" }, "Gate A", "Ananya")?.tag).toBe("Already on the list");
  });
});

describe("what the door reads from the server", () => {
  const wire = { outcome: "INVALID", attendee: null, checked_in_at: null, checked_in_by: null, other_event: null, revoked_at: null, capture: { ask: false, required: false, reason: "NOT_ADMITTED" }, replayed: false };

  it("parses a refusal from today's API, which sends no hint", () => {
    const r = scanResultSchema.parse(wire);
    expect(r.hint).toBeUndefined();
    expect(needsHandCheckIn(r)).toBe(false);
  });

  it("parses the admission-number hint and its holder", () => {
    const r = scanResultSchema.parse({ ...wire, hint: "ADMISSION_NUMBER", attendee: { id: "r9", name: "Devika Menon", ticket_id: "MOA-ABCDE-23456", role: "attendee", admission_no: "MOA-0042-E123" } });
    expect(needsHandCheckIn(r)).toBe(true);
    expect(r.attendee?.admission_no).toBe("MOA-0042-E123");
  });
});
