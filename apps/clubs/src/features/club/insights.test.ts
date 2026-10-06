import { describe, expect, it } from "vitest";

import {
  CLOSING_SOON_HOURS,
  byDateAscending,
  isClosingSoon,
  isUpcoming,
  needsAttendance,
  summariseReach,
} from "./insights";
import type { ClubEvent } from "@/features/events";

/**
 * What the overview decides is "next", "closing" and "unfinished".
 *
 * All of it is date arithmetic over nullable fields, and every mistake renders
 * as a confident wrong answer: an event that already happened presented as
 * next, a closed registration flagged as closing soon, a club told everything
 * is done when it is not.
 */
const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const hoursFromNow = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

function event(overrides: Partial<ClubEvent> = {}): ClubEvent {
  return {
    id: 1,
    name: "An event",
    event_datetime: hoursFromNow(48),
    registration_count: 0,
    attended_count: 0,
    page_views: 0,
    has_fee: false,
    has_prize: false,
    ...overrides,
  } as ClubEvent;
}

describe("what counts as upcoming", () => {
  it("excludes an event that has already started", () => {
    expect(isUpcoming(event({ event_datetime: hoursFromNow(-1) }), NOW)).toBe(false);
  });

  it("excludes an event with no date rather than treating it as 1970", () => {
    expect(isUpcoming(event({ event_datetime: null }), NOW)).toBe(false);
  });

  it("sorts undated events last, not first", () => {
    // Sorting them to the top would make an undated draft the "next event".
    const sorted = [
      event({ id: 1, event_datetime: null }),
      event({ id: 2, event_datetime: hoursFromNow(72) }),
      event({ id: 3, event_datetime: hoursFromNow(24) }),
    ].sort(byDateAscending);
    expect(sorted.map((e) => e.id)).toEqual([3, 2, 1]);
  });
});

describe("closing soon", () => {
  it("flags a registration deadline inside the window", () => {
    const e = event({ reg_enddate: hoursFromNow(CLOSING_SOON_HOURS - 1) });
    expect(isClosingSoon(e, NOW)).toBe(true);
  });

  it("does not flag one that has already closed", () => {
    expect(isClosingSoon(event({ reg_enddate: hoursFromNow(-2) }), NOW)).toBe(false);
  });

  it("does not flag a past event, whose deadline is also in the past", () => {
    // Otherwise every old event in the list wears a "closing soon" badge.
    const e = event({
      event_datetime: hoursFromNow(-100),
      reg_enddate: hoursFromNow(-120),
    });
    expect(isClosingSoon(e, NOW)).toBe(false);
  });

  it("does not flag an event with no deadline set", () => {
    expect(isClosingSoon(event({ reg_enddate: null }), NOW)).toBe(false);
  });
});

describe("attendance still to mark", () => {
  it("flags a finished event with registrations and nobody marked", () => {
    const e = event({
      event_datetime: hoursFromNow(-24),
      registration_count: 30,
      attended_count: 0,
    });
    expect(needsAttendance(e, NOW)).toBe(true);
  });

  it("ignores a finished event nobody registered for", () => {
    // There is nothing to mark, so listing it is noise.
    const e = event({ event_datetime: hoursFromNow(-24), registration_count: 0 });
    expect(needsAttendance(e, NOW)).toBe(false);
  });

  it("ignores an event that has not happened yet", () => {
    const e = event({ event_datetime: hoursFromNow(24), registration_count: 30 });
    expect(needsAttendance(e, NOW)).toBe(false);
  });

  it("ignores one already marked", () => {
    const e = event({
      event_datetime: hoursFromNow(-24),
      registration_count: 30,
      attended_count: 12,
    });
    expect(needsAttendance(e, NOW)).toBe(false);
  });
});

describe("reach", () => {
  it("measures turnout only over events that have happened", () => {
    /*
     * An upcoming event has registrations and nobody attended yet, which is
     * normal. Counting it drags turnout toward zero and reports a problem
     * that has not had the chance to occur.
     */
    const reach = summariseReach(
      [
        event({ event_datetime: hoursFromNow(-48), registration_count: 10, attended_count: 8 }),
        event({ event_datetime: hoursFromNow(48), registration_count: 90, attended_count: 0 }),
      ],
      NOW
    );
    expect(reach.attendancePercent).toBe(80);
  });

  it("counts views and registrations across everything, upcoming included", () => {
    const reach = summariseReach(
      [
        event({ event_datetime: hoursFromNow(-48), page_views: 100, registration_count: 10 }),
        event({ event_datetime: hoursFromNow(48), page_views: 300, registration_count: 30 }),
      ],
      NOW
    );
    expect(reach.views).toBe(400);
    expect(reach.registrations).toBe(40);
    expect(reach.conversionPercent).toBe(10);
  });

  it("reports zero rather than NaN before anyone has looked", () => {
    const reach = summariseReach([event({ page_views: 0, registration_count: 0 })], NOW);
    expect(reach.conversionPercent).toBe(0);
    expect(reach.attendancePercent).toBe(0);
  });

  it("treats missing counts as zero rather than failing", () => {
    const reach = summariseReach(
      [event({ page_views: null, registration_count: null, attended_count: null })],
      NOW
    );
    expect(reach.views).toBe(0);
    expect(Number.isNaN(reach.conversionPercent)).toBe(false);
  });
});
