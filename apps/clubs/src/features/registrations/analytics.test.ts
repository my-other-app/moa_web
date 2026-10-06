import { describe, expect, it } from "vitest";

import { eventAnalyticsSchema } from "./schemas";

/**
 * The analytics payload.
 *
 * Most of it was arriving and being thrown away: the schema declared four
 * fields as `unknown` and omitted two entirely, which `.passthrough()` hid.
 * These pin the shapes so a backend change surfaces as one clear error rather
 * than a panel that silently renders nothing.
 */
const FULL = {
  total_registrations: 128,
  total_revenue: 16000,
  attendance_rate: 73.4,
  conversion_rate: 23.7,
  payment_status: { paid: 64, unpaid: 64 },
  attendance_status: { attended: 94, absent: 34 },
  top_institutions: [
    { name: "CUSAT", value: 40 },
    { name: "NIT Calicut", value: 22 },
  ],
  total_institutions: 17,
  registration_time: { morning: 10, afternoon: 60, evening: 50, night: 8 },
  attendance_over_time: [
    { time: "10 AM", count: 30 },
    { time: "11 AM", count: 64 },
  ],
};

describe("event analytics", () => {
  it("parses every field the endpoint returns", () => {
    const data = eventAnalyticsSchema.parse(FULL);
    expect(data.payment_status?.paid).toBe(64);
    expect(data.attendance_status?.absent).toBe(34);
    expect(data.top_institutions[0]).toEqual({ name: "CUSAT", value: 40 });
    expect(data.registration_time?.afternoon).toBe(60);
    expect(data.attendance_over_time).toHaveLength(2);
  });

  it("keeps total_institutions separate from the top five", () => {
    // top_institutions is sliced server-side, so deriving the count from its
    // length would report 5 for an event with seventeen colleges.
    const data = eventAnalyticsSchema.parse(FULL);
    expect(data.total_institutions).toBe(17);
    expect(data.total_institutions).toBeGreaterThan(data.top_institutions.length);
  });

  it("survives an event with no registrations at all", () => {
    // Every aggregate is absent or zero before anyone signs up, and the panel
    // has to render rather than throw.
    const data = eventAnalyticsSchema.parse({});
    expect(data.total_registrations).toBe(0);
    expect(data.total_revenue).toBe(0);
    expect(data.top_institutions).toEqual([]);
    expect(data.attendance_over_time).toEqual([]);
  });

  it("tolerates the nullable breakdowns being omitted", () => {
    const data = eventAnalyticsSchema.parse({ total_registrations: 3 });
    expect(data.payment_status ?? null).toBeNull();
    expect(data.registration_time ?? null).toBeNull();
  });

  it("rejects a breakdown that changed shape rather than rendering nothing", () => {
    // This is the failure the old `z.record(z.unknown())` would have hidden.
    expect(() =>
      eventAnalyticsSchema.parse({ ...FULL, payment_status: { paid: "lots" } })
    ).toThrow();
  });
});
