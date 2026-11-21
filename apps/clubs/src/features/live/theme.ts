"use client";

import * as React from "react";

import type { BodyFont, DisplayFont, Media, PresetKey, Theme, Verdict } from "./schemas";

/**
 * The live room's look, as the console edits it and the big screen draws it.
 *
 * The server owns the theme: it picks every text colour and refuses an
 * accent the room could not see (CONTRACT 1.2). What is here is the same
 * arithmetic, so the editor can answer on every keystroke and the preview
 * can draw a theme before it is saved; the server's verdict (theme/check)
 * is still what decides.
 */

// --- contrast (WCAG 2.1) ----------------------------------------------------------------------

export const LIGHT = "#FFFFFF";
export const DARK = "#111827";
export const BLACK = "#000000";
/** AA for text. */
export const TEXT_MIN = 4.5;
/** The accent against the background (large text and marks). */
export const ACCENT_MIN = 3;
/** Below this an answer tile blends into the background: a warning only. */
export const TILE_WARN = 1.5;

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Two decimals, as the server reports a ratio. */
export const ratio = (a: string, b: string) => Math.round(contrast(a, b) * 100) / 100;

/**
 * The text colour that reads on every one of `fills`: the better of white
 * and the ink when it reaches AA on all, else black or white if one does;
 * null when nothing does (a gradient from light to dark). The server's
 * theme.text_on, step for step.
 */
export function textOn(...fills: string[]): string | null {
  const worst = (c: string) => Math.min(...fills.map((f) => contrast(c, f)));
  const best = worst(DARK) > worst(LIGHT) ? DARK : LIGHT;
  if (worst(best) >= TEXT_MIN) return best;
  for (const c of [BLACK, LIGHT]) if (worst(c) >= TEXT_MIN) return c;
  return null;
}

export const isHex = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

// --- what the editor sends ----------------------------------------------------------------------

/** A theme as PUT takes it: pictures by id ("club": the club's own logo). */
export type ThemeDraft = Omit<Theme, "text" | "logo" | "background"> & {
  logo: string | null;
  background: Omit<Theme["background"], "image"> & { image: string | null };
};

export const ANSWERS = ["#DC2626", "#2563EB", "#D97706", "#16A34A", "#7C3AED", "#0891B2"];
export const HIGH_CONTRAST_ANSWERS = ["#FF6B6B", "#4DA3FF", "#FFD400", "#3DDC84", "#C792EA", "#2EE6E6"];
export const LIGHT_BG = "#F4F5F2";
export const DARK_BG = "#0B0E0D";

const base = (): ThemeDraft => ({
  preset: "meridian_dark",
  colors: { background: DARK_BG, accent: "#4FCDB0", answers: [...ANSWERS] },
  font: { display: "dm_sans", body: "dm_sans" },
  answers: { style: "shapes" },
  timer: "bar",
  leaderboard: { size: 5, podium: true, animate: true, own_rank: true },
  logo: null,
  background: { kind: "color", gradient: null, image: null, dim: 0.45 },
  screen: { text_scale: 1, logo: true, sponsors: false, join: "corner", answer_layout: "grid" },
  guest: { text_scale: 1, logo: true, background: "plain", answer_layout: "column" },
});

export const PRESET_NAMES: Record<PresetKey, string> = {
  meridian_light: "Meridian light",
  meridian_dark: "Meridian dark",
  high_contrast: "High contrast",
  club: "Club colours",
};

export const PRESET_HINTS: Record<PresetKey, string> = {
  meridian_light: "The dashboard's own, on a light ground",
  meridian_dark: "The dashboard's own, for a dark hall",
  high_contrast: "Bright on black, larger type",
  club: "Your brand colour and logo",
};

const hexOr = (v: string | null | undefined, fallback: string | null) => {
  const s = (v ?? "").trim();
  return isHex(s) ? s.toUpperCase() : fallback;
};

/**
 * A preset's whole theme, as the server makes it (theme.preset). The club's
 * brand colours make `club`; the server's /theme/presets is what the editor
 * shows, this is for before it answers.
 */
export function presetDraft(key: PresetKey, club?: { brand_primary?: string | null; brand_secondary?: string | null; logo?: boolean }): ThemeDraft {
  const t = base();
  t.preset = key;
  if (key === "meridian_light") {
    t.colors.background = LIGHT_BG;
    t.colors.accent = "#0C7A66";
  } else if (key === "high_contrast") {
    t.colors = { background: "#000000", accent: "#FFD400", answers: [...HIGH_CONTRAST_ANSWERS] };
    t.timer = "number";
    t.screen.text_scale = 1.15;
    t.guest.text_scale = 1.1;
  } else if (key === "club") {
    const primary = hexOr(club?.brand_primary, "#4FCDB0")!;
    const bg = contrast(primary, DARK_BG) >= ACCENT_MIN ? DARK_BG : LIGHT_BG;
    const answers = [...ANSWERS];
    const secondary = hexOr(club?.brand_secondary, null);
    if (secondary && !answers.includes(secondary)) answers[0] = secondary;
    t.colors = { background: bg, accent: primary, answers };
    t.logo = club?.logo ? "club" : null;
  }
  return t;
}

/** The draft a resolved theme came from: pictures back to their ids. */
export function draftOf(theme: Theme): ThemeDraft {
  const { text: _text, logo, background, ...rest } = theme;
  void _text;
  return {
    ...structuredClone(rest),
    logo: logo ? (logo.id ?? "club") : null,
    background: { ...structuredClone(background), image: background.image?.id ?? null },
  };
}

// --- the verdict ----------------------------------------------------------------------

export interface LocalVerdict {
  errors: Verdict[];
  warnings: Verdict[];
}

const LETTERS = "ABCDEF";

/** The contrast rules on a draft (the server's theme.judge): errors block saving, warnings do not. */
export function judge(t: ThemeDraft): LocalVerdict {
  const errors: Verdict[] = [];
  const warnings: Verdict[] = [];
  const bg = t.colors.background;
  const accent = t.colors.accent;
  if (!isHex(bg) || !isHex(accent) || t.colors.answers.some((a) => !isHex(a))) {
    errors.push({ field: "colors", code: "THEME_INVALID", message: "Every colour is a hex value like #1A2B3C." });
    return { errors, warnings };
  }
  const r = ratio(accent, bg);
  if (r < ACCENT_MIN)
    errors.push({ field: "colors.accent", code: "THEME_CONTRAST", ratio: r, message: `The accent needs more contrast with the background (${r}:1, at least 3:1).` });
  const answers = t.colors.answers.map((a) => a.toUpperCase());
  if (new Set(answers).size !== answers.length)
    errors.push({ field: "colors.answers", code: "THEME_CONTRAST", message: "Give every answer its own colour." });
  answers.forEach((a, i) => {
    const ar = ratio(a, bg);
    if (ar < TILE_WARN)
      warnings.push({ field: `colors.answers.${i}`, code: "ANSWER_BLENDS", ratio: ar, message: `Answer ${LETTERS[i]}'s colour is close to the background.` });
  });
  const g = t.background.kind === "gradient" ? t.background.gradient : null;
  if (t.background.kind === "gradient" && !g)
    errors.push({ field: "background.gradient", code: "THEME_INVALID", message: "Pick the gradient's two colours." });
  if (g && isHex(g.from) && isHex(g.to)) {
    if (textOn(g.from, g.to) === null)
      errors.push({ field: "background.gradient", code: "THEME_CONTRAST", message: "Text cannot be read on both ends of this gradient; bring its colours closer." });
    for (const end of ["from", "to"] as const) {
      const er = ratio(accent, g[end]);
      if (er < TILE_WARN)
        warnings.push({ field: `background.gradient.${end}`, code: "ACCENT_ON_GRADIENT", ratio: er, message: "The accent is hard to see on this end of the gradient." });
    }
  }
  if (t.background.kind === "image" && !t.background.image)
    errors.push({ field: "background.image", code: "THEME_INVALID", message: "Pick a background picture." });
  return { errors, warnings };
}

/**
 * The draft as the renderers would get it (the server's theme.resolve):
 * text colours computed, picture ids turned into pictures. A picture that is
 * not to hand shows none, and a background image falls back to its colour.
 */
export function resolveDraft(d: ThemeDraft, media: Record<string, Media>, clubLogo: Media | null): Theme {
  const logo = d.logo === "club" ? clubLogo : d.logo ? (media[d.logo] ?? null) : null;
  const image = d.background.image ? (media[d.background.image] ?? null) : null;
  const kind = d.background.kind === "image" && !image ? "color" : d.background.kind;
  const bg = isHex(d.colors.background) ? d.colors.background : DARK_BG;
  const g = kind === "gradient" ? d.background.gradient : null;
  const fills = g && isHex(g.from) && isHex(g.to) ? [g.from, g.to] : [bg];
  const safe = (c: string) => (isHex(c) ? c : bg);
  return {
    ...structuredClone(d),
    logo,
    background: { ...d.background, kind, image },
    text: {
      on_background: textOn(...fills) ?? textOn(bg) ?? LIGHT,
      on_accent: textOn(safe(d.colors.accent)) ?? LIGHT,
      on_answers: d.colors.answers.map((a) => textOn(safe(a)) ?? LIGHT),
    },
  };
}

// --- drawing it ----------------------------------------------------------------------

export const DISPLAY_FONT_LABEL: Record<DisplayFont, string> = {
  dm_sans: "DM Sans",
  bebas_neue: "Bebas Neue",
  poppins: "Poppins",
  space_grotesk: "Space Grotesk",
};
export const BODY_FONT_LABEL: Record<BodyFont, string> = {
  dm_sans: "DM Sans",
  inter: "Inter",
  poppins: "Poppins",
  noto_sans: "Noto Sans",
};

/** Each font as CSS: the family, then the dashboard's own sans if it does not load. */
const FAMILY: Record<DisplayFont | BodyFont, string> = {
  dm_sans: "'DM Sans'",
  bebas_neue: "'Bebas Neue'",
  poppins: "'Poppins'",
  space_grotesk: "'Space Grotesk'",
  // Already on every page of this app (next/font): no second download.
  inter: "var(--font-inter), 'Inter'",
  noto_sans: "'Noto Sans'",
};
const FALLBACK = "var(--font-inter), ui-sans-serif, system-ui, sans-serif";

/** Google Fonts' names and the weights the screen draws. Inter is this app's own. */
const GOOGLE: Partial<Record<DisplayFont | BodyFont, string>> = {
  dm_sans: "DM+Sans:wght@400;500;600;700",
  bebas_neue: "Bebas+Neue",
  poppins: "Poppins:wght@400;500;600;700",
  space_grotesk: "Space+Grotesk:wght@400;500;600;700",
  noto_sans: "Noto+Sans:wght@400;500;600;700",
};

export function fontStack(key: DisplayFont | BodyFont): string {
  return `${FAMILY[key]}, ${FALLBACK}`;
}

/** The stylesheet that brings a theme's fonts, or null when they are this app's own. */
export function fontsHref(theme: Pick<Theme, "font"> | null | undefined): string | null {
  if (!theme) return null;
  const families = [...new Set([theme.font.display, theme.font.body])].map((k) => GOOGLE[k]).filter(Boolean);
  return families.length ? `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap` : null;
}

/** Loads a theme's fonts once per page (Google Fonts, which the dashboard's policy allows). */
export function useThemeFonts(theme: Pick<Theme, "font"> | null | undefined) {
  const href = fontsHref(theme);
  React.useEffect(() => {
    if (!href || typeof document === "undefined") return;
    if (document.head.querySelector(`link[data-live-fonts="${CSS.escape(href)}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.liveFonts = href;
    document.head.appendChild(link);
  }, [href]);
}

/** The marks beside each answer: one shape each, so a colour-blind player can still tell them apart. */
export const SHAPES = ["▲", "◆", "●", "■", "★", "✚"] as const;
export const LETTER_MARKS = ["A", "B", "C", "D", "E", "F"] as const;
export const SHAPE_NAMES = ["triangle", "diamond", "circle", "square", "star", "cross"] as const;

/**
 * A theme as CSS custom properties for one surface (`screen` or `guest`).
 * Everything the stage draws reads these, so the preview and the projector
 * are the same component with a different set of numbers.
 */
export function themeVars(theme: Theme, surface: "screen" | "guest" = "screen"): React.CSSProperties {
  const vars: Record<string, string> = {
    "--lt-bg": theme.colors.background,
    "--lt-on-bg": theme.text.on_background,
    "--lt-muted": `color-mix(in srgb, ${theme.text.on_background} 66%, transparent)`,
    "--lt-panel": `color-mix(in srgb, ${theme.text.on_background} 8%, transparent)`,
    "--lt-panel-line": `color-mix(in srgb, ${theme.text.on_background} 14%, transparent)`,
    "--lt-accent": theme.colors.accent,
    "--lt-on-accent": theme.text.on_accent,
    "--lt-font-display": fontStack(theme.font.display),
    "--lt-font-body": fontStack(theme.font.body),
    "--lt-scale": String(surface === "screen" ? theme.screen.text_scale : theme.guest.text_scale),
  };
  theme.colors.answers.forEach((c, i) => {
    vars[`--lt-a${i}`] = c;
    vars[`--lt-on-a${i}`] = theme.text.on_answers[i] ?? LIGHT;
  });
  return vars as React.CSSProperties;
}

/**
 * The stage's own look, for an event that never saved a theme: the
 * dashboard's Meridian tokens (light or dark with the room), as the screen
 * has always been drawn.
 */
export function nativeVars(): React.CSSProperties {
  const vars: Record<string, string> = {
    "--lt-bg": "var(--canvas)",
    "--lt-on-bg": "var(--ink)",
    "--lt-muted": "var(--ink-3)",
    "--lt-panel": "var(--surface)",
    "--lt-panel-line": "var(--line)",
    "--lt-accent": "var(--brand)",
    "--lt-on-accent": "var(--brand-foreground)",
    "--lt-font-display": FALLBACK,
    "--lt-font-body": FALLBACK,
    "--lt-scale": "1",
  };
  for (let i = 0; i < 6; i++) {
    vars[`--lt-a${i}`] = "var(--sunken)";
    vars[`--lt-on-a${i}`] = "var(--ink)";
  }
  return vars as React.CSSProperties;
}

/** The background a theme paints, under everything on the stage. */
export function backgroundStyle(theme: Theme | null, surface: "screen" | "guest" = "screen"): React.CSSProperties {
  if (!theme) return { background: "var(--canvas)" };
  if (surface === "guest" && theme.guest.background === "plain") return { background: LIGHT_BG };
  const b = theme.background;
  if (b.kind === "gradient" && b.gradient) return { background: `linear-gradient(${b.gradient.angle}deg, ${b.gradient.from}, ${b.gradient.to})` };
  if (b.kind === "image" && b.image) {
    const src = (surface === "screen" ? b.image.large : b.image.medium) ?? b.image.original ?? b.image.medium;
    if (src) return { backgroundColor: theme.colors.background, backgroundImage: `url("${src}")`, backgroundSize: "cover", backgroundPosition: "center" };
  }
  return { background: theme.colors.background };
}

/** Whether a reader asked the OS for less motion: no slides, no ticker scroll, whatever the theme says. */
export function usePrefersReducedMotion() {
  const [reduce, setReduce] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(q.matches);
    sync();
    q.addEventListener?.("change", sync);
    return () => q.removeEventListener?.("change", sync);
  }, []);
  return reduce;
}
