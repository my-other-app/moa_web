import { describe, expect, it } from "vitest";

import avatarsFixture from "./__fixtures__/avatars.json";
import badgesFixture from "./__fixtures__/badges.json";
import clubsFixture from "./__fixtures__/clubs.json";
import eventsFixture from "./__fixtures__/events.json";
import orgsFixture from "./__fixtures__/orgs.json";
import usersFixture from "./__fixtures__/users.json";

import { avatarListSchema } from "./avatars/schemas";
import { badgeListSchema } from "./badges/schemas";
import { adminClubPageSchema } from "./clubs/schemas";
import { adminEventPageSchema } from "./events/schemas";
import { orgListSchema } from "./orgs/schemas";
import { adminUserPageSchema } from "./users/schemas";

/**
 * These fixtures are real responses captured from the production API (with
 * names, emails and phone numbers scrubbed).
 *
 * They exist because the backend publishes almost every field as
 * `anyOf: [string, {}]` -- a wildcard `@field_serializer` in CustomBaseModel
 * annotated `-> Union[str, Any]` -- so the generated OpenAPI types degrade to
 * `unknown` and cannot catch a shape change. Without these, a renamed or
 * re-typed field would compile fine and surface as an empty table in
 * production. Re-capture them when the API changes deliberately; a failure
 * here means the contract moved.
 */
describe("response schemas match the live API", () => {
  it("parses the admin user list", () => {
    const page = adminUserPageSchema.parse(usersFixture);
    expect(page.items.length).toBeGreaterThan(0);
    expect(typeof page.items[0]!.username).toBe("string");
    expect(typeof page.items[0]!.id).toBe("number");
  });

  it("parses the admin club list, including verification state", () => {
    const page = adminClubPageSchema.parse(clubsFixture);
    expect(page.items.length).toBeGreaterThan(0);
    expect(typeof page.items[0]!.is_verified).toBe("boolean");
  });

  it("parses the admin event list, including nullable club/category refs", () => {
    const page = adminEventPageSchema.parse(eventsFixture);
    expect(page.items.length).toBeGreaterThan(0);
    // club_id is nullable in the database, so the nested ref must tolerate null.
    expect(() => adminEventPageSchema.parse({ ...page, items: page.items.map((e) => ({ ...e, club: null })) })).not.toThrow();
  });

  it("parses organisations and badges, which return bare arrays", () => {
    expect(orgListSchema.parse(orgsFixture).length).toBeGreaterThan(0);
    expect(badgeListSchema.parse(badgesFixture).length).toBeGreaterThan(0);
  });

  it("parses avatars", () => {
    expect(avatarListSchema.parse(avatarsFixture).length).toBeGreaterThan(0);
  });

  it("rejects a response whose field type changed", () => {
    // Guards the guard: proves these schemas would actually fail rather than
    // silently coercing a breaking change.
    const broken = { ...(usersFixture as object), items: [{ id: 1 }] };
    expect(() => adminUserPageSchema.parse(broken)).toThrow();
  });
});
