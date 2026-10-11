import { describe, expect, it } from "vitest";

import { outcomeCard, walkupCard } from "./lib/outcome-copy";
import type { ScanResult, WalkupResult } from "./schemas";

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
