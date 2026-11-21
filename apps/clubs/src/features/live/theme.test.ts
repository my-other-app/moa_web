import { describe, expect, it } from "vitest";

import { themeSchema } from "./schemas";
import {
  ANSWERS,
  BLACK,
  DARK,
  LIGHT,
  contrast,
  draftOf,
  fontsHref,
  judge,
  presetDraft,
  ratio,
  resolveDraft,
  textOn,
  themeVars,
  type ThemeDraft,
} from "./theme";

/**
 * The look's arithmetic, which the editor runs on every keystroke: the same
 * WCAG 2.1 numbers and the same rules the server applies (CONTRACT 1.2), so
 * what the editor says before saving is what the server will say after.
 */

describe("contrast", () => {
  it("is WCAG 2.1's ratio", () => {
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(ratio("#777777", "#FFFFFF")).toBe(4.48);
    expect(contrast("#4FCDB0", "#4FCDB0")).toBe(1);
  });

  it("picks white or the ink when one reads, black where white just fails, and nothing on a light-to-dark gradient", () => {
    expect(textOn("#0B0E0D")).toBe(LIGHT);
    expect(textOn("#F4F5F2")).toBe(DARK);
    expect(textOn("#4FCDB0")).toBe(DARK);
    // White is 4.48:1 on mid grey: not enough; black reaches 4.69:1.
    expect(textOn("#777777")).toBe(BLACK);
    expect(textOn("#000000", "#FFFFFF")).toBeNull();
    // Both ends dark: white reads on both.
    expect(textOn("#101820", "#29335C")).toBe(LIGHT);
  });

  it("always reaches 4.5:1 when it answers, over many colours", () => {
    for (let i = 0; i < 400; i++) {
      const hex = `#${((i * 2654435761) >>> 8).toString(16).padStart(6, "0").slice(-6).toUpperCase()}`;
      const ink = textOn(hex);
      expect(ink).not.toBeNull();
      expect(contrast(ink!, hex)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the verdict", () => {
  const base = () => presetDraft("meridian_dark");

  it("passes every preset", () => {
    for (const key of ["meridian_light", "meridian_dark", "high_contrast", "club"] as const) {
      expect(judge(presetDraft(key)).errors).toEqual([]);
    }
  });

  it("blocks an accent under 3:1 on the background, with its ratio", () => {
    const d: ThemeDraft = { ...base(), colors: { ...base().colors, accent: "#1F2A2A" } };
    const v = judge(d);
    expect(v.errors).toHaveLength(1);
    expect(v.errors[0]).toMatchObject({ field: "colors.accent", code: "THEME_CONTRAST" });
    expect(v.errors[0]!.ratio).toBeLessThan(3);
    expect(v.errors[0]!.message).toMatch(/at least 3:1/);
  });

  it("blocks two answers in the same colour, and warns when one blends into the background", () => {
    const answers = [...ANSWERS];
    answers[1] = answers[0]!;
    expect(judge({ ...base(), colors: { ...base().colors, answers } }).errors[0]).toMatchObject({ field: "colors.answers" });
    const blend = [...ANSWERS];
    blend[3] = "#101413";
    const v = judge({ ...base(), colors: { ...base().colors, answers: blend } });
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([expect.objectContaining({ field: "colors.answers.3", code: "ANSWER_BLENDS", message: "Answer D's colour is close to the background." })]);
  });

  it("blocks a gradient no text can be read on, and asks for its colours and a picture when the kind needs them", () => {
    expect(judge({ ...base(), background: { ...base().background, kind: "gradient", gradient: { from: "#000000", to: "#FFFFFF", angle: 90 } } }).errors[0]).toMatchObject({
      field: "background.gradient",
      code: "THEME_CONTRAST",
    });
    expect(judge({ ...base(), background: { ...base().background, kind: "gradient", gradient: null } }).errors[0]).toMatchObject({ field: "background.gradient" });
    expect(judge({ ...base(), background: { ...base().background, kind: "image", image: null } }).errors[0]).toMatchObject({ field: "background.image" });
  });

  it("refuses a colour that is not a hex value", () => {
    expect(judge({ ...base(), colors: { ...base().colors, background: "#12" } }).errors[0]).toMatchObject({ code: "THEME_INVALID" });
  });
});

describe("presets", () => {
  it("are the contract's values", () => {
    expect(presetDraft("meridian_light").colors).toEqual({ background: "#F4F5F2", accent: "#0C7A66", answers: ANSWERS });
    const hc = presetDraft("high_contrast");
    expect(hc.colors.background).toBe("#000000");
    expect(hc.timer).toBe("number");
    expect(hc.screen.text_scale).toBe(1.15);
    expect(hc.guest.text_scale).toBe(1.1);
  });

  it("make the club's from its brand colours, on light when the brand is too dark for the dark ground", () => {
    const club = presetDraft("club", { brand_primary: "#f2aa4c", brand_secondary: "#29335c", logo: true });
    expect(club.colors.accent).toBe("#F2AA4C");
    expect(club.colors.background).toBe("#0B0E0D");
    expect(club.colors.answers[0]).toBe("#29335C");
    expect(club.logo).toBe("club");
    expect(presetDraft("club", { brand_primary: "#1A1A40" }).colors.background).toBe("#F4F5F2");
    expect(presetDraft("club", {}).colors.accent).toBe("#4FCDB0");
  });
});

describe("resolving a draft for the preview", () => {
  const logo = { id: "m1", kind: "logo", thumbnail: "https://cdn/t.png", medium: "https://cdn/m.png", large: "https://cdn/l.png", original: "https://cdn/o.png" };
  const clubLogo = { id: null, kind: "logo", thumbnail: "https://cdn/club-t.png", medium: "https://cdn/club-m.png", large: "https://cdn/club-l.png", original: null };

  it("computes the text colours and turns picture ids into pictures, as the server does", () => {
    const d: ThemeDraft = { ...presetDraft("meridian_light"), logo: "m1" };
    const t = resolveDraft(d, { m1: logo }, null);
    expect(t.text.on_background).toBe(DARK);
    expect(t.text.on_answers).toHaveLength(6);
    expect(t.logo?.large).toBe("https://cdn/l.png");
    expect(themeSchema.safeParse(t).success).toBe(true);
    expect(resolveDraft({ ...d, logo: "club" }, {}, clubLogo).logo?.medium).toBe("https://cdn/club-m.png");
  });

  it("falls back to the colour when the background picture is not to hand", () => {
    const d: ThemeDraft = { ...presetDraft("meridian_dark"), background: { kind: "image", gradient: null, image: "gone", dim: 0.5 } };
    expect(resolveDraft(d, {}, null).background.kind).toBe("color");
  });

  it("reads text on a gradient against both ends", () => {
    const d: ThemeDraft = { ...presetDraft("meridian_dark"), background: { kind: "gradient", gradient: { from: "#F4F5F2", to: "#E6E8E4", angle: 180 }, image: null, dim: 0.45 } };
    expect(resolveDraft(d, {}, null).text.on_background).toBe(DARK);
  });

  it("goes back to the same draft it came from", () => {
    const d: ThemeDraft = { ...presetDraft("club", { brand_primary: "#F2AA4C", logo: true }), background: { kind: "image", gradient: null, image: "m2", dim: 0.6 } };
    const media = { m2: { ...logo, id: "m2", kind: "background" } };
    expect(draftOf(resolveDraft(d, media, clubLogo))).toEqual(d);
  });
});

describe("drawing it", () => {
  it("loads only the fonts the dashboard does not have already", () => {
    const t = resolveDraft(presetDraft("meridian_dark"), {}, null);
    expect(fontsHref(t)).toBe("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap");
    expect(fontsHref({ ...t, font: { display: "bebas_neue", body: "inter" } })).toBe("https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap");
    expect(fontsHref(null)).toBeNull();
  });

  it("sets each colour, its text colour, the fonts and the surface's text size as custom properties", () => {
    const t = resolveDraft({ ...presetDraft("high_contrast") }, {}, null);
    const screen = themeVars(t, "screen") as Record<string, string>;
    expect(screen["--lt-bg"]).toBe("#000000");
    expect(screen["--lt-accent"]).toBe("#FFD400");
    expect(screen["--lt-on-accent"]).toBe(t.text.on_accent);
    expect(screen["--lt-a5"]).toBe("#2EE6E6");
    expect(screen["--lt-scale"]).toBe("1.15");
    expect((themeVars(t, "guest") as Record<string, string>)["--lt-scale"]).toBe("1.1");
  });
});
