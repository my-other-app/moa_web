import { describe, expect, it } from "vitest";

import { toEventFormData } from "./api";
import { eventDetailToFormValues } from "./mapper";
import { eventFormSchema } from "./schemas";

const base = {
  name: "Hack Night",
  category_id: 1,
  event_datetime: "2026-11-01T18:00",
  duration: 3,
  is_online: false,
  location_name: "Main Hall",
  has_fee: false,
  has_prize: false,
  interest_ids: [],
  additional_details: [],
  speakers: [],
};

const parse = (overrides: Record<string, unknown> = {}) =>
  eventFormSchema.parse({ ...base, ...overrides });

describe("toEventFormData — wire format", () => {
  it("sends interest_ids comma-separated, not as JSON", () => {
    // The backend's EventCreate does interest_ids.split(","), despite its own
    // comment calling it a "JSON string". A JSON array 400s with
    // "expected comma seperated integers".
    const fd = toEventFormData(parse({ interest_ids: [3, 7, 11] }));
    expect(fd.get("interest_ids")).toBe("3,7,11");
  });

  it("omits interest_ids entirely when none are chosen", () => {
    expect(toEventFormData(parse()).get("interest_ids")).toBeNull();
  });

  it("sends additional_details as a JSON array", () => {
    const fd = toEventFormData(
      parse({
        additional_details: [
          { key: "tshirt", label: "T-shirt size", field_type: "radio", required: true, options: ["S", "M"] },
        ],
      })
    );
    expect(JSON.parse(String(fd.get("additional_details")))).toEqual([
      { key: "tshirt", label: "T-shirt size", field_type: "radio", required: true, options: ["S", "M"] },
    ]);
  });

  it("always sends the booleans, so turning a fee off actually clears it", () => {
    const fd = toEventFormData(parse({ has_fee: false }));
    expect(fd.get("has_fee")).toBe("false");
    expect(fd.get("has_prize")).toBe("false");
    expect(fd.get("is_online")).toBe("false");
  });

  it("sends the club's items the event sells as a JSON list, only with merchandise on and the list known", () => {
    expect(toEventFormData(parse({ merch_enabled: true, store_item_ids: ["b", "a"] })).get("store_item_ids")).toBe('["b","a"]');
    expect(toEventFormData(parse({ merch_enabled: true, store_item_ids: [] })).get("store_item_ids")).toBe("[]");
    // Off: the choice is kept for when it comes back on.
    expect(toEventFormData(parse({ merch_enabled: false, store_item_ids: ["a"] })).get("store_item_ids")).toBeNull();
    // Unknown (an edit that could not read the offers): nothing, so they stay as they are.
    expect(toEventFormData(parse({ merch_enabled: true })).get("store_item_ids")).toBeNull();
    expect(toEventFormData(parse({ merch_enabled: true })).get("merch_enabled")).toBe("true");
  });

  it("omits optional numbers rather than sending empty strings", () => {
    // FastAPI's Optional[float] = Form(None) rejects "" with a 422.
    const fd = toEventFormData(parse());
    expect(fd.get("reg_fee")).toBeNull();
    expect(fd.get("max_participants")).toBeNull();
  });

  it("drops the fee amount when the event is not paid", () => {
    const fd = toEventFormData(parse({ has_fee: false, reg_fee: 250 }));
    expect(fd.get("reg_fee")).toBeNull();
  });

  it("drops the venue for an online event", () => {
    const fd = toEventFormData(
      parse({ is_online: true, url: "https://meet.example.com/x", location_name: "Main Hall" })
    );
    expect(fd.get("location_name")).toBeNull();
    expect(fd.get("url")).toBe("https://meet.example.com/x");
  });

  it("sends the venue's map link, and clears it when emptied or online", () => {
    const withLink = toEventFormData(parse({ location_name: "Lab 3", location_link: "https://maps.app.goo.gl/abc123" }));
    expect(withLink.get("location_link")).toBe("https://maps.app.goo.gl/abc123");
    expect(withLink.get("clear_location_link")).toBeNull();
    const emptied = toEventFormData(parse({ location_name: "Lab 3", location_link: "" }));
    expect(emptied.get("location_link")).toBeNull();
    expect(emptied.get("clear_location_link")).toBe("true");
    const online = toEventFormData(parse({ is_online: true, url: "https://meet.example.com/x", location_link: "https://maps.app.goo.gl/abc123" }));
    expect(online.get("location_link")).toBeNull();
    expect(online.get("clear_location_link")).toBe("true");
  });

  it("refuses a map link that is not a full URL", () => {
    const r = eventFormSchema.safeParse({ ...base, location_name: "Lab 3", location_link: "maps somewhere" });
    expect(r.success).toBe(false);
  });

  it("indexes speaker photos against the uploaded files", () => {
    const photo = new File(["x"], "a.png", { type: "image/png" });
    const fd = toEventFormData(
      parse({
        speakers: [
          { name: "No Photo" },
          { name: "With Photo", photoFile: photo },
          { name: "Kept Photo", photo_url: "https://cdn/x.png" },
        ],
      })
    );
    const speakers = JSON.parse(String(fd.get("speakers")));
    expect(speakers[0].photo_index).toBeUndefined();
    // The index must point at this speaker's position in speaker_photos, not
    // at its position in the speakers array.
    expect(speakers[1].photo_index).toBe(0);
    expect(speakers[2].photo_url).toBe("https://cdn/x.png");
    expect(fd.getAll("speaker_photos")).toHaveLength(1);
  });

  it("keeps a speaker's id so editing updates rather than duplicates", () => {
    const fd = toEventFormData(parse({ speakers: [{ id: 42, name: "Existing" }] }));
    expect(JSON.parse(String(fd.get("speakers")))[0].id).toBe(42);
  });

  it("sends a speaker's bio and link inside the speakers JSON, and null when empty so an edit clears them", () => {
    const fd = toEventFormData(
      parse({
        speakers: [
          { id: 7, name: "With Both", designation: "Prof", bio: "  Builds rovers.  ", link: "https://example.com/ananya" },
          { name: "Emptied", bio: "", link: "" },
          { name: "Never Set" },
        ],
      })
    );
    const speakers = JSON.parse(String(fd.get("speakers")));
    expect(speakers[0]).toEqual({ id: 7, name: "With Both", designation: "Prof", bio: "Builds rovers.", link: "https://example.com/ananya" });
    expect(speakers[1]).toMatchObject({ bio: null, link: null });
    expect(speakers[2]).toMatchObject({ bio: null, link: null });
  });
});

describe("toEventFormData — the venue pin", () => {
  const pinned = { lat: 12.9716, lng: 77.5946 };

  it("sends a pin the club set as lat and lng, and no clear_point", () => {
    const fd = toEventFormData(parse({ ...pinned, geo_source: "manual" }));
    expect(fd.get("lat")).toBe("12.9716");
    expect(fd.get("lng")).toBe("77.5946");
    expect(fd.get("clear_point")).toBeNull();
  });

  it("leaves a pin from the map link or the venue name to the server", () => {
    // Sent back, it would be stored as manual and stop following the link.
    for (const geo_source of ["link", "geocoded"] as const) {
      const fd = toEventFormData(parse({ ...pinned, geo_source, location_link: "https://maps.app.goo.gl/abc123" }));
      expect(fd.get("lat")).toBeNull();
      expect(fd.get("lng")).toBeNull();
      expect(fd.get("clear_point")).toBeNull();
      expect(fd.get("location_link")).toBe("https://maps.app.goo.gl/abc123");
    }
  });

  it("sends nothing about a pin when there is none", () => {
    const fd = toEventFormData(parse());
    expect(fd.get("lat")).toBeNull();
    expect(fd.get("clear_point")).toBeNull();
  });

  it("sends clear_point once the pin is removed, and never with lat/lng", () => {
    const fd = toEventFormData(parse({ lat: null, lng: null, geo_source: null, clear_point: true }));
    expect(fd.get("clear_point")).toBe("true");
    expect(fd.get("lat")).toBeNull();
    expect(fd.get("lng")).toBeNull();
  });

  it("keeps the pasted map link while clearing the club's own pin so the link can place it", () => {
    const fd = toEventFormData(parse({ lat: 8.5241, lng: 76.9366, geo_source: "link", clear_point: true, location_link: "https://www.google.com/maps?q=8.5241,76.9366" }));
    expect(fd.get("location_link")).toBe("https://www.google.com/maps?q=8.5241,76.9366");
    expect(fd.get("clear_point")).toBe("true");
    expect(fd.get("lat")).toBeNull();
  });

  it("drops the pin for an online event", () => {
    const fd = toEventFormData(parse({ ...pinned, geo_source: "manual", is_online: true, url: "https://meet.example.com/x" }));
    expect(fd.get("lat")).toBeNull();
    expect(fd.get("lng")).toBeNull();
    expect(fd.get("clear_point")).toBe("true");
  });
});

describe("eventFormSchema — the pin", () => {
  it("takes both latitude and longitude, or neither", () => {
    expect(eventFormSchema.safeParse({ ...base, lat: 12.97, lng: 77.59 }).success).toBe(true);
    expect(eventFormSchema.safeParse({ ...base, lat: null, lng: null }).success).toBe(true);
    expect(eventFormSchema.safeParse(base).success).toBe(true);
    const half = eventFormSchema.safeParse({ ...base, lat: 12.97 });
    expect(half.success).toBe(false);
    expect(half.error?.issues[0]?.path).toEqual(["lng"]);
    expect(eventFormSchema.safeParse({ ...base, lng: 77.59, lat: null }).success).toBe(false);
  });

  it("refuses a point off the globe, or a source it does not know", () => {
    expect(eventFormSchema.safeParse({ ...base, lat: 91, lng: 77.59 }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...base, lat: 12.97, lng: -181 }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...base, lat: 12.97, lng: 77.59, geo_source: "satellite" }).success).toBe(false);
  });
});

describe("speakerSchema — bio and link", () => {
  const speaker = (extra: Record<string, unknown>) => eventFormSchema.safeParse({ ...base, speakers: [{ name: "A", ...extra }] });

  it("takes a bio of up to 600 characters, and no more", () => {
    expect(speaker({ bio: "x".repeat(600) }).success).toBe(true);
    expect(speaker({ bio: "x".repeat(601) }).success).toBe(false);
  });

  it("takes an http(s) link or nothing, and refuses anything else", () => {
    expect(speaker({ link: "https://example.com" }).success).toBe(true);
    expect(speaker({ link: "http://example.com/x" }).success).toBe(true);
    expect(speaker({ link: "" }).success).toBe(true);
    expect(speaker({}).success).toBe(true);
    expect(speaker({ link: "example.com" }).success).toBe(false);
    expect(speaker({ link: "javascript:alert(1)" }).success).toBe(false);
    expect(speaker({ link: "mailto:a@example.com" }).success).toBe(false);
  });
});

describe("eventFormSchema — cross-field rules", () => {
  it("requires a joining link for an online event", () => {
    const r = eventFormSchema.safeParse({ ...base, is_online: true, location_name: "" });
    expect(r.success).toBe(false);
  });

  it("requires a venue for a physical event", () => {
    const r = eventFormSchema.safeParse({ ...base, location_name: "" });
    expect(r.success).toBe(false);
  });

  it("requires an amount when a fee is switched on", () => {
    expect(eventFormSchema.safeParse({ ...base, has_fee: true }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...base, has_fee: true, reg_fee: 100 }).success).toBe(true);
  });

  it("rejects registration closing after the event starts", () => {
    const r = eventFormSchema.safeParse({ ...base, reg_enddate: "2026-11-02T10:00" });
    expect(r.success).toBe(false);
  });

  it("rejects duplicate question keys", () => {
    const q = (key: string) => ({ key, label: key, field_type: "text" as const, required: true });
    const r = eventFormSchema.safeParse({ ...base, additional_details: [q("a"), q("a")] });
    expect(r.success).toBe(false);
  });

  it("requires options for radio and checkbox questions", () => {
    const r = eventFormSchema.safeParse({
      ...base,
      additional_details: [{ key: "k", label: "K", field_type: "radio", required: true }],
    });
    expect(r.success).toBe(false);
  });

  it("requires options for a dropdown question too", () => {
    const without = eventFormSchema.safeParse({ ...base, additional_details: [{ key: "k", label: "K", field_type: "select", required: true }] });
    expect(without.success).toBe(false);
    const withThem = eventFormSchema.safeParse({ ...base, additional_details: [{ key: "k", label: "K", field_type: "select", required: true, options: ["A", "B"] }] });
    expect(withThem.success).toBe(true);
  });
});

describe("dropdown and long-text questions", () => {
  // An AI assistant writes these through MCP (QUESTION_TYPES on the server);
  // the form read them as text, and the next save turned them into text.
  const detail = {
    id: 9, name: "Assistant Event", event_datetime: "2026-03-07T10:00:00+05:30", duration: 2,
    is_online: false, has_fee: false, has_prize: false, category: { id: 4, name: "Workshop" },
    additional_details: [
      { key: "track", label: "Track", field_type: "select", required: true, options: ["Web", "AI"] },
      { key: "why", label: "Why do you want to come?", field_type: "textarea", required: false },
    ],
  };

  it("keeps them as they are through an edit and a save", () => {
    const values = eventDetailToFormValues(detail);
    expect(values.additional_details?.map((q) => q.field_type)).toEqual(["select", "textarea"]);
    const sent = toEventFormData(eventFormSchema.parse({ ...base, additional_details: values.additional_details }));
    expect(JSON.parse(String(sent.get("additional_details")))).toEqual([
      { key: "track", label: "Track", field_type: "select", required: true, options: ["Web", "AI"] },
      { key: "why", label: "Why do you want to come?", field_type: "textarea", required: false },
    ]);
  });
});

describe("eventDetailToFormValues", () => {
  const detail = {
    id: 9,
    name: "Existing Event",
    about: "Something",
    event_datetime: "2026-03-07T10:00:00+05:30",
    duration: 24,
    reg_enddate: null,
    location_name: "faya",
    is_online: false,
    has_fee: true,
    reg_fee: 99.5,
    has_prize: false,
    category: { id: 4, name: "Workshop" },
    interests: [{ id: 2 }, { id: 5 }],
    additional_details: [
      { key: "college", label: "College", field_type: "text", required: true },
      { key: "weird", label: "Weird", field_type: "not_a_real_type", required: false },
    ],
    speakers: [
      { id: 3, name: "A Speaker", designation: "Prof", bio: "Teaches control systems.", link: "https://example.com/a", photo: { medium: "https://cdn/p.png" } },
      { id: 4, name: "Older Speaker", designation: null, photo: null },
    ],
  };

  it("maps the API shape onto the form", () => {
    const v = eventDetailToFormValues(detail);
    expect(v.name).toBe("Existing Event");
    expect(v.category_id).toBe(4);
    expect(v.interest_ids).toEqual([2, 5]);
    expect(v.has_fee).toBe(true);
    expect(v.reg_fee).toBe(99.5);
  });

  it("shows the event's label and sends it back on save", () => {
    // The server's event info now carries event_tag, and its update writes it:
    // the label was lost on every edit and the form always showed it empty.
    const v = eventDetailToFormValues({ ...detail, event_tag: "Members only" });
    expect(v.event_tag).toBe("Members only");
    const sent = toEventFormData(eventFormSchema.parse({ ...base, event_tag: v.event_tag }));
    expect(sent.get("event_tag")).toBe("Members only");
    // Emptied, it is left out, which clears it on the server.
    expect(toEventFormData(eventFormSchema.parse({ ...base, event_tag: "" })).get("event_tag")).toBeNull();
  });

  it("formats datetimes for datetime-local inputs", () => {
    const v = eventDetailToFormValues(detail);
    expect(v.event_datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // Null dates become "" rather than "Invalid Date".
    expect(v.reg_enddate).toBe("");
  });

  it("falls back to text for a field_type the UI does not know", () => {
    const v = eventDetailToFormValues(detail);
    expect(v.additional_details?.[1]?.field_type).toBe("text");
  });

  it("preserves speaker ids and existing photos", () => {
    const v = eventDetailToFormValues(detail);
    expect(v.speakers?.[0]?.id).toBe(3);
    expect(v.speakers?.[0]?.photo_url).toBe("https://cdn/p.png");
  });

  it("reads a speaker's bio and link, and blanks for a speaker saved before they existed", () => {
    const v = eventDetailToFormValues(detail);
    expect(v.speakers?.[0]).toMatchObject({ bio: "Teaches control systems.", link: "https://example.com/a" });
    expect(v.speakers?.[1]).toMatchObject({ bio: "", link: "" });
  });

  it("reads the pin and where it came from", () => {
    const v = eventDetailToFormValues({ ...detail, lat: 8.5581, lng: 76.8816, geo_source: "geocoded" });
    expect(v).toMatchObject({ lat: 8.5581, lng: 76.8816, geo_source: "geocoded", clear_point: false });
  });

  it("defaults to no pin for a payload without one, or from before pins existed", () => {
    expect(eventDetailToFormValues(detail)).toMatchObject({ lat: null, lng: null, geo_source: null, clear_point: false });
    expect(eventDetailToFormValues({ ...detail, lat: null, lng: null, geo_source: null })).toMatchObject({ lat: null, lng: null, geo_source: null });
  });

  it("reads half a pin as none, and an unknown source as unknown, rather than refusing to open", () => {
    expect(eventDetailToFormValues({ ...detail, lat: 8.5581, lng: null, geo_source: "manual" })).toMatchObject({ lat: null, lng: null, geo_source: null });
    expect(eventDetailToFormValues({ ...detail, lat: 8.5581, lng: 76.8816, geo_source: "satellite" })).toMatchObject({ lat: 8.5581, lng: 76.8816, geo_source: null });
    expect(eventDetailToFormValues({ ...detail, lat: "north", lng: 76.8816 })).toMatchObject({ lat: null, lng: null });
  });

  it("re-sends a pin the club set on save, and leaves a found one alone", () => {
    const manual = toEventFormData(eventFormSchema.parse(eventDetailToFormValues({ ...detail, lat: 8.5581, lng: 76.8816, geo_source: "manual" })));
    expect(manual.get("lat")).toBe("8.5581");
    expect(manual.get("lng")).toBe("76.8816");
    const found = toEventFormData(eventFormSchema.parse(eventDetailToFormValues({ ...detail, lat: 8.5581, lng: 76.8816, geo_source: "geocoded" })));
    expect(found.get("lat")).toBeNull();
    expect(found.get("clear_point")).toBeNull();
  });

  it("round-trips back through the encoder without loss", () => {
    const fd = toEventFormData(eventFormSchema.parse(eventDetailToFormValues(detail)));
    expect(fd.get("name")).toBe("Existing Event");
    expect(fd.get("interest_ids")).toBe("2,5");
    expect(fd.get("reg_fee")).toBe("99.5");
    expect(JSON.parse(String(fd.get("speakers")))[0]).toMatchObject({ id: 3, bio: "Teaches control systems.", link: "https://example.com/a", photo_url: "https://cdn/p.png" });
  });
});
