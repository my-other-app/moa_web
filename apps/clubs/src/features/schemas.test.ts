import { describe, expect, it } from "vitest";

import announcementsFixture from "./__fixtures__/announcements.json";
import clubEventsFixture from "./__fixtures__/club-events.json";
import clubInfoFixture from "./__fixtures__/club-info.json";

import { announcementHistorySchema, sendAnnouncementSchema } from "./announcements/schemas";
import { clubProfileFormSchema, clubSelfSchema } from "./club/schemas";
import { clubEventPageSchema } from "./events/schemas";

/**
 * Real responses captured from the production API as the letmegoo club (names,
 * emails and phone numbers scrubbed). Same rationale as the admin app's
 * equivalent: the backend publishes nearly every field as `anyOf: [string, {}]`
 * because of a wildcard field_serializer, so the generated types cannot catch a
 * shape change and these schemas are the only thing that will.
 */
describe("club response schemas match the live API", () => {
  it("parses the club's own profile", () => {
    const club = clubSelfSchema.parse(clubInfoFixture);
    expect(typeof club.name).toBe("string");
    expect(typeof club.total_events).toBe("number");
  });

  it("parses the club's event list with its counts", () => {
    const page = clubEventPageSchema.parse(clubEventsFixture);
    expect(page.items.length).toBeGreaterThan(0);
    const first = page.items[0]!;
    expect(typeof first.registration_count === "number" || first.registration_count === null).toBe(true);
  });

  it("parses announcement history, which uses a different envelope", () => {
    // This endpoint returns { items, total } with no limit/offset, so it must
    // not be parsed with the standard paginated schema.
    const history = announcementHistorySchema.parse(announcementsFixture);
    expect(Array.isArray(history.items)).toBe(true);
    expect(typeof history.total).toBe("number");
  });

  it("tolerates a club with no optional fields set", () => {
    // about/org/socials are null for real clubs in production, so a parse must
    // not depend on them being present.
    const minimal = {
      ...(clubInfoFixture as Record<string, unknown>),
      about: null,
      org: null,
      socials: null,
      rating: null,
    };
    expect(() => clubSelfSchema.parse(minimal)).not.toThrow();
  });
});

describe("form schemas", () => {
  it("accepts empty optional contact and social fields", () => {
    // Clearing a field submits "", which must validate -- otherwise an
    // organiser can never remove a social link once set.
    const result = clubProfileFormSchema.safeParse({
      name: "My Club",
      about: "",
      location_name: "",
      contact_email: "",
      contact_phone: "",
      instagram: "",
      youtube: "",
      linkedin: "",
      website: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email and a non-URL social link", () => {
    expect(clubProfileFormSchema.safeParse({ name: "X", contact_email: "nope" }).success).toBe(false);
    expect(clubProfileFormSchema.safeParse({ name: "X", instagram: "instagram.com/x" }).success).toBe(false);
  });

  it("requires a title and body before an announcement can be sent", () => {
    expect(sendAnnouncementSchema.safeParse({ title: "", body: "" }).success).toBe(false);
    expect(
      sendAnnouncementSchema.safeParse({ title: "Venue change", body: "Now in Hall B." }).success
    ).toBe(true);
  });
});
