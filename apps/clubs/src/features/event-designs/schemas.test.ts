import { describe, expect, it } from "vitest";

import { AUDIENCES, describeSource, designResponseSchema } from "./schemas";

/**
 * What the editor tells the organiser about where a design came from.
 *
 * This is the whole safety story of the fork. "Editing your club's default"
 * and "editing this event's design" look identical on screen, and getting
 * them the wrong way round means a club rewrites the design of every event
 * still following its template -- including events whose tickets have
 * already been emailed out.
 */
describe("describeSource", () => {
  it.each(["club_default", "system"] as const)(
    "warns that saving makes a copy when showing the %s",
    (source) => {
      expect(describeSource(source)).toMatch(/copy for this event/i);
    }
  );

  it.each(["event_default", "event_role"] as const)(
    "does not warn about copying when the event already owns it (%s)",
    (source) => {
      expect(describeSource(source)).not.toMatch(/copy for this event/i);
    }
  );

  it("says which design every source maps to", () => {
    const sources = ["event_role", "event_default", "club_default", "system"] as const;

    for (const source of sources) {
      expect(describeSource(source).length).toBeGreaterThan(0);
    }
  });
});

describe("the design response", () => {
  const valid = {
    config: { bg_color: "#101014" },
    audience: "event_default",
    source: "club_default",
    is_own: false,
    template_id: 7,
  };

  it("parses what the API returns", () => {
    expect(designResponseSchema.parse(valid).source).toBe("club_default");
  });

  it("accepts a design with no template behind it yet", () => {
    // The system default has no row, so there is no id to report.
    const parsed = designResponseSchema.parse({
      ...valid,
      source: "system",
      template_id: null,
    });

    expect(parsed.template_id).toBeNull();
  });

  it("rejects a source it does not know how to describe", () => {
    // Better to fail loudly than to render a blank explanation above a
    // button that forks the design.
    expect(
      designResponseSchema.safeParse({ ...valid, source: "club_role" }).success
    ).toBe(false);
  });

  it("defaults is_own to false, so a reset is never offered by accident", () => {
    const { is_own: _omitted, ...withoutFlag } = valid;

    expect(designResponseSchema.parse(withoutFlag).is_own).toBe(false);
  });
});

describe("audiences", () => {
  it("offers one design for the whole event first", () => {
    // The common case by far: most events want one ticket design, and the
    // variants exist for the clubs that need a speaker badge to differ.
    expect(AUDIENCES[0]).toEqual({ value: "event_default", label: "Everyone" });
  });

  it("covers every role the backend can resolve a variant for", () => {
    expect(AUDIENCES.map((a) => a.value)).toEqual([
      "event_default",
      "attendee",
      "speaker",
      "staff",
    ]);
  });
});
