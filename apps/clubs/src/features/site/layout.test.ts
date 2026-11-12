import { describe, expect, it } from "vitest";

import { layoutFor, layoutPatch, listWords, mergeLayout, moved, placesByImage, sameLayout, slotFills, slotLabel } from "./layout";
import { fixedOf, layoutSchema, siteImageSchema, siteSchema, templateSchema, type Layout, type SiteImage } from "./schemas";

const classic = templateSchema.parse({
  key: "classic",
  name: "Classic",
  sections: [
    { key: "about", label: "About", default_title: "About us", hideable: true },
    { key: "upcoming", label: "Upcoming events", default_title: "Upcoming", hideable: false },
    { key: "past", label: "Past events", default_title: "Past events" },
    { key: "photos", label: "Photos", default_title: "Photos" },
  ],
  slots: [
    { key: "hero.cover", label: "Cover photo", size: [1440, 300], section: "hero" },
    { key: "photos.2", label: "Photo 2", size: [720, 480], section: "photos" },
    { key: "photos.1", label: "Photo 1", size: [720, 480], section: "photos" },
  ],
});
const editorial = templateSchema.parse({ key: "editorial", name: "Editorial", sections: [{ key: "speakers", label: "Speakers" }, { key: "about", label: "About" }], slots: [{ key: "hero.cover", label: "Cover", size: { w: 1200, h: 600 } }] });

const img = (id: number, position: number, used_in: string[] = []): SiteImage => ({ id, url: `u${id}`, srcset: null, alt: null, width: null, height: null, position, used_in });
const L = (over: Partial<Layout> = {}): Layout => ({ order: [], hidden: [], titles: {}, slots: {}, accent: null, ...over });

describe("the layout, as a template keeps it", () => {
  it("drops unknown sections, appends missing ones in default order, and keeps only what may be hidden", () => {
    const l = layoutFor(classic, L({ order: ["past", "speakers", "about", "past"], hidden: ["upcoming", "past", "speakers"] }));
    expect(l.order).toEqual(["past", "about", "upcoming", "photos"]);
    expect(l.hidden).toEqual(["past"]);
  });

  it("trims titles to 60, and drops empty ones and the template's own", () => {
    const l = layoutFor(classic, L({ titles: { about: "  About us ", past: "x".repeat(70), photos: "   ", speakers: "Talks" } }));
    expect(l.titles).toEqual({ past: "x".repeat(60) });
  });

  it("keeps slots the template has, for photos the club still has", () => {
    const l = layoutFor(classic, L({ slots: { "hero.cover": 1, "join.image": 2, "photos.1": 9 } }), new Set([1, 2]));
    expect(l.slots).toEqual({ "hero.cover": 1 });
  });

  it("keeps another template's settings in the draft while this one is edited", () => {
    const union = L({ order: ["speakers", "about"], titles: { speakers: "Talks" }, slots: { "hero.cover": 3 } });
    const edited = { ...layoutFor(classic, union), order: ["photos", "about", "upcoming", "past"], slots: {} };
    const merged = mergeLayout(union, classic, edited);
    expect(merged.order).toEqual(["photos", "about", "upcoming", "past", "speakers"]);
    expect(merged.titles).toEqual({ speakers: "Talks" });
    // Cleared here: classic owns hero.cover too.
    expect(merged.slots).toEqual({});
    // Back on editorial: the shared keys keep the latest order, its own one follows.
    expect(layoutFor(editorial, merged).order).toEqual(["about", "speakers"]);
  });

  it("compares layouts whatever their keys' order", () => {
    expect(sameLayout(L({ slots: { a: 1, b: 2 }, hidden: ["x", "y"] }), L({ slots: { b: 2, a: 1 }, hidden: ["y", "x"] }))).toBe(true);
    expect(sameLayout(L({ order: ["a", "b"] }), L({ order: ["b", "a"] }))).toBe(false);
    expect(sameLayout(L({ accent: "#AABBCC" }), L({ accent: "#aabbcc" }))).toBe(true);
    expect(sameLayout(L({ accent: null }), L({ accent: "#aabbcc" }))).toBe(false);
  });

  it("sends a cleared title or slot as null (the API merges them by key)", () => {
    const saved = L({ order: ["a"], titles: { about: "Hello", past: "Before" }, slots: { "hero.cover": 1, "photos.1": 2 } });
    const now = L({ order: ["a"], titles: { past: "Earlier" }, slots: { "photos.1": 3 }, accent: "#112233" });
    expect(layoutPatch(saved, now)).toEqual({ order: ["a"], hidden: [], titles: { past: "Earlier", about: null }, slots: { "photos.1": 3, "hero.cover": null }, accent: "#112233" });
  });

  it("moves an item, clamped to the list", () => {
    expect(moved(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moved(["a", "b", "c"], 2, -4)).toEqual(["c", "a", "b"]);
    expect(moved(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });
});

describe("photo places", () => {
  const images = [img(5, 2), img(3, 0), img(4, 1)];

  it("fills empty gallery places from the library in order, skipping photos chosen elsewhere", () => {
    const fills = slotFills(classic, L({ slots: { "hero.cover": 3 } }), images);
    expect(fills["hero.cover"]).toEqual({ image: images[1], auto: false });
    expect(fills["photos.1"]).toMatchObject({ image: { id: 4 }, auto: true });
    expect(fills["photos.2"]).toMatchObject({ image: { id: 5 }, auto: true });
  });

  it("leaves a gallery place empty when the library runs out", () => {
    const fills = slotFills(classic, L({ slots: { "photos.2": 4, "hero.cover": 3 } }), images);
    expect(fills["photos.2"]).toMatchObject({ image: { id: 4 }, auto: false });
    expect(fills["photos.1"]).toMatchObject({ image: { id: 5 }, auto: true });
    expect(slotFills(classic, L(), [])["photos.1"]).toEqual({ image: null, auto: false });
  });

  it("names where each photo shows: chosen, or filling the gallery", () => {
    const places = placesByImage(classic, L({ slots: { "hero.cover": 3, "photos.2": 3 } }), images);
    expect(places.get(3)).toEqual(["Cover photo", "Photo 2"]);
    expect(places.get(4)).toEqual(["Photo 1"]);
    expect(places.get(5)).toBeUndefined();
    expect(slotLabel(undefined, "photos.7")).toBe("Photo 7");
    expect(listWords(["A"])).toBe("A");
    expect(listWords(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("the site as either server sends it", () => {
  it("reads the fixed rows either way the server writes them, and a photo not yet viewable", () => {
    expect(fixedOf(templateSchema.parse({ key: "k", name: "K", fixed: { top: ["nav"], side: ["profile"], bottom: ["footer"] } }))).toEqual({ top: ["nav"], side: ["profile"], bottom: ["footer"] });
    expect(fixedOf(templateSchema.parse({ key: "k", name: "K", fixed_top: ["nav", "hero"] }))).toEqual({ top: ["nav", "hero"], side: [], bottom: [] });
    expect(siteImageSchema.parse({ id: 1, url: null, srcset: null, alt: null, width: 10, height: 10, position: 0, used_in: [] }).url).toBeNull();
  });

  it("reads sizes in either shape, a template accent, and a layout's nulls", () => {
    expect(editorial.slots?.[0]?.size).toEqual([1200, 600]);
    expect(templateSchema.parse({ key: "k", name: "K", accent: { default: "#112233", vars: ["--accent"] } }).accent).toBe("#112233");
    expect(layoutSchema.parse({ order: ["a"], hidden: [], titles: {}, slots: { "hero.cover": null, "photos.1": 4 }, accent: "red" })).toEqual({ order: ["a"], hidden: [], titles: {}, slots: { "photos.1": 4 }, accent: null });
  });

  it("reads a server before v2 without a layout", () => {
    const s = siteSchema.parse({
      template: "launchpad", theme: "light", font: "dm_sans", headline: null, subline: null, default_headline: "H", default_subline: null,
      sections: { hero: true }, available: { hero: true }, published_at: null, stale: false, url: "https://x.myotherapp.in", slug: "x",
      templates: [{ key: "launchpad", name: "Launchpad", blurb: "b" }], fonts: [],
    });
    expect(s.layout ?? null).toBeNull();
    expect(s.templates[0]?.sections).toBeUndefined();
    expect(s.sections).toEqual({ hero: true });
  });
});
