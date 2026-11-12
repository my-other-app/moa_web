import { describe, expect, it } from "vitest";

import {
  accentContrast,
  bindableSlots,
  choiceFor,
  contrastRatio,
  filterDesigns,
  freshChoice,
  MIN_ACCENT_CONTRAST,
  optionGroup,
  pageLabel,
  presetProblems,
  thumbnailOf,
  tidyChoice,
} from "./presets";
import { designInfoSchema, layerDesignSchema, type DesignInfo } from "./schemas";

/**
 * The ready designs' rules, without a screen: how the catalogue is read
 * (as the backend sends it, snake_case), what a fresh pick starts from,
 * what stops a save, and the accent's contrast.
 */

const parse = (raw: unknown) => designInfoSchema.parse(raw);

const SWISS = parse({
  id: "certificate/07-swiss-minimal",
  name: "Swiss Minimal",
  kind: "certificate",
  page: { width_px: 1123, height_px: 794, width_mm: 297, height_mm: 210 },
  has_photo: false,
  use: "event",
  accent: { default: "#D90429", suggestions: ["#D90429", "#1F3BD8"], contrast_note: "The accent is text on white: keep it dark." },
  tokens: [{ name: "recipient_name", required: true }, { name: "grade", required: false }, { name: "issue_city", required: false }, { name: "logo_src", required: false }, "signatory_name"],
  options: [
    { key: "title", label: "Title", type: "text", default: "Certificate", required: true, max_length: 20 },
    { key: "statement", label: "Statement", type: "textarea", default: "for taking part" },
    { key: "signatory_name", label: "Signatory", type: "text", group: "signatories" },
    { key: "signature", label: "Signature", type: "image" },
    { key: "lanyard", label: "Lanyard slot", type: "bool", default: true },
  ],
  preview: "previews/07-swiss-minimal.png",
});

const MONO = parse({
  id: "badge/06-thermal-mono",
  name: "Thermal Mono",
  kind: "badge",
  page: { width_px: 384, height_px: 576, width_mm: 101.6, height_mm: 152.4 },
  has_photo: false,
  accent: null,
});
const STUB = parse({ id: "badge/01-ticket-stub", name: "Ticket Stub", kind: "badge", page: { width: 384, height: 576 }, has_photo: true, accent_default: "#FF8A3D", accent_suggestions: ["#FF8A3D"] });
const BIG = parse({ id: "badge/04-big-name", name: "Big Name", kind: "badge", page: { width_px: 384, height_px: 576 }, has_photo: false, accent: { default: "#FFD83A", suggestions: [] } });

const FIELDS = [{ key: "field.designation", label: "Designation" }];

describe("the catalogue, as the backend sends it", () => {
  it("reads snake_case manifests, bare token names and the flat accent", () => {
    expect(SWISS.page).toEqual({ widthPx: 1123, heightPx: 794, widthMm: 297, heightMm: 210 });
    expect(SWISS.accent).toMatchObject({ default: "#D90429", note: "The accent is text on white: keep it dark." });
    expect(SWISS.tokens.map((t) => t.key)).toEqual(["recipient_name", "grade", "issue_city", "logo_src", "signatory_name"]);
    expect(SWISS.options[0]).toMatchObject({ key: "title", maxLength: 20, required: true });
    expect(STUB.page).toMatchObject({ widthPx: 384, heightPx: 576 });
    expect(STUB.accent).toMatchObject({ default: "#FF8A3D", suggestions: ["#FF8A3D"] });
    expect(MONO.accent).toBeNull();
  });

  it("reads a design from a backend from before the designs as the canvas, with an empty gallery", () => {
    const d = layerDesignSchema.parse({
      eventId: 1,
      kind: "ticket",
      audience: "event_default",
      canvas: { width: 1560, height: 690, background: "#FFFFFF", templateKey: null, templatePreprinted: false, area: null },
      layers: [],
      page: { widthMm: 203.2, heightMm: null },
      brand: { orgName: "", primary: "#000000", secondary: "#000000" },
      starters: {},
      tokens: [],
      qrRequired: true,
    });
    expect(d.active).toBe("custom");
    expect(d.catalogue).toEqual([]);
  });

  it("uses the shipped WebP unless the catalogue gives an address the browser can load", () => {
    expect(thumbnailOf(SWISS)).toBe("/designs/certificate/07-swiss-minimal.webp");
    expect(thumbnailOf({ ...SWISS, previewUrl: "https://api.example/static/doc-designs/07.png" })).toBe("https://api.example/static/doc-designs/07.png");
  });

  it("names the printed size the way a club does", () => {
    expect(pageLabel(SWISS)).toBe("A4 landscape");
    expect(pageLabel(MONO)).toBe("4 × 6 in");
  });
});

describe("a fresh pick", () => {
  it("starts from the design's defaults, every field automatic, its own accent", () => {
    expect(freshChoice(SWISS)).toEqual({
      id: "certificate/07-swiss-minimal",
      options: { title: "Certificate", statement: "for taking part", signatory_name: "", signature: "", lanyard: true },
      bindings: {},
      accent: "#D90429",
    });
  });

  it("opens on the saved settings for the design in use, with options the design gained since", () => {
    const saved = { id: SWISS.id, options: { title: "Award" }, bindings: { grade: { source: "hidden" as const } }, accent: "#1f3bd8" };
    expect(choiceFor(SWISS, saved)).toMatchObject({ options: { title: "Award", statement: "for taking part" }, bindings: { grade: { source: "hidden" } }, accent: "#1f3bd8" });
    expect(choiceFor(MONO, saved)).toEqual(freshChoice(MONO));
  });

  it("sorts options into wording, signatories, pictures and printing", () => {
    // A signature is a picture, but it sits with who signs.
    expect(SWISS.options.map(optionGroup)).toEqual(["wording", "wording", "signatories", "signatories", "printing"]);
    expect(optionGroup({ key: "logo", label: "Logo", type: "image", required: false })).toBe("pictures");
  });

  it("lets a club bind only the optional fields no option already sets", () => {
    expect(bindableSlots(SWISS).map((t) => t.key)).toEqual(["grade", "issue_city"]);
  });
});

describe("what stops a save", () => {
  const ok = freshChoice(SWISS);

  it("passes the defaults", () => {
    expect(presetProblems(SWISS, ok, FIELDS)).toEqual([]);
  });

  it("refuses an empty required line and one over its length", () => {
    expect(presetProblems(SWISS, { ...ok, options: { ...ok.options, title: "  " } }, FIELDS)).toEqual([{ path: "options.title", message: "Title can't be empty." }]);
    expect(presetProblems(SWISS, { ...ok, options: { ...ok.options, title: "A very long certificate title" } }, FIELDS)).toEqual([
      { path: "options.title", message: "Title is 29 characters; keep it to 20." },
    ]);
  });

  it("refuses a colour that is not #RRGGBB", () => {
    expect(presetProblems(SWISS, { ...ok, accent: "#12" }, FIELDS).map((p) => p.path)).toEqual(["accent"]);
    // A design without an accent takes none.
    expect(presetProblems(MONO, { ...freshChoice(MONO), accent: null }, FIELDS)).toEqual([]);
  });

  it("refuses a fixed text left empty and a question not picked", () => {
    const bad = { ...ok, bindings: { grade: { source: "text" as const, value: " " }, issue_city: { source: "field" as const, value: "field.gone" } } };
    expect(presetProblems(SWISS, bad, FIELDS)).toEqual([
      { path: "bindings.grade", message: "Type the text for grade, or pick another source." },
      { path: "bindings.issue_city", message: "Pick the question that fills issue city." },
    ]);
    const good = { ...ok, bindings: { grade: { source: "text" as const, value: "Distinction" }, issue_city: { source: "field" as const, value: "field.designation" } } };
    expect(presetProblems(SWISS, good, FIELDS)).toEqual([]);
  });

  it("sends only what differs from automatic, trimmed, the colour in lower case", () => {
    const c = { ...ok, accent: "#1F3BD8", bindings: { grade: { source: "auto" as const }, issue_city: { source: "text" as const, value: " Kochi " }, zone: { source: "hidden" as const, value: "x" } } };
    expect(tidyChoice(c)).toMatchObject({ accent: "#1f3bd8", bindings: { issue_city: { source: "text", value: "Kochi" }, zone: { source: "hidden" } } });
    expect(tidyChoice(c).bindings).not.toHaveProperty("grade");
  });
});

describe("the accent's contrast", () => {
  it("measures WCAG contrast", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("warns on a pale accent for text on white, not on the designer's own", () => {
    expect(accentContrast(SWISS, "#D90429")!).toBeGreaterThan(MIN_ACCENT_CONTRAST);
    expect(accentContrast(SWISS, "#FFE066")!).toBeLessThan(MIN_ACCENT_CONTRAST);
    expect(accentContrast(MONO, "#000000")).toBeNull();
  });
});

describe("the badge filters", () => {
  const all: DesignInfo[] = [MONO, STUB, BIG];
  it("splits by photo and by printer", () => {
    expect(filterDesigns(all, "photo", "all").map((d) => d.name)).toEqual(["Ticket Stub"]);
    expect(filterDesigns(all, "none", "all").map((d) => d.name)).toEqual(["Thermal Mono", "Big Name"]);
    expect(filterDesigns(all, "all", "mono").map((d) => d.name)).toEqual(["Thermal Mono"]);
    expect(filterDesigns(all, "none", "colour").map((d) => d.name)).toEqual(["Big Name"]);
  });
});
