import { describe, expect, it } from "vitest";

import { layoutProblems, layoutText, lineX } from "./engine";
import { CERTIFICATE_STARTERS, certificateStarter, TICKET_STARTERS, ticketStarter } from "./starters";
import { minQrSize, PAGE_PRESETS, TicketLayoutFields } from "./ticket-layout";
import { canonicalToken, carriesPerGuestToken, fieldToken, parseTicketTemplate, renderTicketTemplate } from "./ticket-tokens";

/**
 * The same cases the backend pins in tests/test_layout_tokens.py and
 * tests/test_layout_text.py, so the two halves of the contract agree.
 */
const values: Record<string, string> = {
  attendee_name: "Amara Okonjo", organization: "", email: "amara@x.co", seat: "", admission_no: "ADM-0041-KF26",
  ticket_type: "VIP", event_name: "Annual Summit", event_date: "16 Sept 2026", event_day: "Wednesday",
  event_time: "09:00", event_end_time: "18:00", venue: "Ravensbourne Hall", "field.t_shirt_size": "L",
};

describe("the ticket template language", () => {
  it("fills tokens, and accepts the names other ticketing tools use", () => {
    expect(renderTicketTemplate("{{name}} · {{ticket_code}} · {{event_title}}", values)).toBe("Amara Okonjo · ADM-0041-KF26 · Annual Summit");
    expect(renderTicketTemplate("{{ attendee_name | upper }}", values)).toBe("AMARA OKONJO");
    expect(renderTicketTemplate("{{event_day}} {{event_date}} {{event_time}}–{{event_end_time}}", values)).toBe("Wednesday 16 Sept 2026 09:00–18:00");
    expect(renderTicketTemplate("Size {{field.t_shirt_size}}", values)).toBe("Size L");
    expect(fieldToken("T-Shirt Size")).toBe("field.t_shirt_size");
    expect(canonicalToken("Company")).toBe("organization");
  });

  it("shows or hides a block on whether a token has a value — both spellings of the condition", () => {
    const t = "{{event_start_time}}{% if {{event_end_time}} %} – {{event_end_time}}{% endif %}";
    expect(renderTicketTemplate(t, values)).toBe("09:00 – 18:00");
    expect(renderTicketTemplate(t, { ...values, event_end_time: "" })).toBe("09:00");
    expect(renderTicketTemplate("{% if organization %}{{organization}}{% else %}Independent{% endif %}", values)).toBe("Independent");
    expect(renderTicketTemplate("{% if not seat %}No seat{% endif %}", values)).toBe("No seat");
  });

  it("names every mistake, with a suggestion, rather than printing blanks", () => {
    expect(parseTicketTemplate("{{nmae}}").errors[0]).toMatch(/not a token\. Did you mean \{\{name\}\}\?/);
    expect(parseTicketTemplate("{{name | shout}}").errors[0]).toMatch(/not a filter/);
    expect(parseTicketTemplate("{% if name %}x").errors[0]).toMatch(/never closed/);
    expect(parseTicketTemplate("{% endif %}").errors[0]).toMatch(/no \{% if %\}/);
    expect(parseTicketTemplate("{% for x in y %}").errors[0]).toMatch(/not understood/);
    expect(parseTicketTemplate("{{}}").errors[0]).toMatch(/empty/);
    expect(parseTicketTemplate("Plain words and {{venue}}").errors).toEqual([]);
    expect(parseTicketTemplate("{{name}} {{company}}").tokens).toEqual(["attendee_name", "organization"]);
  });

  it("recognises our own aliases", () => {
    expect(canonicalToken("participant_name")).toBe("attendee_name");
    expect(canonicalToken("club_name")).toBe("org_name");
    expect(canonicalToken("certificate_id")).toBe("certificate_no");
    expect(carriesPerGuestToken("Seat {{ seat_label }}")).toBe(true);
    expect(carriesPerGuestToken("{{event_name}}")).toBe(false);
  });
});

// A fake font: every character is 0.5 em wide.
const measure = (s: string, size: number) => [...s].length * size * 0.5;
const base = { width: 200, size: 20, maxLines: 1, lineSpacing: 0, letterSpacing: 0, fit: "shrink" as const, fontFile: "inter-400" };

describe("text layout", () => {
  it("keeps a short line as it is", () => {
    const r = layoutText("Amara", base, measure);
    expect(r.size).toBe(20);
    expect(r.lines).toEqual([{ text: "Amara", width: 50 }]);
    expect(r.truncated).toBe(false);
  });

  it("shrinks a long name onto its lines before cutting anything", () => {
    const r = layoutText("Amara Okonjo-Lindqvist", base, measure);
    expect(r.lines).toHaveLength(1);
    expect(r.size).toBeLessThan(20);
    expect(r.lines[0]!.width).toBeLessThanOrEqual(200);
    expect(r.truncated).toBe(false);
  });

  it("wraps onto more lines when allowed, and cuts with an ellipsis only past half size", () => {
    const two = layoutText("one two three four five six", { ...base, maxLines: 2, fit: "truncate" }, measure);
    expect(two.lines.map((l) => l.text)).toEqual(["one two three four", "five six"]);
    expect(two.baselines[1]! - two.baselines[0]!).toBeCloseTo(24);
    const cut = layoutText("x".repeat(100), { ...base, fit: "truncate" }, measure);
    expect(cut.truncated).toBe(true);
    expect(cut.lines[0]!.text.endsWith("…")).toBe(true);
    const shrunk = layoutText("x".repeat(100), base, measure);
    expect(shrunk.size).toBe(10);
    expect(shrunk.truncated).toBe(true);
  });

  it("breaks a single word too long for the box, honours line breaks, and spaces lines as asked", () => {
    const r = layoutText("abcdefghijklmnopqrstuvwxy\nz", { ...base, maxLines: 4, fit: "truncate", lineSpacing: 6 }, measure);
    expect(r.lines.map((l) => l.text)).toEqual(["abcdefghijklmnopqrst", "uvwxy", "z"]);
    expect(r.baselines[1]! - r.baselines[0]!).toBeCloseTo(30);
  });

  it("places lines by alignment", () => {
    expect(lineX({ x: 10, width: 200, align: "left" }, 50)).toBe(10);
    expect(lineX({ x: 10, width: 200, align: "center" }, 50)).toBe(85);
    expect(lineX({ x: 10, width: 200, align: "right" }, 50)).toBe(160);
  });
});

describe("what a design may not be", () => {
  it.each(Object.keys(TICKET_STARTERS) as (keyof typeof TICKET_STARTERS)[])("the %s ticket starter is valid as it comes", (kind) => {
    const s = ticketStarter(kind);
    expect(TicketLayoutFields.safeParse(s).success).toBe(true);
    expect(layoutProblems(s.canvas, s.layers, s.page)).toEqual([]);
  });

  it.each(Object.keys(CERTIFICATE_STARTERS) as (keyof typeof CERTIFICATE_STARTERS)[])("the %s certificate starter is valid as it comes", (kind) => {
    const s = certificateStarter(kind);
    expect(TicketLayoutFields.safeParse(s).success).toBe(true);
    expect(layoutProblems(s.canvas, s.layers, s.page, { qrRequired: false })).toEqual([]);
  });

  it("needs exactly one readable QR on a ticket, and names an unknown token", () => {
    const s = ticketStarter("classic");
    const noQr = s.layers.filter((l) => l.kind !== "qr");
    expect(layoutProblems(s.canvas, noQr, s.page).map((p) => p.message)).toContainEqual(expect.stringContaining("QR"));
    const typo = s.layers.map((l) => (l.kind === "text" && l.id === "guest" ? { ...l, text: "{{nmae}}" } : l));
    expect(layoutProblems(s.canvas, typo, s.page).map((p) => p.message)).toContainEqual(expect.stringMatching(/^Guest name: .*Did you mean \{\{name\}\}/));
  });

  it("a fixed page refuses a canvas of another shape, and a QR too small to print at 12 mm", () => {
    const s = ticketStarter("classic");
    expect(layoutProblems(s.canvas, s.layers, PAGE_PRESETS.a4_portrait.page).map((p) => p.message)).toContainEqual(expect.stringContaining("not the shape of a 210 × 297 mm page"));
    const tiny = s.layers.map((l) => (l.kind === "qr" ? { ...l, size: 40 } : l));
    expect(layoutProblems(s.canvas, tiny, s.page).map((p) => p.message)).toContainEqual(expect.stringContaining(`at least ${minQrSize(s.canvas, s.page)} px`));
  });
});
