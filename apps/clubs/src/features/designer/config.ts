import {
  AGENDA_STARTERS,
  agendaStarter,
  BADGE_STARTERS,
  badgeStarter,
  TOKEN_BY_KEY,
  sampleValues,
  type PagePreset,
  type PageSpec,
  type TicketCanvas,
  type TicketLayer,
  type TokenGroup,
} from "@moa/layout";

import type { DesignKind } from "./schemas";

/**
 * What differs between the two designers -- everything else is one editor.
 * The routes are the same shape for both, so the editor never needs to know
 * which it is drawing.
 */
export interface DesignerConfig {
  kind: DesignKind;
  /** The kind's name on the tab: "Ticket", "ID card". */
  label: string;
  /** The kind's name as a heading: "Ticket design". */
  title: string;
  /** What this thing is and how it is made, in a line under the page title. */
  description: string;
  /** The word for one of them: "ticket", "certificate". */
  noun: string;
  /** Whether a QR is compulsory -- it is what the gate scans on tickets. */
  qrRequired: boolean;
  /** Pages this kind is printed on; the first is the default. */
  pages: PagePreset[];
  /** Templates are exported at this resolution. */
  dpi: number;
  /**
   * Layered designs the canvas can start from. Tickets and certificates have
   * none now: the designer's templates replaced them, and a custom design
   * starts from a blank canvas. Badges keep the CR80 card; programmes keep theirs.
   */
  starters: Record<string, { label: string; note: string }>;
  starter: ((name: string, opts: { seats: boolean; page?: PageSpec | null }) => { canvas: TicketCanvas; layers: TicketLayer[]; page: PageSpec }) | null;
  /** Whether the kind has the gallery of ready designs (the designer's templates) before the canvas. */
  gallery: boolean;
  /** Token groups offered in the insert menu, in order. */
  tokenGroups: TokenGroup[];
  /** The guest-photo image source makes sense here. */
  guestPhoto: boolean;
  /** The message on the preview dialog. */
  previewNote: string;
  /** What a saved design changes, for the save toast. */
  savedNote: string;
  /** The Figma guide's title. */
  guideTitle: string;
  /** Sample QR content -- as long as the real thing, so the sample looks right. */
  sampleQr: string;
}

/** The sample ticket code, in the shape a ticket id is minted in (MOA-XXXXX-XXXXX). */
const SAMPLE_TICKET_CODE = TOKEN_BY_KEY.get("ticket_code")?.sample ?? "MOA-7K3QF-X9PLM";
/** A ticket's QR carries its ticket code, so the sample QR carries the sample code. */
const TICKET_QR = SAMPLE_TICKET_CODE;
const MINTED = /^MOA-[A-Z0-9]{5}-[A-Z0-9]{5}$/;

/**
 * What the canvas fills tokens with: the server's samples (made by the
 * renderer's own code) over the catalogue's, which fills any token the
 * server does not know -- a server from before {{ticket_code}} sends none.
 * The ticket code is the one exception: the server's is used only when it
 * has the shape a ticket id is minted in, so the sample under the QR never
 * reads as an id no guest will ever hold.
 */
export function designSamples(server: Record<string, string> = {}): Record<string, string> {
  const merged = { ...sampleValues(), ...server };
  if (!MINTED.test(merged.ticket_code ?? "")) merged.ticket_code = SAMPLE_TICKET_CODE;
  return merged;
}

export const DESIGNERS: Record<DesignKind, DesignerConfig> = {
  ticket: {
    kind: "ticket",
    label: "Ticket",
    title: "Ticket design",
    description: "The ticket each attendee receives. Pick a design, then move or change any part of it.",
    noun: "ticket",
    qrRequired: true,
    pages: ["ticket"],
    dpi: 300,
    starters: {},
    starter: null,
    gallery: true,
    tokenGroups: ["Guest", "Ticket", "Event", "Club"],
    guestPhoto: false,
    previewNote: "Rendered by the same code that issues tickets. The QR in a preview admits nobody.",
    savedNote: "Tickets opened from now on use it.",
    guideTitle: "Designing a ticket in Figma",
    sampleQr: TICKET_QR,
  },
  badge: {
    kind: "badge",
    label: "ID card",
    title: "ID card design",
    description: "The card printed at the door. Pick a 4 × 6 in design or the CR80 card for card printers, then move or change any part of it.",
    noun: "card",
    qrRequired: true,
    pages: ["cr80_portrait", "cr80_landscape", "badge_87x130", "badge_130x87", "a6_portrait", "label_4x3", "lanyard_4x6", "label_62x90", "label_54x90", "label_50x90", "label_38x90", "label_29x90"],
    dpi: 300,
    starters: BADGE_STARTERS,
    starter: (name, o) => badgeStarter(name as keyof typeof BADGE_STARTERS, o),
    gallery: true,
    tokenGroups: ["Guest", "Ticket", "Event", "Club"],
    guestPhoto: true,
    previewNote: "Rendered by the same code that prints at the door, at the card's real size. The QR in a preview admits nobody.",
    savedNote: "Cards are drawn at print time, so every card printed from now on uses it.",
    guideTitle: "Designing an ID card in Figma",
    sampleQr: TICKET_QR,
  },
  certificate: {
    kind: "certificate",
    label: "Certificate",
    title: "Certificate design",
    description: "The certificate each attendee can receive after the event, on A4. Pick a design, then move or change any part of it.",
    noun: "certificate",
    qrRequired: false,
    pages: ["a4_landscape", "a4_portrait", "letter_landscape"],
    dpi: 150,
    starters: {},
    starter: null,
    gallery: true,
    tokenGroups: ["Guest", "Certificate", "Event", "Club", "Ticket"],
    guestPhoto: true,
    previewNote: "Rendered by the same code that issues certificates. The QR in a preview verifies nothing.",
    savedNote: "Certificates issued from now on use it.",
    guideTitle: "Designing a certificate in Figma",
    sampleQr: `certificate:${TICKET_QR}`,
  },
  agenda: {
    kind: "agenda",
    label: "Programme",
    title: "Programme design",
    description: "The run of show as a designed screen for the kiosk, and the same design printed on A4. The sessions come from the agenda; the layer lays them out.",
    noun: "programme",
    qrRequired: false,
    pages: ["screen_landscape", "screen_portrait", "a4_portrait", "a4_landscape"],
    dpi: 150,
    starters: AGENDA_STARTERS,
    starter: (name) => agendaStarter(name as keyof typeof AGENDA_STARTERS),
    gallery: false,
    tokenGroups: ["Event", "Club"],
    guestPhoto: false,
    previewNote: "Rendered by the same code that prints the programme, with the event's own sessions.",
    savedNote: "The kiosk shows it on its attract screen, and the A4 programme prints from it.",
    guideTitle: "Designing a programme in Figma",
    sampleQr: TICKET_QR,
  },
};
