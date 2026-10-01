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
    speakers: [{ id: 3, name: "A Speaker", designation: "Prof", photo: { medium: "https://cdn/p.png" } }],
  };

  it("maps the API shape onto the form", () => {
    const v = eventDetailToFormValues(detail);
    expect(v.name).toBe("Existing Event");
    expect(v.category_id).toBe(4);
    expect(v.interest_ids).toEqual([2, 5]);
    expect(v.has_fee).toBe(true);
    expect(v.reg_fee).toBe(99.5);
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

  it("round-trips back through the encoder without loss", () => {
    const fd = toEventFormData(eventFormSchema.parse(eventDetailToFormValues(detail)));
    expect(fd.get("name")).toBe("Existing Event");
    expect(fd.get("interest_ids")).toBe("2,5");
    expect(fd.get("reg_fee")).toBe("99.5");
  });
});
