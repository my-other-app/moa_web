import { LayoutV2, POSTER_FORMAT_SPECS } from "@moa/layout";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test/render";

import { DesignerPage } from "../components/designer-page";
import { posterBoardSchema, type DesignScope } from "../schemas";
import { SAMPLE_GUEST_PHOTO } from "./sample-photo";

/**
 * Posters on the board (posters contract §10.3): the Poster tab once the
 * API has posters, the variant picker and the format tabs (in the address),
 * the gallery's poster starters drawn live, using one for every format or
 * opening a copy, the stage with the sample guest's photo and initials, the
 * fixed format, and what save, reset and preview are called with. The API
 * is stubbed in the shape the backend answers.
 */

const save = vi.fn();
const reset = vi.fn();
const apply = vi.fn();
const preview = vi.fn(async (..._args: unknown[]) => new Blob(["png"], { type: "image/png" }));
const boards: unknown[][] = [];
const state: { design: Record<string, unknown>; variants: unknown; starterFormats: Record<string, unknown> } = { design: {}, variants: null, starterFormats: {} };

vi.mock("../queries", async () => {
  const { posterBoardSchema } = await import("../schemas");
  let cache: { src: unknown; data: unknown } = { src: null, data: null };
  const data = () => {
    if (cache.src !== state.design) cache = { src: state.design, data: posterBoardSchema.parse(state.design) };
    return cache.data;
  };
  return {
    useBoard: (...args: unknown[]) => {
      boards.push(args);
      return { data: data(), isError: false, isPending: false, error: null, refetch: vi.fn(async () => ({})) };
    },
    useStarterLayout: (_s: unknown, _k: unknown, id: string | null, format?: string) => ({
      data: id ? (state.starterFormats[id] as Record<string, unknown> | undefined)?.[format ?? "square"] : undefined,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    useSaveBoard: (...args: unknown[]) => ({ mutateAsync: (layout: unknown) => save(layout, ...args), isPending: false, isError: false, error: null }),
    useResetLayout: (...args: unknown[]) => ({ mutateAsync: () => reset(...args), isPending: false }),
    useLayout: () => ({ data: undefined, isError: false, error: null, refetch: vi.fn() }),
    useSaveLayout: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
    useResetPreset: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useArtwork: () => ({ data: undefined }),
    useSaveArtwork: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePosterVariants: () => ({ data: state.variants, isPending: false, isError: false }),
    useApplyPosterStarter: () => ({ mutateAsync: apply, isPending: false }),
    usePosterStarterFormats: (_e: number, ids: readonly string[]) => ids.map((id) => ({ data: state.starterFormats[id] })),
  };
});
vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  previewBoard: (...args: unknown[]) => preview(...args),
}));
vi.mock("@/features/events", () => ({ useEventDetail: (id: number) => ({ data: id ? { id, name: "DevFest 2026" } : undefined }) }));
vi.mock("@/features/certificates", () => ({ useCertificateSummary: () => ({ data: undefined }), useApplyDesignToIssued: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/features/registrations", () => ({ useRegistrations: () => ({ data: { items: [], total: 0 } }) }));

const S = POSTER_FORMAT_SPECS;
const POSTER = (format: "square" | "portrait" | "story", layers: unknown[]) => ({
  version: 2,
  page: { widthMm: S[format].widthMm, heightMm: S[format].heightMm },
  canvas: { width: S[format].width, height: S[format].height, background: { type: "solid", color: "#FFFFFF" } },
  vars: { accent: "#4285F4" },
  layers,
});
const LAYERS = [
  { kind: "image", id: "photo", name: "Guest photo", source: "guest_photo", x: 140, y: 180, width: 800, height: 800, fit: "cover", radius: 400, placeholder: "initials" },
  { kind: "text", id: "phrase", name: "Phrase", x: 60, y: 40, width: 960, height: 90, text: "{{moment_phrase}}", font: { family: "Inter", weight: 700, style: "normal" }, size: 64 },
  { kind: "text", id: "name", name: "Name", x: 60, y: 1000, width: 960, height: 60, text: "{{name}}", font: { family: "Inter", weight: 600, style: "normal" }, size: 44 },
  { kind: "qr", id: "qr", name: "QR code", x: 900, y: 900, width: 150, height: 150, quietZone: 2 },
];

/** GET …/designs/poster/layout as the backend answers it: flat, with variant, format and from. */
const DTO = (layout: unknown, more: Record<string, unknown> = {}) => ({
  variant: "default",
  format: "square",
  layout,
  from: "saved",
  revision: 2,
  starters: [{ id: "poster/01-bold-frame", name: "Bold frame", use: "Big round photo", hasPhoto: true, formats: ["square", "portrait", "story"], preview: null }],
  fonts: [{ family: "Inter", weights: [400, 500, 600, 700], styles: ["normal"] }],
  tokens: [
    { key: "name", group: "Guest", label: "Name (from the registration)", sample: "Asha Nair" },
    { key: "email", group: "Guest", label: "Email", sample: "asha@example.com" },
    { key: "seat", group: "Guest", label: "Seat label", sample: "A-014" },
    { key: "moment_phrase", group: "Poster", label: "The moment's phrase (I'm attending)", sample: "I'm attending" },
    { key: "talk_title", group: "Speaker", label: "Talk title (speakers)", sample: "Building for Bharat" },
    { key: "field.college", group: "Guest fields", label: "College", sample: "Sample College" },
  ],
  images: { org_logo: null, event_icon: null, guest_photo: null, uploads: {} },
  values: { name: "Asha Nair", initials: "AN", moment_phrase: "I'm attending", event_name: "DevFest 2026" },
  context: { qr: "https://myotherapp.in/l/samplecd", colors: { primary: "#4285F4", secondary: "#34A853" } },
  ...more,
});

const VARIANTS = {
  variants: [{ variant: "default", label: "Everyone", formats: { square: { saved: true, revision: 2 }, portrait: { saved: false }, story: { saved: true, revision: 1 } } }],
  options: [
    { variant: "default", label: "Everyone" },
    { variant: "role:speaker", label: "Speakers" },
    { variant: "role:volunteer", label: "Volunteers" },
    { variant: "role:organiser", label: "Organisers" },
    { variant: "role:attendee", label: "Attendees" },
    { variant: "type:12", label: "Ticket: VIP" },
  ],
};

const EVENT: DesignScope = { kind: "event", eventId: 42 };
const stage = () => screen.getByTestId("board-stage");
const doc = () => stage().querySelector<HTMLElement>("[data-doc]")!.shadowRoot!;
const saveBar = () => screen.getByRole("region", { name: "Save" });
/** The poster slot the board's last useBoard call asked for. */
const lastSlot = () => boards.at(-1)![3] as { variant: string; format: string; label: string };

const openPosters = async () => {
  render(<DesignerPage scope={EVENT} />);
  fireEvent.click(await screen.findByRole("tab", { name: "Poster" }));
};
const openBoard = async () => {
  await openPosters();
  fireEvent.click(await screen.findByRole("button", { name: "Open the poster in use" }));
  await screen.findByTestId("board-stage");
};

beforeEach(() => {
  window.history.replaceState(null, "", "/events/42/design");
  state.design = DTO(POSTER("square", LAYERS));
  state.variants = VARIANTS;
  state.starterFormats = {
    "poster/01-bold-frame": { square: POSTER("square", LAYERS), portrait: POSTER("portrait", LAYERS), story: POSTER("story", LAYERS) },
  };
  boards.length = 0;
  save.mockReset();
  save.mockImplementation(async (layout: unknown) => posterBoardSchema.parse(DTO(layout, { revision: 3 })));
  reset.mockReset();
  apply.mockReset();
  apply.mockResolvedValue(VARIANTS);
  preview.mockClear();
});

describe("the Poster tab", () => {
  it("is there for an event once the API has posters, and not on the club's templates", async () => {
    render(<DesignerPage scope={EVENT} />);
    expect(await screen.findByRole("tab", { name: "Poster" })).toBeInTheDocument();
  });

  it("is not there on an API without posters", async () => {
    state.variants = null;
    render(<DesignerPage scope={EVENT} />);
    await screen.findByRole("tab", { name: "Ticket" });
    expect(screen.queryByRole("tab", { name: "Poster" })).not.toBeInTheDocument();
  });

  it("is never on the club's templates (posters are an event's)", async () => {
    render(<DesignerPage scope={{ kind: "club" }} />);
    await screen.findByRole("tab", { name: "Ticket" });
    expect(screen.queryByRole("tab", { name: "Poster" })).not.toBeInTheDocument();
  });

  it("opens on the variant and format in the address, and keeps them there", async () => {
    window.history.replaceState(null, "", "/events/42/design?kind=poster&variant=role%3Aspeaker&format=story");
    await openPosters();
    expect(screen.getByRole("combobox", { name: "Designing for" })).toHaveValue("role:speaker");
    expect(lastSlot()).toEqual({ variant: "role:speaker", format: "story", label: "Speakers" });
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Format" })).getByRole("radio", { name: "Portrait" }));
    expect(lastSlot()).toEqual({ variant: "role:speaker", format: "portrait", label: "Speakers" });
    expect(window.location.search).toContain("format=portrait");
    fireEvent.change(screen.getByRole("combobox", { name: "Designing for" }), { target: { value: "type:12" } });
    expect(lastSlot()).toEqual({ variant: "type:12", format: "portrait", label: "Ticket: VIP" });
    expect(window.location.search).toContain("variant=type%3A12");
  });

  it("says which formats the variant has its own layout for", async () => {
    await openPosters();
    expect(screen.getByText("Its own square and story layouts; portrait follows the next design in line.")).toBeInTheDocument();
  });
});

describe("the gallery", () => {
  it("draws the poster starters with the builder, for the format on the board", async () => {
    await openPosters();
    const card = await screen.findByRole("button", { name: "Start from Bold frame" });
    // The thumbnail is the builder's DOM in a shadow root, with the sample guest's name in it.
    const drawn = () => [...card.querySelectorAll("span")].map((el) => el.shadowRoot).find((r) => r?.querySelector(".moa-doc"));
    await waitFor(() => expect(drawn()).toBeTruthy());
    expect(drawn()!.querySelector('[data-layer="name"]')!.textContent).toContain("Asha Nair");
  });

  it("uses a starter for every format at once, after asking", async () => {
    await openPosters();
    fireEvent.click(await screen.findByRole("button", { name: "Start from Bold frame" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Use Bold frame for Everyone?");
    fireEvent.click(within(dialog).getByRole("button", { name: /Use it for every format/ }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith({ variant: "default", starterId: "poster/01-bold-frame" }));
    expect(await screen.findByTestId("board-stage")).toBeInTheDocument();
  });

  it("or opens a copy of the format on the board, unsaved", async () => {
    await openPosters();
    fireEvent.click(await screen.findByRole("button", { name: "Start from Bold frame" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Open a copy of the square layout/ }));
    expect(await screen.findByText(/A copy of the Bold frame design/)).toHaveTextContent("the square poster for Everyone");
    expect(apply).not.toHaveBeenCalled();
    expect(within(saveBar()).getByText("Not saved yet")).toBeInTheDocument();
  });
});

describe("the board", () => {
  it("draws the sample guest: their drawn photo in the frame, the moment's phrase, their name and their link's QR", async () => {
    await openBoard();
    const photo = doc().querySelector('[data-layer="photo"] img')!;
    expect(photo.getAttribute("src")).toBe(SAMPLE_GUEST_PHOTO);
    expect(doc().querySelector('[data-layer="phrase"]')!.textContent).toContain("I'm attending");
    expect(doc().querySelector('[data-layer="name"]')!.textContent).toContain("Asha Nair");
    expect(doc().querySelector('[data-layer="qr"] svg')).not.toBeNull();
  });

  it("shows the guest without a photo too: the initials tile", async () => {
    await openBoard();
    const docPanel = screen.getByRole("region", { name: "Document" });
    expect(docPanel).toHaveTextContent("Square · 1080 × 1080 px");
    fireEvent.click(within(docPanel).getByRole("radio", { name: "No photo" }));
    await waitFor(() => expect(doc().querySelector('[data-layer="photo"] .moa-initials')).not.toBeNull());
    expect(doc().querySelector('[data-layer="photo"]')!.textContent).toBe("AN");
  });

  it("lets the QR go (a poster needs none) and says what it holds", async () => {
    await openBoard();
    fireEvent.click(within(screen.getByRole("region", { name: "Layers" })).getByRole("button", { name: "QR code" }));
    const props = screen.getByRole("region", { name: "Properties" });
    expect(props).toHaveTextContent("the guest's own link to the event page");
    fireEvent.click(within(props).getByRole("button", { name: /Delete/ }));
    expect(doc().querySelector('[data-layer="qr"]')).toBeNull();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("offers the poster's own tokens and the form's answers, not a guest's email or a ticket's seat", async () => {
    await openBoard();
    fireEvent.click(within(screen.getByRole("region", { name: "Layers" })).getByRole("button", { name: "Name" }));
    fireEvent.keyDown(within(screen.getByRole("region", { name: "Properties" })).getByRole("button", { name: /Insert token/ }), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem").map((m) => m.textContent);
    expect(items.some((t) => t?.includes("Name (from the registration)"))).toBe(true);
    expect(items.some((t) => t?.includes("Talk title"))).toBe(true);
    expect(items.some((t) => t?.includes("College"))).toBe(true);
    expect(items.some((t) => t?.includes("Email") || t?.includes("Seat label"))).toBe(false);
  });

  it("offers only a poster's pictures for an image", async () => {
    await openBoard();
    fireEvent.click(within(screen.getByRole("region", { name: "Layers" })).getByRole("button", { name: "Guest photo" }));
    const shows = within(screen.getByRole("region", { name: "Properties" })).getByLabelText("Shows") as HTMLSelectElement;
    expect([...shows.options].map((o) => o.value).sort()).toEqual(["event_icon", "guest_photo", "org_logo", "upload"]);
  });

  it("saves the layout for this variant and format", async () => {
    await openBoard();
    fireEvent.click(within(screen.getByRole("region", { name: "Layers" })).getByRole("button", { name: "Name" }));
    const x = within(screen.getByRole("region", { name: "Properties" })).getByLabelText("X");
    fireEvent.change(x, { target: { value: "80" } });
    fireEvent.blur(x);
    fireEvent.click(within(saveBar()).getByRole("button", { name: /Save design/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const [layout, scope, kind, , slot] = save.mock.calls.at(-1)!;
    expect(scope).toEqual(EVENT);
    expect(kind).toBe("poster");
    expect(slot).toEqual({ variant: "default", format: "square", label: "Everyone" });
    const l = LayoutV2.parse(layout);
    expect(l.canvas.width).toBe(1080);
    expect(l.layers.find((x) => x.id === "name")!.x).toBe(80);
  });

  it("refuses to save a layout that is not a poster format, as the API would", async () => {
    state.design = DTO({ ...POSTER("square", LAYERS), canvas: { width: 1200, height: 1200 }, page: { widthMm: 317.5, heightMm: 317.5 } });
    await openBoard();
    expect(screen.getByRole("button", { name: /1 to fix/ })).toBeInTheDocument();
    expect(screen.getByText(/A poster is 1080 × 1080 \(square\)/)).toBeInTheDocument();
  });

  it("previews the unsaved layout for this variant and format", async () => {
    await openBoard();
    fireEvent.click(screen.getByRole("button", { name: /Preview the real poster/ }));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /sample guest/i }));
    });
    await waitFor(() => expect(preview).toHaveBeenCalled());
    const args = preview.mock.calls.at(-1)!;
    expect(args[1]).toBe("poster");
    expect(args[5]).toEqual({ variant: "default", format: "square", label: "Everyone" });
  });

  it("drops this format's own layout, after asking", async () => {
    await openBoard();
    fireEvent.click(screen.getByRole("button", { name: /Drop this layout/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Drop the square layout for Everyone?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Drop this layout" }));
    await waitFor(() => expect(reset).toHaveBeenCalled());
    expect(reset.mock.calls.at(-1)![3]).toEqual({ variant: "default", format: "square", label: "Everyone" });
  });

  it("says when a variant follows the next design in line", async () => {
    state.design = DTO(POSTER("square", LAYERS), { from: "default", variant: "role:speaker" });
    window.history.replaceState(null, "", "/events/42/design?variant=role%3Aspeaker");
    await openBoard();
    expect(screen.getByText(/No square layout of its own for Speakers yet/)).toBeInTheDocument();
  });
});
