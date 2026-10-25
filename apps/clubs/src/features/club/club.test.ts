import { beforeEach, describe, expect, it, vi } from "vitest";

import clubInfoFixture from "../__fixtures__/club-info.json";
import interestsFixture from "../__fixtures__/interests.json";
import orgsFixture from "../__fixtures__/orgs.json";

const put = vi.fn();
const get = vi.fn();

vi.mock("@moa/app-kit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@moa/app-kit")>()),
  api: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    post: vi.fn(),
  },
}));

const { fetchOrganizations, updateMyClub } = await import("./api");
const { fetchTopicTree } = await import("@/features/topics");
const { clubProfileFormSchema, clubSelfSchema, interestEmoji } = await import(
  "./schemas"
);

function formEntries(body: unknown): Record<string, string> {
  expect(body).toBeInstanceOf(FormData);
  const out: Record<string, string> = {};
  for (const [key, value] of (body as FormData).entries()) out[key] = String(value);
  return out;
}

/** Valid values for every required field, so each test varies only one thing. */
function baseForm() {
  return clubProfileFormSchema.parse({
    name: "IEDC CET",
    about: "We build things.",
    org_id: 1,
    location_name: "Sreekaryam",
    location_link: "https://maps.example/x",
    contact_email: "club@example.com",
    contact_phone: "9000000000",
    instagram: "https://instagram.com/iedccet",
    youtube: "",
    linkedin: "",
    website: "",
    interest_ids: [6, 7, 10],
  });
}

beforeEach(() => {
  put.mockReset();
  get.mockReset();
});

/**
 * PUT /clubs/update is destructive by design: `update_club` assigns every
 * column from the request and runs an unconditional
 * `DELETE FROM club_interests_link WHERE club_id = …` before re-adding only
 * the ids it was given. A payload that leaves a field out therefore clears it.
 *
 * The first version of this form sent nine text fields and no `org_id` or
 * `interest_ids`, so every save silently unlinked the club's organization and
 * deleted all of its focus areas. These tests pin the full payload so that
 * cannot come back.
 */
describe("updateMyClub sends everything the endpoint overwrites", () => {
  it("includes the interest ids as a comma-separated list", async () => {
    await updateMyClub(baseForm());
    expect(formEntries(put.mock.calls[0]![1]).interest_ids).toBe("6,7,10");
  });

  it("includes org_id when one is selected", async () => {
    await updateMyClub(baseForm());
    expect(formEntries(put.mock.calls[0]![1]).org_id).toBe("1");
  });

  it("omits org_id entirely when there is none", async () => {
    // `org_id` is typed `int | None`, so an empty string is a 422 -- "no
    // organization" has to be the absence of the part.
    await updateMyClub({ ...baseForm(), org_id: null });
    expect(formEntries(put.mock.calls[0]![1])).not.toHaveProperty("org_id");
  });

  it("sends an empty interest list rather than dropping the field", async () => {
    await updateMyClub({ ...baseForm(), interest_ids: [] });
    expect(formEntries(put.mock.calls[0]![1]).interest_ids).toBe("");
  });

  it("round-trips every text field the handler assigns", async () => {
    await updateMyClub(baseForm());
    const entries = formEntries(put.mock.calls[0]![1]);
    for (const key of [
      "about",
      "location_name",
      "location_link",
      "contact_email",
      "contact_phone",
      "instagram",
      "youtube",
      "linkedin",
      "website",
    ]) {
      expect(entries, `missing ${key}`).toHaveProperty(key);
    }
  });

  it("keeps the location link, which the design has no field for", async () => {
    await updateMyClub(baseForm());
    expect(formEntries(put.mock.calls[0]![1]).location_link).toBe(
      "https://maps.example/x"
    );
  });
});

/**
 * The pin is the one thing the club update does not resend every time: the
 * server keeps deriving a pin from the link or the location's name, and a
 * derived one sent back would be stored as the club's own.
 */
describe("updateMyClub and the club's pin", () => {
  it("sends a pin the club set as lat and lng", async () => {
    await updateMyClub({ ...baseForm(), lat: 8.5241, lng: 76.9366, geo_source: "manual" });
    const entries = formEntries(put.mock.calls[0]![1]);
    expect(entries.lat).toBe("8.5241");
    expect(entries.lng).toBe("76.9366");
    expect(entries).not.toHaveProperty("clear_point");
  });

  it("sends clear_point for a removed pin, with no point", async () => {
    await updateMyClub({ ...baseForm(), lat: null, lng: null, geo_source: null, clear_point: true });
    const entries = formEntries(put.mock.calls[0]![1]);
    expect(entries.clear_point).toBe("true");
    expect(entries).not.toHaveProperty("lat");
    expect(entries).not.toHaveProperty("lng");
  });

  it("sends nothing for a pin from the link or the name, or none", async () => {
    for (const pin of [{ lat: 8.5, lng: 76.9, geo_source: "link" as const }, { lat: 8.5, lng: 76.9, geo_source: "geocoded" as const }, {}]) {
      put.mockReset();
      await updateMyClub({ ...baseForm(), ...pin });
      const entries = formEntries(put.mock.calls[0]![1]);
      expect(entries).not.toHaveProperty("lat");
      expect(entries).not.toHaveProperty("clear_point");
      // The link itself is still sent, as every save always has.
      expect(entries.location_link).toBe("https://maps.example/x");
    }
  });

  it("takes both latitude and longitude, or neither", () => {
    expect(clubProfileFormSchema.safeParse({ ...baseForm(), lat: 8.5 }).success).toBe(false);
    expect(clubProfileFormSchema.safeParse({ ...baseForm(), lat: 8.5, lng: 76.9 }).success).toBe(true);
    expect(clubProfileFormSchema.safeParse({ ...baseForm(), lat: 8.5, lng: 200 }).success).toBe(false);
  });

  it("reads the pin off the club, and none when it has none", () => {
    expect(clubSelfSchema.parse({ ...clubInfoFixture, lat: 8.5241, lng: 76.9366, geo_source: "link" })).toMatchObject({ lat: 8.5241, lng: 76.9366, geo_source: "link" });
    const bare = clubSelfSchema.parse(clubInfoFixture);
    expect(bare.lat ?? null).toBeNull();
    expect(bare.geo_source ?? null).toBeNull();
    // A source this build does not know is no reason to fail the whole club.
    expect(clubSelfSchema.parse({ ...clubInfoFixture, lat: 8.5, lng: 76.9, geo_source: "satellite" }).geo_source).toBeNull();
  });
});

/**
 * The original defect was not in the serialiser but in the schema: the form
 * type simply had no `org_id` or `interest_ids`, so no payload could carry
 * them however it was built. This pins the field set itself, which is what
 * silently narrowed.
 */
describe("the form schema covers every column the endpoint assigns", () => {
  const OVERWRITTEN = [
    "name",
    "about",
    "org_id",
    "location_name",
    "location_link",
    "contact_email",
    "contact_phone",
    "instagram",
    "youtube",
    "linkedin",
    "website",
    "interest_ids",
  ].sort();

  it("parses to exactly those fields", () => {
    expect(Object.keys(baseForm()).sort()).toEqual(OVERWRITTEN);
  });
});

describe("club profile form validation", () => {
  it("does not hold the profile to the name, which the form cannot change", () => {
    // A club an admin or the demo seed made can be named past the old
    // 20-character check ("Thattukada Design Club"); that check made Save do
    // nothing for it.
    expect(
      clubProfileFormSchema.safeParse({ ...baseForm(), name: "Thattukada Design Club" }).success
    ).toBe(true);
    expect(clubProfileFormSchema.safeParse({ ...baseForm(), name: undefined }).success).toBe(true);
  });

  it("saves a long-named club's profile without sending the name", async () => {
    // PUT /clubs/update ignores the name and refuses one over 20 characters.
    await updateMyClub({ ...baseForm(), name: "Thattukada Design Club" });
    const entries = formEntries(put.mock.calls[0]![1]);
    expect(entries).not.toHaveProperty("name");
    expect(entries.about).toBe("We build things.");
  });

  it("accepts an empty social link but not a bare handle", () => {
    expect(
      clubProfileFormSchema.safeParse({ ...baseForm(), instagram: "" }).success
    ).toBe(true);
    expect(
      clubProfileFormSchema.safeParse({ ...baseForm(), instagram: "@iedccet" }).success
    ).toBe(false);
  });
});

describe("reference data schemas", () => {
  it("parses the category-wise interest list", async () => {
    get.mockResolvedValue(interestsFixture);
    const categories = await fetchTopicTree();
    expect(categories.map((c) => c.name)).toEqual(["Academic", "Creative"]);
    expect(categories[0]!.interests.length).toBe(3);
  });

  it("parses the organization list", async () => {
    get.mockResolvedValue(orgsFixture);
    const orgs = await fetchOrganizations();
    expect(orgs[0]!.name).toBe("College of Engineering Trivandrum");
  });

  it("reads the club's interests as objects, not opaque values", () => {
    const club = clubSelfSchema.parse(clubInfoFixture);
    expect(club.interests.map((i) => i.name)).toEqual([
      "Coding",
      "UI/UX",
      "Marketing",
    ]);
  });

  it("reads the club's topics when the server sends them, and null from one before topics", () => {
    expect(clubSelfSchema.parse(clubInfoFixture).topics).toBeNull();
    const club = clubSelfSchema.parse({ ...clubInfoFixture, topics: [{ id: 1, slug: "development", name: "Development", color: "#2563EB" }] });
    expect(club.topics).toEqual([{ id: 1, slug: "development", name: "Development", color: "#2563EB" }]);
    // A malformed list reads as absent rather than failing the whole profile.
    expect(clubSelfSchema.parse({ ...clubInfoFixture, topics: "development" }).topics).toBeNull();
  });
});

describe("interest icons", () => {
  it("renders a real emoji", () => {
    expect(interestEmoji({ icon: "🎨", icon_type: "emoji" })).toBe("🎨");
  });

  it("drops the seeded placeholder rather than printing it on the chip", () => {
    // Several production rows literally store the word "string".
    expect(interestEmoji({ icon: "string", icon_type: "emoji" })).toBeNull();
  });

  it("ignores an icon that is not declared as an emoji", () => {
    expect(interestEmoji({ icon: "🎨", icon_type: "url" })).toBeNull();
    expect(interestEmoji({ icon: null, icon_type: "emoji" })).toBeNull();
  });
});
