import { describe, expect, it } from "vitest";

import { toEventFormData } from "./api";
import { emptyEventForm } from "./components/event-form";
import { hoursBetween, joinLocal, readiness, spanLabel, splitLocal } from "./readiness";
import { eventFormSchema } from "./schemas";

const filled = { ...emptyEventForm, name: "Hack Night 05", category_id: 1, event_datetime: "2026-11-01T18:00", duration: 3, location_name: "Lab 3" };

describe("readiness", () => {
  it("knows the four things publishing needs, and the rest", () => {
    const empty = readiness(emptyEventForm);
    expect(empty.publishable).toBe(false);
    expect(empty.required.filter((i) => i.done)).toEqual([]);
    const r = readiness(filled);
    expect(r.publishable).toBe(true);
    expect(r.recommended.find((i) => i.key === "capacity")?.done).toBe(false);
    expect(r.score).toBe(Math.round((100 * 8) / 14));
    const online = readiness({ ...filled, is_online: true, location_name: "" });
    expect(online.publishable).toBe(false);
    expect(online.required.find((i) => i.key === "where")?.label).toBe("A joining link");
    expect(readiness({ ...filled, is_online: true, url: "https://meet.google.com/x" }).publishable).toBe(true);
  });

  it("counts the better-page items", () => {
    const r = readiness({ ...filled, about: "A".repeat(60), reg_enddate: "2026-10-31T18:00", max_participants: 80, contact_phone: "9", interest_ids: [1] });
    expect(r.recommended.filter((i) => !i.done).map((i) => i.key)).toEqual(["poster"]);
  });
});

describe("the day and the hours", () => {
  it("splits and joins a local datetime", () => {
    expect(splitLocal("2026-11-01T18:30")).toEqual({ date: "2026-11-01", time: "18:30" });
    expect(joinLocal("2026-11-01", "18:30")).toBe("2026-11-01T18:30");
    expect(joinLocal("", "18:30")).toBe("");
  });
  it("derives hours from an end time, into the next day when the end reads earlier", () => {
    expect(hoursBetween("2026-11-01T18:00", "21:00")).toBe(3);
    expect(hoursBetween("2026-11-01T18:00", "19:45")).toBe(2);
    expect(hoursBetween("2026-11-01T22:00", "01:00")).toBe(3);
    expect(hoursBetween("", "01:00")).toBeNull();
  });
  it("reads a span back as a sentence", () => {
    expect(spanLabel("2026-11-01T18:00", 3)).toMatch(/Sun,? 1 Nov, 6:00 pm – 9:00 pm/i);
    expect(spanLabel("2026-11-01T22:00", 4)).toMatch(/Mon,? 2 Nov/);
    expect(spanLabel("", 3)).toBe("");
  });
});

describe("a draft on the wire", () => {
  it("sends the status only when asked", () => {
    const parsed = eventFormSchema.parse(filled);
    expect(toEventFormData(parsed).get("status")).toBeNull();
    expect(toEventFormData(parsed, "draft").get("status")).toBe("draft");
  });
});
