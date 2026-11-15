import { describe, expect, it } from "vitest";

import { anyMasked, isMasked } from "@/lib/masked";
import { attendeeSummarySchema, scanResultSchema } from "@/features/gate/schemas";
import { checkInLogSchema } from "@/features/doors/schemas";
import { registrationDetailSchema, registrationPageSchema } from "@/features/registrations/schemas";
import { outcomeCard } from "@/features/gate/lib/outcome-copy";

/**
 * Door staff are sent guests' contacts and ticket codes in part
 * ("a•••@gmail.com", "•••• 4321"), and no amounts. Every screen they use
 * reads such a row as it reads any other, and never acts on a masked value.
 */

const MASKS = ["a•••@gmail.com", "•••• 4321", "+91 ••••• •4321", "a***@gmail.com", "MOA-•••••-X9PWM", "a…@gmail.com", "a...@gmail.com"];

describe("a value shown in part", () => {
  it("is told from a real one, whatever the mask looks like", () => {
    for (const v of MASKS) expect(isMasked(v)).toBe(true);
    for (const v of ["ananya@gmail.com", "a.b.c@gmail.com", "+91 98450 14321", "MOA-7K3QF-X9PWM", "", null, undefined, 42]) expect(isMasked(v)).toBe(false);
    expect(anyMasked(null, "ananya@gmail.com", "•••• 4321")).toBe(true);
    expect(anyMasked(null, undefined)).toBe(false);
  });
});

describe("the door's lists, masked", () => {
  it("the gate search and a scan read a masked guest, or one with no code at all", () => {
    const masked = attendeeSummarySchema.parse({ id: "r1", name: "Ananya Iyer", ticket_id: "•••• 4321", role: "attendee", email: "a•••@gmail.com", phone: "•••• 4321", has_contact: true });
    expect(masked).toMatchObject({ ticket_id: "•••• 4321", email: "a•••@gmail.com", phone: "•••• 4321" });
    const bare = attendeeSummarySchema.parse({ id: "r1", name: "Ananya Iyer", ticket_id: null, role: "attendee", email: null });
    expect(bare.ticket_id).toBe("");
    const left = attendeeSummarySchema.parse({ id: "r1", name: "Ananya Iyer", role: "attendee" });
    expect(left.ticket_id).toBe("");
    const scan = scanResultSchema.parse({
      outcome: "CHECKED_IN",
      attendee: { id: "r1", name: "Ananya Iyer", role: "attendee" },
      checked_in_at: null,
      checked_in_by: null,
      other_event: null,
      revoked_at: null,
      capture: { ask: false, required: false, reason: "DISABLED" },
    });
    // No code to show: the card says the rest, with no stray separator.
    expect(outcomeCard(scan, "Gate A").sub).toBe("ATTENDEE · GATE A");
  });

  it("the check-ins log reads masked rows", () => {
    const log = checkInLogSchema.parse({
      items: [
        {
          id: "c1",
          registration_id: "r1",
          name: "Ananya Iyer",
          email: "a•••@gmail.com",
          ticket_id: "•••• 4321",
          role: "attendee",
          door: { id: "d1", name: "Gate A", kind: "door" },
          via: "SCAN",
          checked_in_at: "2026-11-28T04:00:00Z",
          recorded_at: "2026-11-28T04:00:00Z",
          by: { kind: "USER", id: 3, name: "Vani" },
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
      facets: { total: 1, doors: [], methods: [], staff: [] },
    });
    expect(log.items[0]).toMatchObject({ email: "a•••@gmail.com", ticket_id: "•••• 4321" });
  });

  it("the guest list and a guest in full read masked contacts and no amounts", () => {
    const row = { id: "0b6e", ticket_id: "•••• 4321", full_name: "Ananya Iyer", email: "a•••@gmail.com", phone: "+91 ••••• •4321", is_paid: true, actual_amount: null, missing_answers: [] };
    const page = registrationPageSchema.parse({ items: [row, { ...row, id: "0b6f", paid_amount: "hidden" }], total: 2, offset: 0, limit: 50 });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ ticket_id: "•••• 4321", email: "a•••@gmail.com", phone: "+91 ••••• •4321" });
    expect(page.items[1]!.paid_amount).toBeNull();
    expect(registrationDetailSchema.parse({ ...row, additional_details: {} })).toMatchObject({ email: "a•••@gmail.com" });
  });
});
