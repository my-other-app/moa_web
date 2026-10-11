import { describe, expect, it } from "vitest";

import { type AgendaEntry, type AgendaPiece, layoutAgenda, layoutProblems, layoutText, lineX, sampleAgenda } from "./engine";
import { AGENDA_STARTERS, agendaStarter, BADGE_STARTERS, badgeStarter, badgeStarterPage, CERTIFICATE_STARTERS, certificateStarter, TICKET_STARTERS, ticketStarter } from "./starters";
import { AgendaLayer, minQrSize, PAGE_PRESETS, TicketLayoutFields } from "./ticket-layout";
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

describe("the badge starters", () => {
  it.each(Object.keys(BADGE_STARTERS) as (keyof typeof BADGE_STARTERS)[])("the %s badge starter is valid as it comes", (kind) => {
    for (const page of [null, PAGE_PRESETS.cr80_landscape.page, PAGE_PRESETS.label_38x90.page]) {
      const s = badgeStarter(kind, { seats: false, page });
      const parsed = TicketLayoutFields.parse({ canvas: s.canvas, layers: s.layers, page: s.page });
      expect(layoutProblems(parsed.canvas, parsed.layers, parsed.page, { qrRequired: true })).toEqual([]);
      expect(parsed.layers.some((l) => l.kind === "qr")).toBe(true);
    }
  });

  it("draws the insert and label starters for the page the designer is on", () => {
    expect(badgeStarterPage("classic")).toEqual(PAGE_PRESETS.cr80_portrait.page);
    expect(badgeStarterPage("insert", PAGE_PRESETS.cr80_landscape.page)).toEqual(PAGE_PRESETS.cr80_landscape.page);
    expect(badgeStarterPage("insert", PAGE_PRESETS.ticket.page)).toEqual(PAGE_PRESETS.badge_87x130.page);
    expect(badgeStarterPage("label_brother", PAGE_PRESETS.label_29x90.page)).toEqual(PAGE_PRESETS.label_29x90.page);
    expect(badgeStarterPage("label_4x6")).toEqual(PAGE_PRESETS.lanyard_4x6.page);
  });
});

describe("the agenda layer", () => {
  const measure = (s: string, size: number) => [...s].length * size * 0.5;
  const M = { title: measure, detail: measure, time: measure };
  const TZ = "Asia/Kolkata";
  const at = (h: number, m = 0, day = 20) => new Date(Date.UTC(2026, 10, day, h, m));
  const layer = (more: Partial<AgendaLayer> = {}): AgendaLayer => AgendaLayer.parse({ id: "agenda", name: "Run of show", kind: "agenda", x: 0, y: 0, width: 600, height: 400, size: 20, rowGap: 10, ...more });
  const entries: AgendaEntry[] = [
    { startsAt: at(3, 30), endsAt: at(4, 0), title: "Registration", speaker: null, location: "Foyer" },
    { startsAt: at(4, 0), endsAt: at(5, 0), title: "Opening keynote", speaker: "Ananya Iyer", location: "Main hall" },
    { startsAt: at(5, 0), endsAt: null, title: "Group photo", speaker: null, location: null },
  ];

  it("puts the time in its own column and the detail under the title", () => {
    const r = layoutAgenda(layer(), entries, TZ, M);
    expect(r.dropped).toBe(0);
    expect(r.size).toBe(20);
    expect(r.pieces.map((p) => p.role)).toEqual(["time", "title", "detail", "time", "title", "detail", "time", "title"]);
    const [time, title, detail] = r.pieces as [AgendaPiece, AgendaPiece, AgendaPiece];
    expect(time.text).toBe("09:00 – 09:30");
    expect(time.x).toBe(0);
    expect(title.x).toBeGreaterThan(time.width);
    expect(detail.x).toBe(title.x);
    expect(detail.y).toBeGreaterThan(title.y);
    expect(time.y).toBe(title.y);
    expect(r.pieces.at(-2)!.text).toBe("10:30");
  });

  it("centres stack the time above the title; right mirrors the column", () => {
    const c = layoutAgenda(layer({ align: "center" }), entries.slice(0, 1), TZ, M);
    const [time, title, detail] = c.pieces as [AgendaPiece, AgendaPiece, AgendaPiece];
    expect(time.y).toBeLessThan(title.y);
    expect(title.y).toBeLessThan(detail.y);
    expect(time.x + time.width / 2).toBeCloseTo(300, 6);
    const r = layoutAgenda(layer({ align: "right" }), entries.slice(0, 1), TZ, M);
    expect(r.pieces[0]!.x + r.pieces[0]!.width).toBeCloseTo(600, 6);
  });

  it("shrinks before it drops, and says how many did not fit", () => {
    const many: AgendaEntry[] = Array.from({ length: 30 }, (_, i) => ({ startsAt: at(3, i), endsAt: null, title: `Session ${i}`, speaker: "Someone", location: "Room" }));
    const r = layoutAgenda(layer({ height: 300 }), many, TZ, M);
    expect(r.size).toBe(10);
    expect(r.dropped).toBeGreaterThan(0);
    expect(r.pieces.at(-1)).toMatchObject({ role: "more", text: `+ ${r.dropped} more sessions` });
    expect(r.pieces.every((p) => p.y <= 300.5)).toBe(true);
  });

  it("balances two columns and heads each day", () => {
    const eight: AgendaEntry[] = Array.from({ length: 8 }, (_, i) => ({ startsAt: at(3, i), endsAt: null, title: `Session ${i}`, speaker: null, location: null }));
    const r = layoutAgenda(layer({ width: 800, columns: 2, height: 400 }), eight, TZ, M);
    expect(r.dropped).toBe(0);
    expect(r.pieces.filter((p) => p.role === "title" && p.x < 400)).toHaveLength(4);
    const days = layoutAgenda(layer(), [{ startsAt: at(4), endsAt: null, title: "One", speaker: null, location: null }, { startsAt: at(4, 0, 21), endsAt: null, title: "Two", speaker: null, location: null }], TZ, M);
    expect(days.pieces.filter((p) => p.role === "day").map((p) => p.text)).toEqual(["FRIDAY 20 NOVEMBER", "SATURDAY 21 NOVEMBER"]);
  });

  it("reads a twelve-hour clock, and the sample day falls in the event's zone", () => {
    expect(layoutAgenda(layer(), entries.slice(0, 1), TZ, M, true).pieces[0]!.text).toBe("9:00 AM – 9:30 AM");
    const sample = sampleAgenda("2026-11-20T03:30:00Z", TZ);
    expect(sample).toHaveLength(6);
    expect(new Date(sample[0]!.startsAt).toISOString()).toBe("2026-11-20T03:30:00.000Z");
  });

  it("lists the run of show once per design, and every starter is valid", () => {
    for (const kind of Object.keys(AGENDA_STARTERS) as (keyof typeof AGENDA_STARTERS)[]) {
      const s = agendaStarter(kind);
      expect(layoutProblems(s.canvas, s.layers, s.page, { qrRequired: false })).toEqual([]);
      expect(s.layers.filter((l) => l.kind === "agenda")).toHaveLength(1);
    }
    const s = agendaStarter("programme");
    const twice = [...s.layers, { ...s.layers.find((l) => l.kind === "agenda")!, id: "agenda2" }];
    expect(layoutProblems(s.canvas, twice, s.page, { qrRequired: false }).map((p) => p.message)).toContain("A design lists the run of show once.");
  });
});
