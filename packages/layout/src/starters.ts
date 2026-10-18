import {
  type AgendaLayer,
  canvasForPage,
  type ImageLayer,
  minQrSize,
  PAGE_PRESETS,
  type PageSpec,
  type QrLayer,
  type ShapeLayer,
  type TextLayer,
  type TicketCanvas,
  type TicketLayer,
} from "./ticket-layout";

/**
 * Complete designs to start from -- no template needed. Mirrors the
 * backend's starters layer for layer; the ids are stable names.
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

export const TICKET_STARTERS = {
  invitation: { label: "Invitation", note: "Warm stub and body — a colour, or a picture — a swoosh, the QR on a white tile" },
  classic: { label: "Classic", note: "Brand stripe, tinted stub, type pill" },
  minimal: { label: "Minimal", note: "Hairline frame, nothing else" },
  stub: { label: "Stub", note: "Dark ticket with a tear-off stub" },
} as const;
export type TicketStarter = keyof typeof TICKET_STARTERS;

export const CERTIFICATE_STARTERS = {
  classic: { label: "Classic", note: "Centred, serif title, brand rule" },
  modern: { label: "Modern", note: "Left-aligned, colour panel, big name" },
} as const;
export type CertificateStarter = keyof typeof CERTIFICATE_STARTERS;

export type StarterLayout = { canvas: TicketCanvas; layers: TicketLayer[]; page: PageSpec };

export const ticketStarter = (kind: TicketStarter, opts: { seats: boolean } = { seats: false }): StarterLayout => {
  const W = 1560;
  const H = 690;
  const page = PAGE_PRESETS.ticket.page;
  const canvas = (background: string): TicketCanvas => ({ width: W, height: H, background, templateKey: null, templatePreprinted: false, area: null });
  const guest = text("guest", "Guest name", opts.seats ? "{{seat}}" : "{{attendee_name}}", 72, 288, 780, 45, { weight: 500 });
  if (kind === "invitation") {
    const ORANGE = "#C07736", YELLOW = "#F7D348", MAROON = "#3D0806", CREAM = "#FBEFE2";
    const STUB = 390, BODY = STUB + 5, BODY_W = W - BODY, L = 445;
    return {
      page,
      canvas: canvas("#FFFFFF"),
      layers: [
        shape("stub", "Stub colour", 0, 0, STUB, H, { fill: ORANGE, radius: 38 }),
        image("stub-photo", "Stub photo", "upload", 0, 0, STUB, H, { fit: "cover", radius: 38, hidden: true }),
        shape("chevron", "Stub chevron", 0, 0, STUB, H, { fill: YELLOW, path: "M 0 441 L 524 771 L 1000 332 L 1000 474 L 517 905 L 0 593 Z" }),
        shape("title-box", "Title box", 31, 31, 325, 154, { fill: MAROON, radius: 14 }),
        text("event", "Event name", "{{event_name}}", 56, 50, 280, 52, { weight: 600, color: "#FFFFFF", maxLines: 2, lineSpacing: -8 }),
        shape("qr-tile", "QR tile", 37, 326, 314, 312, { fill: "#FFFFFF", radius: 22 }),
        qr(59, 347, 270),
        text("admit", "Admit one", "ADMIT ONE", 37, 652, 314, 20, { font: "mono", weight: 700, color: CREAM, align: "center", letterSpacing: 6, opacity: 0.8 }),
        shape("body", "Body colour", BODY, 0, BODY_W, H, { fill: ORANGE, radius: 38 }),
        image("body-photo", "Body photo", "upload", BODY, 0, BODY_W, H, { fit: "cover", radius: 38, hidden: true }),
        shape("scrim", "Photo scrim", BODY, 0, BODY_W, H, { fill: "#141614", opacity: 0.45, radius: 38, hidden: true }),
        shape("hairline", "Hairline frame", BODY + 20, 20, BODY_W - 40, H - 40, { fill: null, stroke: CREAM, strokeWidth: 2, radius: 28, opacity: 0.3 }),
        shape("swoosh", "Swoosh", 1098, 0, 462, 214, { fill: YELLOW, path: "M 0 0 L 162 0 C 162 287 165 478 206 605 C 236 688 280 713 324 688 L 1000 369 L 472 860 C 324 968 206 1000 133 955 C 59 904 24 764 12 573 C 3 382 0 191 0 0 Z" }),
        image("logo", "Club logo", "org_logo", 1300, 44, 190, 44, { align: "right", opacity: 0.9 }),
        shape("type-pill", "Ticket type pill", L, 58, 218, 54, { fill: null, stroke: CREAM, strokeWidth: 2, radius: 27, opacity: 0.6 }),
        text("type", "Ticket type", "{{ticket_type | upper}}", L, 74, 218, 22, { font: "mono", weight: 700, color: CREAM, align: "center", letterSpacing: 4, opacity: 0.9 }),
        text("guest-label", "Guest label", opts.seats ? "SEAT" : "DELEGATE", L, 356, 420, 20, { font: "mono", weight: 700, color: CREAM, letterSpacing: 6, opacity: 0.7 }),
        opts.seats ? text("guest", "Seat", "{{seat}}", L, 392, 900, 60, { font: "bebas", color: CREAM }) : text("guest", "Guest name", "{{attendee_name}}", L, 392, 900, 54, { weight: 600, color: CREAM }),
        text("when", "Date & venue", "{{event_date | upper}} · {{event_time}}{% if venue %} · {{venue | upper}}{% endif %}", L, 474, 900, 24, { font: "mono", color: CREAM, letterSpacing: 1, opacity: 0.8 }),
        text("code-label", "Ticket code label", "TICKET CODE", L, 548, 420, 18, { font: "mono", weight: 700, color: CREAM, letterSpacing: 6, opacity: 0.7 }),
        text("code", "Ticket code", "{{ticket_code}}", L, 576, 700, 34, { font: "mono", weight: 700, color: CREAM }),
      ],
    };
  }
  if (kind === "stub") {
    return {
      page,
      canvas: canvas("#141614"),
      layers: [
        shape("stub", "Stub panel", 1110, 0, 450, H, { fill: "brand.primary" }),
        shape("perforation", "Perforation", 1108, 30, 4, H - 60, { fill: "#FFFFFF", opacity: 0.35 }),
        text("client", "Club", "{{org_name | upper}}", 72, 60, 900, 27, { font: "mono", weight: 700, color: "brand.secondary", letterSpacing: 3 }),
        text("event", "Event name", "{{event_name}}", 72, 112, 960, 66, { weight: 700, color: "#FFFFFF", maxLines: 2 }),
        { ...guest, y: 330, color: "#FFFFFF" },
        text("when", "Date & time", "{{event_day}} · {{event_date}} · {{event_time}}{% if event_end_time %}–{{event_end_time}}{% endif %}", 72, 420, 960, 30, { color: "#C9CCC9" }),
        text("venue", "Venue", "{{venue}}", 72, 466, 960, 30, { color: "#C9CCC9" }),
        shape("type-pill", "Ticket type pill", 72, 556, 252, 60, { fill: "ticket_type", radius: 30 }),
        text("type", "Ticket type", "{{ticket_type | upper}}", 84, 568, 228, 36, { font: "bebas", color: "#FFFFFF", align: "center", letterSpacing: 2 }),
        qr(1185, 120, 300),
        text("code", "Ticket code", "{{ticket_code}}", 1140, 456, 390, 27, { font: "mono", color: "#FFFFFF", align: "center" }),
      ],
    };
  }
  if (kind === "minimal") {
    return {
      page,
      canvas: canvas("#FFFFFF"),
      layers: [
        shape("frame", "Frame", 12, 12, W - 24, H - 24, { fill: null, stroke: "#E1E1DC", strokeWidth: 3, radius: 24 }),
        text("client", "Club", "{{org_name | upper}}", 72, 54, 900, 27, { font: "mono", weight: 700, color: "#8C918C", letterSpacing: 2 }),
        text("event", "Event name", "{{event_name}}", 72, 110, 1000, 57, { weight: 700, maxLines: 2 }),
        guest,
        text("venue", "Venue", "{{venue}}", 72, 384, 780, 30, { color: "#5A5F5B" }),
        text("when", "Date & time", "{{event_date | upper}} · {{event_time}}", 72, 468, 600, 30, { font: "mono", color: "#5A5F5B" }),
        text("type", "Ticket type", "{{ticket_type}}", 72, 540, 600, 36, { weight: 600, color: "ticket_type" }),
        text("code", "Ticket code", "{{ticket_code}}", 72, 600, 600, 27, { font: "mono", color: "#8C918C" }),
        qr(1164, 150, 330),
      ],
    };
  }
  return {
    page,
    canvas: canvas("#FFFFFF"),
    layers: [
      shape("stripe", "Brand stripe", 0, 0, 21, H, { fill: "brand.primary" }),
      shape("stub", "Stub tint", 1110, 0, 450, H, { fill: "brand.primary", opacity: 0.08 }),
      shape("band", "Stub band", 1110, H - 15, 450, 15, { fill: "brand.secondary" }),
      shape("divider", "Divider", 1109, 36, 3, H - 72, { fill: "#E1E1DC" }),
      text("client", "Club", "{{org_name | upper}}", 72, 54, 900, 27, { font: "mono", weight: 700, color: "brand.primary", letterSpacing: 1 }),
      text("event", "Event name", "{{event_name}}", 72, 108, 960, 57, { weight: 700, maxLines: 2 }),
      guest,
      text("venue", "Venue", "{{venue}}", 72, 384, 780, 30, { color: "#5A5F5B" }),
      shape("type-pill", "Ticket type pill", 72, 468, 252, 60, { fill: "ticket_type", radius: 30 }),
      text("type", "Ticket type", "{{ticket_type | upper}}", 84, 484, 228, 27, { font: "mono", weight: 700, color: "#FFFFFF", align: "center" }),
      text("when", "Date & time", "{{event_date | upper}} · {{event_time}}", 354, 484, 600, 30, { font: "mono", color: "#5A5F5B" }),
      text("code", "Ticket code", "{{ticket_code}}", 72, 576, 600, 30, { font: "mono", color: "#5A5F5B" }),
      qr(1164, 168, 324),
    ],
  };
};

/** A complete certificate, A4 landscape at 150 dpi (1754 × 1240 px). */
export const certificateStarter = (kind: CertificateStarter = "classic"): StarterLayout => {
  const page = PAGE_PRESETS.a4_landscape.page;
  const { width: W, height: H } = canvasForPage(page, 150);
  const canvas: TicketCanvas = { width: W, height: H, background: "#FFFFFF", templateKey: null, templatePreprinted: false, area: null };
  const body = "attended {{event_name}} on {{event_date}}{% if venue %} at {{venue}}{% endif %}.";
  if (kind === "modern") {
    return {
      page,
      canvas,
      layers: [
        shape("panel", "Colour panel", 0, 0, 420, H, { fill: "brand.primary" }),
        image("logo", "Club logo", "org_logo", 60, 60, 300, 120),
        text("kind", "Kind of certificate", "CERTIFICATE OF ATTENDANCE", 520, 200, W - 620, 26, { font: "mono", weight: 700, color: "brand.secondary", letterSpacing: 4 }),
        text("lead", "Lead line", "This is to certify that", 520, 300, W - 620, 30, { color: "#5A5F5B" }),
        text("guest", "Guest name", "{{attendee_name}}", 520, 360, W - 620, 110, { font: "dm_serif", maxLines: 2, fit: "shrink" }),
        text("body", "Body", body, 520, 620, W - 620, 34, { maxLines: 3, lineSpacing: 6, color: "#141614" }),
        text("org", "Organiser", "{{org_name}}", 520, 900, 600, 30, { weight: 600 }),
        text("date", "Issued", "Issued {{issued_date}}", 520, 945, 600, 24, { color: "#5A5F5B" }),
        text("no", "Certificate number", "{{certificate_no}}", 520, H - 110, 700, 22, { font: "mono", color: "#8C918C" }),
        qr(W - 60 - 200, H - 60 - 200, 200),
      ],
    };
  }
  return {
    page,
    canvas,
    layers: [
      shape("frame", "Frame", 60, 60, W - 120, H - 120, { fill: null, stroke: "brand.primary", strokeWidth: 4 }),
      shape("inner", "Inner rule", 84, 84, W - 168, H - 168, { fill: null, stroke: "brand.secondary", strokeWidth: 1.5 }),
      image("logo", "Club logo", "org_logo", (W - 260) / 2, 130, 260, 100),
      text("kind", "Kind of certificate", "CERTIFICATE OF ATTENDANCE", 200, 270, W - 400, 26, { font: "mono", weight: 700, color: "brand.secondary", letterSpacing: 6, align: "center" }),
      text("lead", "Lead line", "This is to certify that", 200, 360, W - 400, 30, { color: "#5A5F5B", align: "center" }),
      text("guest", "Guest name", "{{attendee_name}}", 160, 420, W - 320, 120, { font: "dm_serif", align: "center", maxLines: 2, fit: "shrink" }),
      shape("rule", "Name rule", 460, 700, W - 920, 3, { fill: "brand.primary" }),
      text("body", "Body", body, 260, 740, W - 520, 34, { align: "center", maxLines: 3, lineSpacing: 6 }),
      text("org", "Organiser", "{{org_name}}", 200, 960, 600, 30, { weight: 600 }),
      text("date", "Issued", "Issued {{issued_date}}", 200, 1005, 600, 24, { color: "#5A5F5B" }),
      text("no", "Certificate number", "{{certificate_no}}", W - 330 - 500, 1005, 500, 22, { font: "mono", color: "#8C918C", align: "right" }),
      qr(W - 120 - 170, H - 120 - 170 - 40, 170),
    ],
  };
};

// ─── ID cards ───────────────────────────────────────────────────────────

export const BADGE_STARTERS = {
  classic: { label: "Conference", note: "Brand head, photo in a ring, first name large, type band with the QR" },
  lanyard: { label: "Bold", note: "Full colour, a first name you read across the room" },
  minimal: { label: "Editorial", note: "White, serif name, hairline rules, type colour at the top edge" },
  simple: { label: "Simple", note: "A name, a QR and the event — nothing else. The one to reach for when the card has to be read across a room." },
  insert: { label: "Badge insert", note: "Full colour on paper or card: brand head, the name large, a QR, type band in the role's colour. Drawn for the size above, upright or across." },
  label_4x3: { label: "Label · 4 × 3 in", note: "Black only, for a thermal label printer: name across the badge, QR, type band. Colour comes from the roll." },
  label_4x6: { label: "Label · 4 × 6 in", note: "Black only, for a lanyard label: name, a QR you can read from a scanner at arm's length, type band." },
  label_brother: { label: "Label · Brother roll", note: "Black only, for a Brother QL: name stacked, a QR, type band. Drawn for the roll the size above is set to." },
} as const;
export type BadgeStarter = keyof typeof BADGE_STARTERS;

/** What a paper printer cannot reach at the head and foot of a page, in mm. */
export const PAPER_UNPRINTABLE_MM = 5;

const BROTHER_PAGES: Record<number, PageSpec> = {
  29: PAGE_PRESETS.label_29x90.page,
  38: PAGE_PRESETS.label_38x90.page,
  50: PAGE_PRESETS.label_50x90.page,
  54: PAGE_PRESETS.label_54x90.page,
  62: PAGE_PRESETS.label_62x90.page,
};
const INSERT_PAGES: PageSpec[] = [
  PAGE_PRESETS.badge_87x130.page,
  PAGE_PRESETS.badge_89x137.page,
  PAGE_PRESETS.badge_130x87.page,
  PAGE_PRESETS.cr80_portrait.page,
  PAGE_PRESETS.cr80_landscape.page,
  PAGE_PRESETS.a6_portrait.page,
];
const samePage = (a: PageSpec, b?: PageSpec | null) => !!b && Math.abs(a.widthMm - b.widthMm) < 0.05 && (a.heightMm ?? -1) === (b.heightMm ?? -1);

/** The page a starter is drawn for: cards on a CR80, labels on their label, the insert and simple ones on whatever badge page the designer is set to. */
export const badgeStarterPage = (kind: BadgeStarter, current?: PageSpec | null): PageSpec =>
  kind === "insert" || kind === "simple"
    ? (INSERT_PAGES.find((p) => samePage(p, current)) ?? PAGE_PRESETS.badge_87x130.page)
    : kind === "label_4x3"
      ? PAGE_PRESETS.label_4x3.page
      : kind === "label_4x6"
        ? PAGE_PRESETS.lanyard_4x6.page
        : kind === "label_brother"
          ? (BROTHER_PAGES[current?.heightMm === 90 ? Math.trunc(current.widthMm ?? 0) : 0] ?? PAGE_PRESETS.label_62x90.page)
          : PAGE_PRESETS.cr80_portrait.page;

/** A complete ID card to start from. Pixel for pixel the Python starter. */
export const badgeStarter = (kind: BadgeStarter, opts: { seats: boolean; page?: PageSpec | null } = { seats: false }): StarterLayout => {
  const page = badgeStarterPage(kind, opts.page);
  const { width: W, height: H } = canvasForPage(page);
  const canvas: TicketCanvas = { width: W, height: H, background: "#FFFFFF", templateKey: null, templatePreprinted: false, area: null };
  const M = 44;
  const first = opts.seats ? "{{seat}}" : "{{first_name}}";
  const last = "{{last_name}}";
  const org = "{% if organization %}{{organization}}{% endif %}";
  const INK = "#141614";
  const seats = opts.seats;

  if (kind === "label_4x3") {
    const L = 60;
    const qrSize = 280;
    const qrX = W - L - qrSize;
    const nameW = qrX - 40 - L;
    const bandY = 740;
    return {
      page,
      canvas,
      layers: [
        image("logo", "Club logo", "org_logo", L, L, 240, 84, { align: "left" }),
        text("event", "Event name", "{{event_name | upper}}", L + 280, L + 6, W - 2 * L - 280, 24, { font: "mono", weight: 700, color: INK, align: "right", letterSpacing: 2, maxLines: 2 }),
        text("when", "Date", "{{event_date | upper}}{% if venue %} · {{venue | upper}}{% endif %}", L + 280, L + 74, W - 2 * L - 280, 18, { font: "mono", color: INK, align: "right", letterSpacing: 1 }),
        shape("rule", "Rule", L, 168, W - 2 * L, 4, { fill: INK }),
        seats ? text("first", "Seat", first, L, 200, nameW, 200, { font: "bebas", color: INK }) : text("first", "First name", "{{first_name | upper}}", L, 200, nameW, 190, { font: "bebas", color: INK }),
        text("last", "Last name", "{{last_name | upper}}", L, 410, nameW, 72, { weight: 700, color: INK, hidden: seats }),
        text("org", "Organization", org, L, 506, nameW, 36, { color: INK }),
        qr(qrX, 200, qrSize),
        text("code-label", "Ticket code label", "TICKET CODE", qrX, 500, qrSize, 16, { font: "mono", weight: 700, color: INK, align: "center", letterSpacing: 3 }),
        text("code", "Ticket code", "{{ticket_code}}", qrX, 528, qrSize, 28, { font: "mono", weight: 700, color: INK, align: "center" }),
        shape("band", "Type band", 0, bandY, W, H - bandY, { fill: INK }),
        text("type", "Ticket type", "{{ticket_type | upper}}", L, bandY + 30, 720, 96, { font: "bebas", color: "#FFFFFF", letterSpacing: 2 }),
        text("client", "Club", "{{org_name | upper}}", W - L - 400, bandY + 66, 400, 24, { font: "mono", color: "#FFFFFF", align: "right", letterSpacing: 2 }),
      ],
    };
  }

  if (kind === "label_4x6") {
    const L = 60;
    const qrSize = 420;
    const bandY = 1480;
    return {
      page,
      canvas,
      layers: [
        image("logo", "Club logo", "org_logo", L, L, 260, 90, { align: "left" }),
        text("event", "Event name", "{{event_name | upper}}", L + 300, L + 8, W - 2 * L - 300, 26, { font: "mono", weight: 700, color: INK, align: "right", letterSpacing: 2, maxLines: 2 }),
        text("when", "Date", "{{event_date | upper}}{% if venue %} · {{venue | upper}}{% endif %}", L + 300, L + 80, W - 2 * L - 300, 18, { font: "mono", color: INK, align: "right", letterSpacing: 1 }),
        shape("rule", "Rule", L, 180, W - 2 * L, 4, { fill: INK }),
        seats ? text("first", "Seat", first, L, 230, W - 2 * L, 240, { font: "bebas", color: INK, align: "center" }) : text("first", "First name", "{{first_name | upper}}", L, 230, W - 2 * L, 230, { font: "bebas", color: INK, align: "center" }),
        text("last", "Last name", "{{last_name | upper}}", L, 490, W - 2 * L, 84, { weight: 700, color: INK, align: "center", hidden: seats }),
        text("org", "Organization", org, L, 610, W - 2 * L, 40, { color: INK, align: "center" }),
        qr((W - qrSize) / 2, 740, qrSize),
        text("code-label", "Ticket code label", "TICKET CODE", L, 1200, W - 2 * L, 18, { font: "mono", weight: 700, color: INK, align: "center", letterSpacing: 4 }),
        text("code", "Ticket code", "{{ticket_code}}", L, 1232, W - 2 * L, 40, { font: "mono", weight: 700, color: INK, align: "center" }),
        shape("band", "Type band", 0, bandY, W, H - bandY, { fill: INK }),
        text("type", "Ticket type", "{{ticket_type | upper}}", L, bandY + 44, W - 2 * L, 150, { font: "bebas", color: "#FFFFFF", align: "center", letterSpacing: 3 }),
        text("client", "Club", "{{org_name | upper}}", L, bandY + 236, W - 2 * L, 26, { font: "mono", color: "#FFFFFF", align: "center", letterSpacing: 3 }),
      ],
    };
  }

  if (kind === "insert" || kind === "simple") {
    const across = W > H;
    const px = (share: number, min = 1) => Math.max(min, Math.round(W * share));
    const py = (share: number, min = 1) => Math.max(min, Math.round(H * share));
    const footSafe = page.heightMm ? Math.max(1, Math.ceil((PAPER_UNPRINTABLE_MM / page.heightMm) * H)) : py(0.02);
    const footStack = (typeSize: number, clientSize: number, wanted: number) => {
      const client = H - footSafe - Math.ceil(clientSize * 1.2);
      const type = client - Math.ceil(typeSize * 1.2);
      return { type, client, bandY: Math.min(wanted, type - py(0.02)) };
    };
    const L = Math.max(26, px(across ? 0.05 : 0.07));
    if (kind === "simple") {
      const cw = W - 2 * L;
      const qrSize = Math.max(minQrSize(canvas, page), Math.round(Math.min(cw, H * 0.34)));
      const typeSize = px(0.072, 20);
      const foot = footStack(typeSize, 1, py(0.86));
      return {
        page,
        canvas,
        layers: [
          text("event", "Event name", "{{event_name | upper}}", L, py(0.06), cw, px(0.03, 13), { font: "mono", weight: 700, color: "#5A5F5B", letterSpacing: 3, align: "center", maxLines: 2 }),
          text("first", seats ? "Seat" : "First name", seats ? "{{seat}}" : "{{first_name | upper}}", L, py(0.16), cw, px(0.155, 40), { font: "bebas", color: INK, align: "center", maxLines: 2 }),
          text("last", "Last name", "{{last_name | upper}}", L, py(0.34), cw, px(0.062, 18), { weight: 700, color: INK, align: "center", hidden: seats, maxLines: 2 }),
          text("org", "Organization", org, L, py(0.42), cw, px(0.04, 14), { color: "#5A5F5B", align: "center", maxLines: 2 }),
          qr(Math.round((W - qrSize) / 2), py(0.5), qrSize),
          shape("band", "Type band", 0, foot.bandY, W, H - foot.bandY, { fill: "ticket_type" }),
          text("type", "Ticket type", "{{ticket_type | upper}}", L, foot.type, cw, typeSize, { font: "bebas", color: "#FFFFFF", align: "center", letterSpacing: 2 }),
        ],
      };
    }
    if (!across) {
      const cw = W - 2 * L;
      const qrSize = px(0.292, minQrSize(canvas, page));
      const col = L + qrSize + px(0.035, 14);
      const colW = W - L - col;
      const typeSize = px(0.107, 26);
      const clientSize = px(0.021, 10);
      const foot = footStack(typeSize, clientSize, py(0.84));
      const bandY = foot.bandY;
      return {
        page,
        canvas,
        layers: [
          shape("head", "Brand head", 0, 0, W, py(0.011, 3), { fill: "brand.primary" }),
          image("logo", "Club logo", "org_logo", L, py(0.055), px(0.292), py(0.062, 26), { align: "left" }),
          text("event", "Event name", "{{event_name | upper}}", L, py(0.133), cw, px(0.027, 13), { font: "mono", weight: 700, color: INK, letterSpacing: 2, maxLines: 2 }),
          text("when", "Date", "{{event_date | upper}}{% if venue %} · {{venue | upper}}{% endif %}", L, py(0.162), cw, px(0.0195, 11), { font: "mono", color: INK, letterSpacing: 1, maxLines: 2 }),
          shape("rule", "Rule", L, py(0.215), cw, Math.max(2, py(0.0026)), { fill: "brand.primary" }),
          seats ? text("first", "Seat", first, L, py(0.248), cw, px(0.195, 40), { font: "bebas", color: INK }) : text("first", "First name", "{{first_name | upper}}", L, py(0.248), cw, px(0.195, 40), { font: "bebas", color: INK, maxLines: 2 }),
          text("last", "Last name", "{{last_name | upper}}", L, py(0.395), cw, px(0.076, 20), { weight: 700, color: INK, hidden: seats, maxLines: 2 }),
          text("org", "Organization", org, L, py(0.46), cw, px(0.039, 14), { color: INK, maxLines: 2 }),
          qr(L, py(0.541), qrSize),
          text("code-label", "Ticket code label", "TICKET CODE", col, py(0.559), colW, px(0.0175, 10), { font: "mono", weight: 700, color: INK, letterSpacing: 2 }),
          text("code", "Ticket code", "{{ticket_code}}", col, py(0.581), colW, px(0.029, 13), { font: "mono", weight: 700, color: INK, maxLines: 2 }),
          shape("band", "Type band", 0, bandY, W, H - bandY, { fill: "ticket_type" }),
          text("type", "Ticket type", "{{ticket_type | upper}}", L, foot.type, cw, typeSize, { font: "bebas", color: "#FFFFFF", letterSpacing: 2 }),
          text("client", "Club", "{{org_name | upper}}", L, foot.client, cw, clientSize, { font: "mono", color: "#FFFFFF", letterSpacing: 2 }),
        ],
      };
    }
    const typeSize = px(0.06, 20);
    const clientSize = px(0.014, 9);
    const foot = footStack(typeSize, clientSize, py(0.83));
    const bandY = foot.bandY;
    const qrSize = Math.max(minQrSize(canvas, page), py(0.4));
    const qrX = W - L - qrSize;
    const nameW = qrX - L - px(0.03, 12);
    return {
      page,
      canvas,
      layers: [
        shape("head", "Brand head", 0, 0, W, py(0.017, 3), { fill: "brand.primary" }),
        image("logo", "Club logo", "org_logo", L, py(0.075), px(0.19), py(0.1, 26), { align: "left" }),
        text("event", "Event name", "{{event_name | upper}}", L + px(0.22), py(0.085), W - L - px(0.22) - L, px(0.021, 12), { font: "mono", weight: 700, color: INK, letterSpacing: 2, maxLines: 2 }),
        text("when", "Date", "{{event_date | upper}}{% if venue %} · {{venue | upper}}{% endif %}", L + px(0.22), py(0.145), W - L - px(0.22) - L, px(0.0155, 10), { font: "mono", color: INK, letterSpacing: 1, maxLines: 2 }),
        shape("rule", "Rule", L, py(0.3), W - 2 * L, Math.max(2, py(0.004)), { fill: "brand.primary" }),
        seats ? text("first", "Seat", first, L, py(0.35), nameW, px(0.1, 34), { font: "bebas", color: INK }) : text("first", "First name", "{{first_name | upper}}", L, py(0.35), nameW, px(0.1, 34), { font: "bebas", color: INK, maxLines: 2 }),
        text("last", "Last name", "{{last_name | upper}}", L, py(0.55), nameW, px(0.042, 16), { weight: 700, color: INK, hidden: seats, maxLines: 2 }),
        text("org", "Organization", org, L, py(0.65), nameW, px(0.024, 12), { color: INK, maxLines: 2 }),
        qr(qrX, py(0.32), qrSize),
        text("code-label", "Ticket code label", "TICKET CODE", qrX, py(0.32) + qrSize + py(0.02), qrSize, px(0.013, 9), { font: "mono", weight: 700, color: INK, letterSpacing: 2, align: "center" }),
        text("code", "Ticket code", "{{ticket_code}}", qrX, py(0.32) + qrSize + py(0.055), qrSize, px(0.02, 11), { font: "mono", weight: 700, color: INK, align: "center", maxLines: 2 }),
        shape("band", "Type band", 0, bandY, W, H - bandY, { fill: "ticket_type" }),
        text("type", "Ticket type", "{{ticket_type | upper}}", L, foot.type, nameW, typeSize, { font: "bebas", color: "#FFFFFF", letterSpacing: 2 }),
        text("client", "Club", "{{org_name | upper}}", L, foot.client, nameW, clientSize, { font: "mono", color: "#FFFFFF", letterSpacing: 2 }),
      ],
    };
  }

  if (kind === "label_brother") {
    const k = W / 732;
    const px = (n: number, min = 1) => Math.max(min, Math.round(n * k));
    const L = Math.max(26, px(60));
    const cw = W - 2 * L;
    const qrSize = Math.min(260, Math.max(minQrSize(canvas, page), Math.round(cw * 0.62)));
    const beside = cw - qrSize - px(24) >= 190;
    const bandY = 900;
    const head = [
      image("logo", "Club logo", "org_logo", L, L, Math.min(cw, px(220)), px(70, 30), { align: "left" }),
      text("event", "Event name", "{{event_name | upper}}", L, L + px(90, 44), cw, px(20, 13), { font: "mono", weight: 700, color: INK, letterSpacing: 2, maxLines: 2 }),
      shape("rule", "Rule", L, 210, cw, 4, { fill: INK }),
    ];
    const foot = [
      shape("band", "Type band", 0, bandY, W, H - bandY, { fill: INK }),
      text("type", "Ticket type", "{{ticket_type | upper}}", L, bandY + 30, cw, px(80, 40), { font: "bebas", color: "#FFFFFF", letterSpacing: 2 }),
      text("client", "Club", "{{org_name | upper}}", L, bandY + 120, cw, px(18, 12), { font: "mono", color: "#FFFFFF", letterSpacing: 2 }),
    ];
    const name = (y: number, size: number, lastSize: number, orgSize: number) => [
      seats ? text("first", "Seat", first, L, y, cw, size, { font: "bebas", color: INK }) : text("first", "First name", "{{first_name | upper}}", L, y, cw, size, { font: "bebas", color: INK, maxLines: 2 }),
      text("last", "Last name", "{{last_name | upper}}", L, y + Math.round(size * 1.14), cw, lastSize, { weight: 700, color: INK, hidden: seats, maxLines: 2 }),
      text("org", "Organization", org, L, y + Math.round(size * 1.64), cw, orgSize, { color: INK, maxLines: 2 }),
    ];
    if (beside) {
      const col = L + qrSize + px(24, 14);
      const colW = W - L - col;
      return {
        page,
        canvas,
        layers: [
          ...head,
          ...name(240, px(140, 54), px(54, 26), px(30, 16)),
          qr(L, 560, qrSize),
          text("code-label", "Ticket code label", "TICKET CODE", col, 580, colW, px(14, 11), { font: "mono", weight: 700, color: INK, letterSpacing: 2 }),
          text("code", "Ticket code", "{{ticket_code}}", col, 606, colW, px(22, 14), { font: "mono", weight: 700, color: INK, maxLines: 2 }),
          text("when", "Date", "{{event_date | upper}}", col, 700, colW, px(16, 12), { font: "mono", color: INK, letterSpacing: 1, maxLines: 2 }),
          ...foot,
        ],
      };
    }
    const qrX = Math.round((W - qrSize) / 2);
    const qrY = 560 - Math.round(qrSize * 0.12);
    return {
      page,
      canvas,
      layers: [
        ...head,
        ...name(238, px(150, 46), px(60, 22), px(34, 15)),
        qr(qrX, qrY, qrSize),
        text("code-label", "Ticket code label", "TICKET CODE", L, qrY + qrSize + 16, cw, px(14, 10), { font: "mono", weight: 700, color: INK, letterSpacing: 2, align: "center" }),
        text("code", "Ticket code", "{{ticket_code}}", L, qrY + qrSize + 40, cw, px(22, 14), { font: "mono", weight: 700, color: INK, align: "center", maxLines: 2 }),
        ...foot,
      ],
    };
  }

  if (kind === "lanyard") {
    const panelY = 640;
    const panelH = 335;
    const qrSize = 190;
    const qrY = panelY + (panelH - qrSize) / 2;
    return {
      page,
      canvas,
      layers: [
        shape("background", "Card colour", 0, 0, W, H, { fill: "brand.primary" }),
        image("logo", "Club logo", "org_logo", M, 40, 170, 70, { align: "left" }),
        text("event", "Event name", "{{event_name | upper}}", M, 128, W - 2 * M, 24, { font: "mono", weight: 700, color: "brand.secondary", letterSpacing: 3, maxLines: 2 }),
        text("first", "First name", seats ? first : "{{first_name | upper}}", M, 222, W - 2 * M, 190, { font: "bebas", color: "#FFFFFF" }),
        text("last", "Last name", "{{last_name | upper}}", M, 440, W - 2 * M, 84, { font: "bebas", color: "brand.secondary", hidden: seats }),
        text("org", "Organization", org, M, 548, W - 2 * M, 28, { color: "#FFFFFF", opacity: 0.82 }),
        shape("panel", "White panel", 24, panelY, W - 48, panelH, { fill: "#FFFFFF", radius: 28 }),
        shape("pill", "Type pill", 56, qrY + 6, 260, 60, { fill: "ticket_type", radius: 30 }),
        text("type", "Ticket type", "{{ticket_type | upper}}", 64, qrY + 20, 244, 26, { font: "mono", weight: 700, color: "#FFFFFF", align: "center", letterSpacing: 2 }),
        text("code-label", "Ticket code label", "TICKET CODE", 56, qrY + 100, 260, 16, { font: "mono", weight: 700, color: "#8C918C", letterSpacing: 3 }),
        text("code", "Ticket code", "{{ticket_code}}", 56, qrY + 124, 260, 26, { font: "mono", weight: 700, color: "#141614" }),
        text("when", "Date", "{{event_date | upper}}", 56, qrY + 166, 260, 20, { font: "mono", color: "#5A5F5B", letterSpacing: 1 }),
        qr(W - 24 - 32 - qrSize, qrY, qrSize),
        shape("strip", "Type strip", 0, H - 22, W, 22, { fill: "ticket_type" }),
      ],
    };
  }

  if (kind === "minimal") {
    return {
      page,
      canvas,
      layers: [
        shape("bar", "Type bar", 0, 0, W, 26, { fill: "ticket_type" }),
        text("event", "Event name", "{{event_name | upper}}", M, 104, W - 2 * M, 22, { font: "mono", weight: 700, letterSpacing: 3, maxLines: 2 }),
        text("when", "Date", "{{event_date | upper}}{% if venue %} · {{venue | upper}}{% endif %}", M, 146, W - 2 * M, 18, { font: "mono", color: "#8C918C", letterSpacing: 1 }),
        shape("rule-top", "Top rule", M, 204, W - 2 * M, 2, { fill: "#141614" }),
        text("first", "First name", first, M, 286, W - 2 * M, 104, { font: "dm_serif" }),
        text("last", "Last name", last, M, 402, W - 2 * M, 104, { font: "dm_serif", color: "#5A5F5B", hidden: seats }),
        text("org", "Organization", org, M, 556, W - 2 * M, 28, { color: "#5A5F5B" }),
        text("type", "Ticket type", "{{ticket_type | upper}}", M, 606, W - 2 * M, 26, { font: "mono", weight: 700, color: "ticket_type", letterSpacing: 3 }),
        shape("rule-bottom", "Bottom rule", M, 700, W - 2 * M, 2, { fill: "#E1E1DC" }),
        qr(M, 748, 190),
        text("code-label", "Ticket code label", "TICKET CODE", M + 218, 760, W - M - (M + 218), 16, { font: "mono", weight: 700, color: "#8C918C", letterSpacing: 3 }),
        text("code", "Ticket code", "{{ticket_code}}", M + 218, 786, W - M - (M + 218), 24, { font: "mono", weight: 700 }),
        image("logo", "Club logo", "org_logo", W - M - 160, 868, 160, 70, { align: "right" }),
      ],
    };
  }

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
