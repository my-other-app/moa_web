import {
  type AgendaLayer,
  canvasForPage,
  type ImageLayer,
  PAGE_PRESETS,
  type PageSpec,
  type QrLayer,
  type ShapeLayer,
  type TextLayer,
  type TicketCanvas,
  type TicketLayer,
} from "./ticket-layout";

/**
 * Complete layered designs to start from -- no template needed: the CR80
 * card and the programme layouts. Mirrors the backend's starters layer for
 * layer; the ids are stable names.
 */

const text = (id: string, name: string, t: string, x: number, y: number, width: number, size: number, more: Partial<TextLayer> = {}): TextLayer => ({
  kind: "text", id, name, text: t, x, y, width, size, font: "inter", weight: 400, color: "#141614", align: "left",
  maxLines: 1, lineSpacing: 0, letterSpacing: 0, fit: "shrink", opacity: 1, hidden: false, locked: false, preprinted: false, ...more,
});
const shape = (id: string, name: string, x: number, y: number, width: number, height: number, more: Partial<ShapeLayer> = {}): ShapeLayer => ({
  kind: "shape", id, name, x, y, width, height, fill: "#1B6B47", stroke: null, strokeWidth: 0, radius: 0, opacity: 1, path: null,
  hidden: false, locked: false, preprinted: false, ...more,
});
const qr = (x: number, y: number, size: number): QrLayer => ({
  kind: "qr", id: "qr", name: "QR code", x, y, size, quietZone: 2, dark: "#000000", light: "#FFFFFF", hidden: false, locked: false, preprinted: false,
});
const image = (id: string, name: string, source: ImageLayer["source"], x: number, y: number, width: number, height: number, more: Partial<ImageLayer> = {}): ImageLayer => ({
  kind: "image", id, name, x, y, width, height, source, imageKey: null, fit: "contain", align: "center", radius: 0, opacity: 1,
  hidden: false, locked: false, preprinted: false, ...more,
});

export type StarterLayout = { canvas: TicketCanvas; layers: TicketLayer[]; page: PageSpec };

// ─── ID cards ───────────────────────────────────────────────────────────

/**
 * The one layered badge kept beside the 4 × 6 in designs: a credit-card
 * (CR80) card for card printers. The ticket and certificate starters and the
 * other badge layouts were replaced by the designer's templates
 * (feature-register/doc-designs-contract.md); a custom design starts from a
 * blank canvas or this card.
 */
export const BADGE_STARTERS = {
  card_cr80: { label: "Card (CR80)", note: "For card printers: brand head, photo in a ring, first name large, type band with the QR" },
} as const;
export type BadgeStarter = keyof typeof BADGE_STARTERS;

/** The CR80 card, upright. Pixel for pixel the Python starter. */
export const badgeStarter = (_kind: BadgeStarter = "card_cr80", opts: { seats: boolean; page?: PageSpec | null } = { seats: false }): StarterLayout => {
  const page = PAGE_PRESETS.cr80_portrait.page;
  const { width: W, height: H } = canvasForPage(page);
  const canvas: TicketCanvas = { width: W, height: H, background: "#FFFFFF", templateKey: null, templatePreprinted: false, area: null };
  const M = 44;
  const first = opts.seats ? "{{seat}}" : "{{first_name}}";
  const last = "{{last_name}}";
  const org = "{% if organization %}{{organization}}{% endif %}";
  const seats = opts.seats;
  const headH = 400;
  const ring = 300;
  const photo = 270;
  const bandY = 800;
  const tile = 176;
  return {
    page,
    canvas,
    layers: [
      shape("head", "Brand head", 0, 0, W, headH, { fill: "brand.primary" }),
      image("logo", "Club logo", "org_logo", M, 40, 170, 70, { align: "left" }),
      text("event", "Event name", "{{event_name | upper}}", M, 120, W - 2 * M, 28, { font: "mono", weight: 700, color: "#FFFFFF", letterSpacing: 2, maxLines: 2 }),
      text("when", "Date", "{{event_date | upper}}", M, 192, 300, 22, { font: "mono", color: "brand.secondary", letterSpacing: 2 }),
      shape("accent", "Accent rule", M, 236, 64, 6, { fill: "brand.secondary" }),
      shape("photo-ring", "Photo ring", (W - ring) / 2, headH - ring / 2, ring, ring, { fill: "#FFFFFF", radius: ring / 2, hidden: seats }),
      image("photo", "Guest photo", "guest_photo", (W - photo) / 2, headH - photo / 2, photo, photo, { fit: "cover", radius: photo / 2, hidden: seats }),
      seats ? text("first", "Seat", first, M, 470, W - 2 * M, 140, { font: "bebas", align: "center" }) : text("first", "First name", first, M, 574, W - 2 * M, 84, { weight: 700, align: "center" }),
      text("last", "Last name", last, M, 676, W - 2 * M, 40, { align: "center", color: "#3C413D", hidden: seats }),
      text("org", "Organization", org, M, 736, W - 2 * M, 26, { align: "center", color: "#6B716C" }),
      shape("foot", "Role band", 0, bandY, W, H - bandY, { fill: "ticket_type" }),
      text("type", "Ticket type", "{{ticket_type | upper}}", M, bandY + 36, 330, 64, { font: "bebas", color: "#FFFFFF", letterSpacing: 2 }),
      text("code", "Ticket code", "{{ticket_code}}", M, bandY + 130, 330, 22, { font: "mono", color: "#FFFFFF", opacity: 0.85 }),
      shape("qr-tile", "QR tile", W - M - tile, bandY + 18, tile, tile, { fill: "#FFFFFF", radius: 20 }),
      qr(W - M - tile + (tile - 150) / 2, bandY + 18 + (tile - 150) / 2, 150),
    ],
  };
};

// ─── Agenda / programme ──────────────────────────────────────────────────

const agenda = (id: string, x: number, y: number, width: number, height: number, more: Partial<AgendaLayer> = {}): AgendaLayer => ({
  kind: "agenda", id, name: "Run of show", x, y, width, height, font: "inter", size: 28, color: "#141614", accent: "brand.primary", muted: "#5A5F5B",
  align: "left", rowGap: 16, columns: 1, showSpeaker: true, showLocation: true, showDayHeadings: true, opacity: 1, hidden: false, locked: false, preprinted: false, ...more,
});

export const AGENDA_STARTERS = {
  screen: { label: "Kiosk screen", note: "Dark, 16:9 — brand panel beside the sessions, big type" },
  screen_light: { label: "Screen, light", note: "White, 16:9 — brand header, two columns" },
  portrait: { label: "Kiosk portrait", note: "Dark, 9:16 — for a tablet standing upright" },
  programme: { label: "Printed programme", note: "A4 portrait — cover block, one readable column" },
} as const;
export type AgendaStarter = keyof typeof AGENDA_STARTERS;

const AGENDA_KICKER = { font: "mono", weight: 700, color: "brand.secondary", letterSpacing: 4 } as const;
const AGENDA_WHEN = "{{event_day | upper}} · {{event_date | upper}}";
const screenCanvas = (width: number, height: number, background: string): TicketCanvas => ({ width, height, background, templateKey: null, templatePreprinted: false, area: null });

/**
 * A complete programme to start from: a 16:9 screen at 1920 × 1080, a 9:16
 * screen at 1080 × 1920, or an A4 page at 150 dpi. Screens are dark (the
 * kiosk around them is), set the sessions at a size read from two metres,
 * and give the event its own block in the brand colour; the page is light
 * and keeps the sessions to one column, which reads better on paper than two
 * narrow ones. Mirrors the backend's `agenda_starter` layer for layer.
 */
export const agendaStarter = (kind: AgendaStarter = "screen"): StarterLayout => {
  if (kind === "programme") {
    const page = PAGE_PRESETS.a4_portrait.page;
    const { width: W, height: H } = canvasForPage(page, 150);
    const M = 100;
    const cover = 660;
    return {
      page,
      canvas: screenCanvas(W, H, "#FFFFFF"),
      layers: [
        shape("cover", "Cover block", 0, 0, W, cover, { fill: "brand.primary" }),
        image("logo", "Client logo", "org_logo", M, 90, 260, 100, { align: "left" }),
        text("kicker", "Kicker", "PROGRAMME", M, 262, 800, 24, AGENDA_KICKER),
        text("title", "Event name", "{{event_name}}", M, 304, W - 2 * M, 92, { font: "dm_serif", color: "#FFFFFF", maxLines: 2 }),
        text("when", "Date", AGENDA_WHEN, M, 548, W - 2 * M, 26, { font: "mono", weight: 700, color: "#FFFFFF", letterSpacing: 2 }),
        text("venue", "Venue", "{{venue}}", M, 592, W - 2 * M, 28, { color: "#FFFFFF", opacity: 0.8 }),
        shape("accent", "Accent strip", 0, cover, W, 10, { fill: "brand.secondary" }),
        agenda("agenda", M, cover + 90, W - 2 * M, H - cover - 90 - 150, { size: 30, rowGap: 26, accent: "brand.primary" }),
        shape("foot-rule", "Footer rule", M, H - 110, W - 2 * M, 2, { fill: "#E1E1DC" }),
        text("foot", "Footer", "{{org_name}}", M, H - 84, 640, 20, { font: "mono", color: "#5A5F5B" }),
        text("note", "Footnote", "Times may change on the day", W - M - 520, H - 84, 520, 20, { font: "mono", color: "#8C918C", align: "right" }),
      ],
    };
  }

  if (kind === "portrait") {
    const page = PAGE_PRESETS.screen_portrait.page;
    const W = 1080;
    const H = 1920;
    const M = 80;
    const block = 760;
    return {
      page,
      canvas: screenCanvas(W, H, "#0B140F"),
      layers: [
        shape("block", "Brand block", 0, 0, W, block, { fill: "brand.primary" }),
        image("logo", "Client logo", "org_logo", M, 90, 260, 100, { align: "left" }),
        text("kicker", "Kicker", "TODAY’S PROGRAMME", M, 300, W - 2 * M, 26, AGENDA_KICKER),
        text("title", "Event name", "{{event_name}}", M, 350, W - 2 * M, 96, { weight: 700, color: "#FFFFFF", maxLines: 2 }),
        shape("accent", "Accent rule", M, 610, 96, 8, { fill: "brand.secondary" }),
        text("when", "Date", AGENDA_WHEN, M, 650, W - 2 * M, 30, { font: "mono", weight: 700, color: "#FFFFFF", letterSpacing: 2 }),
        text("venue", "Venue", "{{venue}}", M, 698, W - 2 * M, 30, { color: "#FFFFFF", opacity: 0.78 }),
        agenda("agenda", M, block + 90, W - 2 * M, H - block - 90 - 160, { size: 44, rowGap: 40, color: "#F2F5F1", muted: "#9AA59C", accent: "brand.secondary" }),
        text("foot", "Footer", "{{org_name | upper}}", M, H - 90, W - 2 * M, 18, { font: "mono", color: "#FFFFFF", opacity: 0.5, letterSpacing: 3 }),
      ],
    };
  }

  const page = PAGE_PRESETS.screen_landscape.page;
  const W = 1920;
  const H = 1080;

  if (kind === "screen_light") {
    const M = 100;
    const band = 300;
    const top = band + 130;
    const width = W - 2 * M;
    const size = 36;
    // The hairline sits in the gap between the two columns the layer lays out.
    const colWidth = (width - size * 1.5) / 2;
    return {
      page,
      canvas: screenCanvas(W, H, "#F7F7F4"),
      layers: [
        shape("band", "Header band", 0, 0, W, band, { fill: "brand.primary" }),
        image("logo", "Client logo", "org_logo", M, 60, 240, 90, { align: "left" }),
        text("when", "Date", AGENDA_WHEN, W - M - 900, 74, 900, 26, { font: "mono", weight: 700, color: "#FFFFFF", align: "right", letterSpacing: 2 }),
        text("venue", "Venue", "{{venue}}", W - M - 900, 116, 900, 26, { color: "#FFFFFF", opacity: 0.8, align: "right" }),
        text("title", "Event name", "{{event_name}}", M, 180, width, 76, { weight: 700, color: "#FFFFFF" }),
        shape("accent", "Accent strip", 0, band, W, 10, { fill: "brand.secondary" }),
        text("kicker", "Kicker", "PROGRAMME", M, band + 64, 600, 22, { ...AGENDA_KICKER, color: "brand.primary" }),
        agenda("agenda", M, top, width, H - top - 110, { size, columns: 2, rowGap: 30, accent: "brand.primary" }),
        shape("divider", "Column divider", M + colWidth + (size * 1.5) / 2 - 1, top, 2, H - top - 130, { fill: "#DCDDD6" }),
        text("foot", "Footer", "{{org_name | upper}}", M, H - 64, 900, 18, { font: "mono", color: "#8C918C", letterSpacing: 3 }),
        text("note", "Footnote", "Times may change on the day", W - M - 700, H - 64, 700, 18, { font: "mono", color: "#8C918C", align: "right" }),
      ],
    };
  }

  const M = 80;
  const panel = 660;
  const right = panel + 100;
  return {
    page,
    canvas: screenCanvas(W, H, "#0B140F"),
    layers: [
      shape("panel", "Brand panel", 0, 0, panel, H, { fill: "brand.primary" }),
      image("logo", "Client logo", "org_logo", M, 80, 260, 100, { align: "left" }),
      text("kicker", "Kicker", "TODAY’S PROGRAMME", M, 330, panel - 2 * M, 24, AGENDA_KICKER),
      text("title", "Event name", "{{event_name}}", M, 380, panel - 2 * M, 78, { weight: 700, color: "#FFFFFF", maxLines: 4 }),
      shape("accent", "Accent rule", M, 800, 96, 8, { fill: "brand.secondary" }),
      text("when", "Date", AGENDA_WHEN, M, 840, panel - 2 * M, 26, { font: "mono", weight: 700, color: "#FFFFFF", letterSpacing: 2 }),
      text("venue", "Venue", "{{venue}}", M, 888, panel - 2 * M, 30, { color: "#FFFFFF", opacity: 0.78, maxLines: 2 }),
      text("foot", "Footer", "{{org_name | upper}}", M, H - 80, panel - 2 * M, 18, { font: "mono", color: "#FFFFFF", opacity: 0.55, letterSpacing: 3 }),
      text("section", "Section label", "RUN OF SHOW", right, 96, 800, 20, { ...AGENDA_KICKER, color: "#6F7B72" }),
      shape("rule", "Header rule", right, 138, W - right - M, 2, { fill: "#1F2A23" }),
      agenda("agenda", right, 184, W - right - M, H - 184 - 100, { size: 44, rowGap: 36, color: "#F2F5F1", muted: "#9AA59C", accent: "brand.secondary" }),
    ],
  };
};
