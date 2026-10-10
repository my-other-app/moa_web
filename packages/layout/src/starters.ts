import {
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
        text("code-label", "Invite code label", "INVITE CODE", L, 548, 420, 18, { font: "mono", weight: 700, color: CREAM, letterSpacing: 6, opacity: 0.7 }),
        text("code", "Invite code", "{{admission_no}}", L, 576, 700, 34, { font: "mono", weight: 700, color: CREAM }),
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
        text("code", "Admission number", "{{admission_no}}", 1140, 456, 390, 27, { font: "mono", color: "#FFFFFF", align: "center" }),
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
        text("code", "Admission number", "{{admission_no}}", 72, 600, 600, 27, { font: "mono", color: "#8C918C" }),
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
      text("code", "Admission number", "{{admission_no}}", 72, 576, 600, 30, { font: "mono", color: "#5A5F5B" }),
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
