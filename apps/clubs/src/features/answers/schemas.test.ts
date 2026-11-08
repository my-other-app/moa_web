import { describe, expect, it } from "vitest";
import { ApiError } from "@moa/api";

import {
  answerAskSchema,
  answersAttention,
  answersSummarySchema,
  askPreviewSchema,
  askPreviewTexts,
  askProblem,
  askProgress,
  deadlineProblem,
  deadlineToIso,
  defaultAskMessage,
  formImpactSchema,
  impactHasNews,
  impactToAsk,
  missingKeysSchema,
  registrationRef,
  remindProblem,
  requestRef,
  whatsappReason,
} from "./schemas";

/**
 * The missing-answers wire shapes (feature-register/missing-answers-contract.md
 * §1.3–§2.1), read exactly as the contract writes them, and the words the
 * dashboard says them in.
 */
const IMPACT = {
  people: { registrations: 1, requests: 437 },
  added: [{ key: "why", label: "Why…", required: true, askable: 438 }],
  removed: [{ key: "old", label: "Old", answered: 120 }],
  now_required: [{ key: "college", label: "College", missing: 60 }],
  options_removed: [{ key: "year", label: "Year", option: "5th year", chosen_by: 3 }],
  relabelled: [{ key: "college", from: "Collage", to: "College" }],
  type_changed: [{ key: "age", label: "Age", from: "text", to: "number", invalid_after: 4 }],
};

const SUMMARY = {
  people: { registrations: 1, requests: 437 },
  people_missing: 62,
  questions: [
    { key: "t_shirt_size", label: "T-shirt size", required: true, answered: 400, blank: 30, invalid: 2, hidden: 6, missing: 32 },
    { key: "why", label: "Why", required: true, answered: 408, blank: 30, invalid: 0, hidden: 0, missing: 30 },
    { key: "diet", label: "Diet", required: false, answered: 10, blank: 428, invalid: 0, hidden: 0, missing: 0 },
  ],
  stray: [{ key: "collage", count: 180 }],
  open_asks: 0,
};

const ASK = {
  id: "a1",
  created_at: "2026-11-08T10:00:00+05:30",
  created_by: "Haritha",
  questions: [{ key: "t_shirt_size", label: "T-shirt size" }],
  channels: ["push", "email"],
  message: "We need 1 more detail.",
  deadline: null,
  remind_after_hours: 48,
  status: "open",
  counts: { people: 62, sent: 62, failed: 0, opened: 40, answered: 31, still_askable: 31 },
  reminders_sent: 0,
  next_reminder_at: "2026-11-10T10:00:00+05:30",
};

describe("the impact of a changed form (§1.3)", () => {
  it("reads the contract's example", () => {
    const i = formImpactSchema.parse(IMPACT);
    expect(i.people).toEqual({ registrations: 1, requests: 437 });
    expect(i.type_changed[0]).toEqual({ key: "age", label: "Age", from: "text", to: "number", invalid_after: 4 });
    expect(impactHasNews(i)).toBe(true);
  });

  it("reads empty lists as nothing to say", () => {
    const i = formImpactSchema.parse({ people: { registrations: 3, requests: 0 } });
    expect(i.added).toEqual([]);
    expect(impactHasNews(i)).toBe(false);
  });

  it("preselects the added and now-required questions, and says how many may be asked at most", () => {
    expect(impactToAsk(formImpactSchema.parse(IMPACT))).toEqual({ keys: ["why", "college"], people: 438 });
    expect(impactToAsk(formImpactSchema.parse({ people: {}, relabelled: IMPACT.relabelled }))).toEqual({ keys: [], people: 0 });
  });
});

describe("who is missing what (§1.4)", () => {
  it("reads the summary, and a row's missing keys ([] when the server says nothing)", () => {
    const s = answersSummarySchema.parse(SUMMARY);
    expect(s.people_missing).toBe(62);
    expect(s.stray).toEqual([{ key: "collage", count: 180 }]);
    expect(missingKeysSchema.parse(["t_shirt_size"])).toEqual(["t_shirt_size"]);
    expect(missingKeysSchema.parse(undefined)).toEqual([]);
    expect(missingKeysSchema.parse("nonsense")).toEqual([]);
  });

  it("names a person by ref: a registration's uuid, or q and a request's uuid", () => {
    expect(registrationRef("6f1b2c70-0000-4000-8000-000000000001")).toBe("6f1b2c70-0000-4000-8000-000000000001");
    expect(requestRef("9a2e")).toBe("q9a2e");
  });
});

describe("on the overview (§3 item 3)", () => {
  const s = answersSummarySchema.parse(SUMMARY);

  it("says who hasn't answered, the questions missing most, and opens the Ask panel", () => {
    const [item] = answersAttention(s, { ask: true, move: false });
    expect(item).toMatchObject({ kind: "ANSWERS_MISSING", title: "62 people haven't answered every question", action: "ask", path: "/attendees?missing=1" });
    expect(item!.body).toBe("Missing: T-shirt size (32) and Why (30). Ask them: one message with a personal link to add just those.");
  });

  it("only links to the list for someone who can't ask, and points at Messages while an ask is open", () => {
    expect(answersAttention(s, { ask: false, move: false })[0]).toMatchObject({ action: null });
    expect(answersAttention({ ...s, open_asks: 1 }, { ask: true, move: false })[0]!.body).toContain("An ask is open; Messages has the progress.");
  });

  it("shows answers under an old question only to owners and admins, to move", () => {
    expect(answersAttention(s, { ask: true, move: false }).some((a) => a.kind.startsWith("ANSWERS_STRAY"))).toBe(false);
    const stray = answersAttention(s, { ask: true, move: true }).find((a) => a.kind.startsWith("ANSWERS_STRAY"));
    expect(stray).toMatchObject({ title: "Answers under an old question: Collage (180)", action: { move: { key: "collage", count: 180 } } });
  });

  it("says nothing when nobody is missing anything", () => {
    expect(answersAttention({ ...s, people_missing: 0, stray: [] }, { ask: true, move: true })).toEqual([]);
    expect(answersAttention(null, { ask: true, move: true })).toEqual([]);
  });
});

describe("asking (§2.1)", () => {
  it("reads an ask and its progress", () => {
    const a = answerAskSchema.parse(ASK);
    expect(a.status).toBe("open");
    expect(askProgress(a)).toEqual({ answeredPct: 50, remindersLeft: 2 });
    expect(answerAskSchema.parse({ ...ASK, status: "closed", channels: ["push", "fax"] })).toMatchObject({ status: "closed", channels: ["push"] });
  });

  it("reads the preview, WhatsApp off with its reason in words", () => {
    const p = askPreviewSchema.parse({ people: 62, reach: { push: 41, email: 62, whatsapp: 0 }, whatsapp: { available: false, reason: "TEMPLATE_NOT_APPROVED" } });
    expect(p.reach.push).toBe(41);
    expect(whatsappReason(p.whatsapp.reason)).toMatch(/“details_needed” WhatsApp template isn't approved/);
    expect(whatsappReason("SOMETHING_NEW")).toBe("Your club's WhatsApp can't send this yet.");
  });

  it("starts with a message under the limit, counting the questions", () => {
    expect(defaultAskMessage("DevFest", 2)).toBe("We need 2 more details for your DevFest registration. It takes a minute, and your ticket stays as it is.");
    expect(defaultAskMessage("DevFest", 1)).toMatch(/^We need 1 more detail for/);
    expect(defaultAskMessage("x".repeat(400), 1).length).toBeLessThanOrEqual(300);
  });

  it("sends a deadline with its offset, and refuses one in the past or after the event", () => {
    expect(deadlineToIso("")).toBeNull();
    expect(deadlineToIso("2026-11-14T18:00")).toMatch(/^2026-11-14T18:00:00[+-]\d{2}:\d{2}$/);
    const now = new Date("2026-11-08T12:00:00");
    expect(deadlineProblem("2026-11-01T10:00", now)).toBe("Pick a time that's still ahead.");
    expect(deadlineProblem("2026-11-20T10:00", now, "2026-11-15T18:00:00")).toBe("The deadline can't be after the event ends.");
    expect(deadlineProblem("2026-11-14T10:00", now, "2026-11-15T18:00:00")).toBeNull();
  });

  it("previews each channel as the contract writes it", () => {
    const t = askPreviewTexts({ eventName: "DevFest", questions: ["T-shirt size", "Why"], message: "Hi!", deadline: null });
    expect(t.push).toEqual({ title: "DevFest needs 2 more details", body: "Hi!" });
    expect(t.email).toMatchObject({ subject: "DevFest needs 2 more details from you", items: ["T-shirt size", "Why"], deadline: null, button: "Add my details" });
    expect(t.whatsapp.body).toBe("Hi Haritha, DevFest needs 2 more details for your registration. Please add them by the event.");
  });

  it("says a refused ask or reminder in words", () => {
    expect(askProblem(new ApiError({ status: 409, message: "x", errorCode: "NOTHING_TO_ASK" }))).toMatch(/Nobody is missing these answers/);
    expect(askProblem(new ApiError({ status: 409, message: "x", errorCode: "EVENT_ENDED" }))).toMatch(/has ended/);
    expect(remindProblem(new ApiError({ status: 409, message: "x", errorCode: "REMIND_LIMIT" }))).toMatch(/Both reminders/);
    expect(remindProblem(new ApiError({ status: 409, message: "x", errorCode: "REMIND_TOO_SOON", fieldErrors: { retry_after: 7200 as unknown as string[] } }))).toBe(
      "The last reminder went less than 12 hours ago. You can remind them again in 2 h.",
    );
    expect(remindProblem(new ApiError({ status: 409, message: "x", errorCode: "REMIND_TOO_SOON" }))).toMatch(/Try again later/);
  });
});
