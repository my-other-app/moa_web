import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TICKET_TOKENS } from "../ticket-tokens";
import { buildBody } from "./build";
import { v1Text } from "./from-v1";
import { blankPoster, isPosterFormat, POSTER_FORMAT_SPECS, POSTER_FORMATS, posterFormatOf, posterFrameOf } from "./poster";
import { DOC_KINDS, LayoutV2, parseLayoutV2 } from "./schema";
import { designTokens, fillTemplate, knownTokens, samplesV2, showV2, tokensV2 } from "./tokens";
import { validate } from "./validate";

/**
 * Posters, the fourth kind (feature-register/posters/CONTRACT.md): the
 * three formats, the poster's own tokens, its checks, and above all that
 * adding it leaves tickets, certificates and ID cards exactly as they were.
 */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const PHOTO = "data:image/png;base64,iVBORw0KGgo=";

const poster = (format: "square" | "portrait" | "story", layers: unknown[], more: Record<string, unknown> = {}) => {
  const s = POSTER_FORMAT_SPECS[format];
  return { version: 2, page: { widthMm: s.widthMm, heightMm: s.heightMm }, canvas: { width: s.width, height: s.height }, layers, ...more };
};

const text = (id: string, src: string, more: Record<string, unknown> = {}) => ({
  kind: "text",
  id,
  name: id,
  x: 60,
  y: 60,
  width: 900,
  height: 80,
  text: src,
  font: { family: "Inter" },
  size: 48,
  ...more,
});

const photo = (more: Record<string, unknown> = {}) => ({
  kind: "image",
  id: "photo",
  name: "Guest photo",
  source: "guest_photo",
  x: 140,
  y: 180,
  width: 800,
  height: 800,
  fit: "cover",
  radius: 400,
  placeholder: "initials",
  ...more,
});

describe("the other kinds are as they were", () => {
  // Taken on main before posters (7dfec39): each kind's catalogue, samples and token names, and how v1 text converts.
  const BEFORE = {
    ticket: "0b1184a22d6c055b7260bb2dc125ae25a9031de3de196a0c766a461991f02582",
    certificate: "8be6c4ab1802d901b1fee6d1bfa9b8d3658ff5792bbf7a1e15b0a2332a558bc3",
    // The badge moved once more: it gained Game QR and Game PIN (the games add-on), and nothing else.
    badge: "034f92af251328fd504cd554f16bce3c036db0b0f3084b0f539e1b9eafb9f8ec",
    v1: "61c2ed9dd29e00e92fcf0240ba9496b0edd45c9579feca4ade04e7db160effbf",
  };

  it.each(["ticket", "certificate", "badge"] as const)("the %s catalogue, samples and names", (kind) => {
    const s = JSON.stringify({ t: tokensV2(kind), s: samplesV2(kind), d: [...designTokens(kind)].sort(), n: [...knownTokens(kind)].sort() });
    expect(sha(s)).toBe(BEFORE[kind]);
  });

  it("converting v1 text: the poster's names (name, organisation, club_name) leave it as it was", () => {
    const names = TICKET_TOKENS.flatMap((t) => [t.key, ...(t.aliases ?? [])]);
    expect(sha(names.map((n) => v1Text(`{{${n}}} {% if ${n} %}x{% endif %}`)).join("\n"))).toBe(BEFORE.v1);
    expect(v1Text("{{name}} of {{organisation}}, {{club_name}}")).toBe("{{name}} of {{organisation}}, {{club_name}}");
  });

  it("a ticket's {{name}} is still the guest's name (v1's alias), not the poster's token", () => {
    expect(fillTemplate("{{name}}", { attendee_name: "Ananya Iyer", name: "Somebody Else" }, "ticket")).toBe("Ananya Iyer");
  });
});

describe("the poster kind", () => {
  it("is a kind of document", () => {
    expect(DOC_KINDS).toContain("poster");
  });

  it("has the contract's tokens, with its samples", () => {
    const keys = tokensV2("poster").map((t) => t.key);
    expect(keys).toEqual([
      "name", "first_name", "last_name", "initials", "role", "role_label", "ticket_type", "organisation",
      "talk_title", "talk_time", "talk_hall", "event_name", "event_date", "event_time", "venue", "city",
      "club_name", "moment_phrase", "share_url",
    ]);
    const s = samplesV2("poster");
    expect([s.name, s.role, s.role_label, s.moment_phrase, s.share_url, s.event_name]).toEqual([
      "Asha Nair", "speaker", "Speaker", "I'm attending", "https://myotherapp.in/l/x7k2m9pq", "DevFest 2026",
    ]);
    expect(new Set(tokensV2("poster").map((t) => t.group))).toEqual(new Set(["Guest", "Speaker", "Event", "Club", "Poster"]));
  });

  it("reads its own tokens as themselves: {{name}} and {{organisation}} are the poster's", () => {
    const values = { name: "Asha Nair", attendee_name: "Wrong", organisation: "Sahyadri College", organization: "Wrong", moment_phrase: "I'm attending", event_name: "DevFest 2026" };
    expect(fillTemplate("{{moment_phrase}} {{event_name}} · {{name | upper}} · {{organisation}}", values, "poster")).toBe("I'm attending DevFest 2026 · ASHA NAIR · Sahyadri College");
    expect(showV2("organisation talk_title", { organisation: "X", talk_title: "" }, "poster")).toBe(false);
    expect(showV2("organisation|talk_title", { organisation: "X", talk_title: "" }, "poster")).toBe(true);
  });

  it("refuses a token that is not one: the same words as any kind", () => {
    const problems = validate(poster("square", [text("t", "{{nmae}}")]), "poster");
    expect(problems.filter((p) => p.code === "template").map((p) => p.message)[0]).toMatch(/^t: \{\{nmae\}\} is not a token\./);
  });
});

describe("the formats", () => {
  it("are square, portrait and story, at 96 dpi", () => {
    expect(POSTER_FORMATS).toEqual(["square", "portrait", "story"]);
    expect(POSTER_FORMATS.map((f) => [POSTER_FORMAT_SPECS[f].width, POSTER_FORMAT_SPECS[f].height, POSTER_FORMAT_SPECS[f].widthMm, POSTER_FORMAT_SPECS[f].heightMm])).toEqual([
      [1080, 1080, 285.75, 285.75],
      [1080, 1350, 285.75, 357.1875],
      [1080, 1920, 285.75, 508],
    ]);
    expect(isPosterFormat("story")).toBe(true);
    expect(isPosterFormat("landscape")).toBe(false);
  });

  it("are read from a layout's canvas and page, with an editor's rounding", () => {
    expect(posterFormatOf(parseLayoutV2(poster("portrait", [])))).toBe("portrait");
    expect(posterFormatOf({ canvas: { width: 1080, height: 1350, background: null }, page: { widthMm: 285.75, heightMm: 357.188 } })).toBe("portrait");
    expect(posterFormatOf({ canvas: { width: 1080, height: 1350, background: null }, page: { widthMm: 285.75, heightMm: 358 } })).toBeNull();
    expect(posterFormatOf({ canvas: { width: 1000, height: 1000, background: null }, page: { widthMm: 285.75, heightMm: 285.75 } })).toBeNull();
  });

  it("a blank poster of each format is a valid poster", () => {
    for (const f of POSTER_FORMATS) {
      const b = blankPoster(f);
      expect(LayoutV2.safeParse(b).success).toBe(true);
      expect(validate(b, "poster").filter((p) => p.level === "error")).toEqual([]);
      expect(posterFormatOf(b)).toBe(f);
    }
  });

  it("a canvas in none of them is refused, as the API refuses it", () => {
    const off = { ...poster("square", []), canvas: { width: 1200, height: 1200 }, page: { widthMm: 317.5, heightMm: 317.5 } };
    expect(validate(off, "poster").filter((p) => p.level === "error")).toEqual([
      {
        code: "poster_format",
        field: "canvas",
        level: "error",
        message: "A poster is 1080 × 1080 (square), 1080 × 1350 (portrait) or 1080 × 1920 (story) pixels, on a page of the same size at 96 dpi.",
      },
    ]);
    // The same canvas is fine on any other kind.
    expect(validate(off, "ticket").some((p) => p.code === "poster_format")).toBe(false);
  });
});

describe("a poster's QR and photo", () => {
  const qr = { kind: "qr", id: "qr", name: "QR code", x: 880, y: 880, width: 160, height: 160, quietZone: 2 };

  it("needs no QR; one with no binding is fine, a second is refused, the Personal QR is the ID card's", () => {
    expect(validate(poster("square", []), "poster").some((p) => p.code === "qr_missing")).toBe(false);
    expect(validate(poster("square", [qr]), "poster").filter((p) => p.level === "error")).toEqual([]);
    expect(validate(poster("square", [qr, { ...qr, id: "qr2" }]), "poster").map((p) => p.code)).toContain("qr_extra");
    expect(validate(poster("square", [{ ...qr, bind: "holder.profile_qr_url" }]), "poster").map((p) => p.code)).toContain("qr_profile_kind");
  });

  it("the QR encodes what the context gives it: the guest's share link", () => {
    const layout = parseLayoutV2(poster("square", [qr]));
    const a = buildBody(layout, {}, { qr: "https://myotherapp.in/l/x7k2m9pq" }, { kind: "poster" });
    const b = buildBody(layout, {}, { qr: "https://api.myotherapp.in/l/zzzzzzzz" }, { kind: "poster" });
    expect(a).toContain('data-kind="qr"');
    expect(a).not.toBe(b);
  });

  it("the photo frame shows the photo, else the guest's initials", () => {
    const layout = parseLayoutV2(poster("square", [photo()]));
    const withPhoto = buildBody(layout, { name: "Asha Nair", initials: "AN" }, { images: { guest_photo: PHOTO } }, { kind: "poster" });
    expect(withPhoto).toContain(`<img src="${PHOTO}"`);
    const without = buildBody(layout, { name: "Asha Nair", initials: "AN" }, {}, { kind: "poster" });
    expect(without).toContain('class="moa-initials"');
    expect(without).toContain(">AN</span>");
  });

  it("the frame is the largest guest photo that shows", () => {
    const layout = parseLayoutV2(poster("square", [photo({ id: "small", width: 100, height: 100 }), photo({ id: "big" }), photo({ id: "hidden", width: 1000, height: 1000, hidden: true })]));
    expect(posterFrameOf(layout)?.id).toBe("big");
    expect(posterFrameOf(parseLayoutV2(poster("square", [])))).toBeNull();
  });
});

/**
 * The backend's poster starters, as the board opens them: every format of
 * every file parses, validates as a poster and builds. Run with
 * LAYOUT_V2_STARTERS (moa_backend backend/app/core/layout_v2/starters) or
 * POSTER_DESIGNS (the design agent's folder: <id>/<format>.json); skipped
 * otherwise, as starters-parity.test.ts is.
 */
const starterFiles = (): { name: string; format: string; raw: unknown }[] => {
  const out: { name: string; format: string; raw: unknown }[] = [];
  const root = process.env.LAYOUT_V2_STARTERS ? join(process.env.LAYOUT_V2_STARTERS, "poster") : null;
  if (root && existsSync(root))
    for (const f of readdirSync(root).filter((x) => x.endsWith(".json"))) {
      const data = JSON.parse(readFileSync(join(root, f), "utf8")) as { formats?: Record<string, unknown> };
      for (const [format, raw] of Object.entries(data.formats ?? {})) out.push({ name: f, format, raw });
    }
  const designs = process.env.POSTER_DESIGNS;
  if (designs && existsSync(designs))
    for (const dir of readdirSync(designs)) {
      if (!existsSync(join(designs, dir, "square.json"))) continue;
      for (const format of POSTER_FORMATS) {
        const p = join(designs, dir, `${format}.json`);
        if (existsSync(p)) out.push({ name: dir, format, raw: JSON.parse(readFileSync(p, "utf8")) as unknown });
      }
    }
  return out;
};
const starters = starterFiles();

describe.skipIf(!starters.length)("the poster starters", () => {
  it.each(starters.map((s) => [`${s.name} ${s.format}`, s] as const))("%s parses, validates and builds", (_n, s) => {
    const parsed = LayoutV2.safeParse(s.raw);
    expect(parsed.success ? [] : parsed.error.issues.slice(0, 3)).toEqual([]);
    expect(validate(s.raw, "poster").filter((p) => p.level === "error")).toEqual([]);
    expect(posterFormatOf(parsed.data as LayoutV2)).toBe(s.format);
    const body = buildBody(parsed.data as LayoutV2, samplesV2("poster"), { qr: "https://myotherapp.in/l/x7k2m9pq" }, { kind: "poster" });
    expect(body.startsWith('<div class="moa-doc"')).toBe(true);
  });
});
