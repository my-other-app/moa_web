import { LayoutV2 } from "@moa/layout";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test/render";

import { boardDesignSchema, type DesignScope } from "../schemas";
import { DesignerPage } from "../components/designer-page";

/**
 * The board, rendered with the real v2 builder: the gallery, then the
 * stage and its gestures (pick, shift-pick, marquee, drag, resize, turn,
 * snap), the arrange buttons, undo, writing in place with the token menu,
 * the font picker, the accent, and what save and preview send. The API is
 * stubbed in the shape the backend answers (GET …/layout with `v2`).
 */

// jsdom has no PointerEvent: a mouse event with a pointer id stands in.
if (!("PointerEvent" in window)) {
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  vi.stubGlobal("PointerEvent", PointerEventStub);
}

const save = vi.fn();
const reset = vi.fn();
const preview = vi.fn(async (..._args: unknown[]) => new Blob(["png"], { type: "image/png" }));
const state: { design: Record<string, unknown>; starters: Record<string, unknown> } = { design: {}, starters: {} };

vi.mock("../queries", async () => {
  const { boardDesignSchema } = await import("../schemas");
  // Parsed once per design, as React Query hands back the same data until it changes.
  let cache: { src: unknown; data: unknown } = { src: null, data: null };
  const data = () => {
    if (cache.src !== state.design) cache = { src: state.design, data: boardDesignSchema.parse(state.design) };
    return cache.data;
  };
  return {
    useBoard: () => ({ data: data(), isError: false, error: null, refetch: vi.fn(async () => ({})) }),
    useStarterLayout: (_s: unknown, _k: unknown, id: string | null) => ({ data: id ? state.starters[id] : undefined, isError: false, error: null, refetch: vi.fn() }),
    useSaveBoard: () => ({ mutateAsync: save, isPending: false, isError: false, error: null }),
    useResetLayout: () => ({ mutateAsync: reset, isPending: false }),
    // The programme's canvas editor, which this file does not open.
    useLayout: () => ({ data: undefined, isError: false, error: null, refetch: vi.fn() }),
    useSaveLayout: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
    useResetPreset: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useArtwork: () => ({ data: undefined }),
    useSaveArtwork: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});
vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  previewBoard: (...args: unknown[]) => preview(...args),
}));
vi.mock("@/features/events", () => ({ useEventDetail: (id: number) => ({ data: id ? { id, name: "Hack Night" } : undefined }) }));
vi.mock("@/features/certificates", () => ({ useCertificateSummary: () => ({ data: undefined }), useApplyDesignToIssued: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/features/registrations", () => ({ useRegistrations: () => ({ data: { items: [], total: 0 } }) }));

const TICKET = (layers: unknown[]) => ({
  version: 2,
  page: { widthMm: 203.2, heightMm: 95.25 },
  canvas: { width: 800, height: 375, background: { type: "solid", color: "#FFFFFF" } },
  vars: { accent: "#FF8A3D" },
  layers,
});

const LAYERS = [
  { kind: "shape", id: "band", name: "Accent band", x: 0, y: 0, width: 800, height: 100, fill: { type: "solid", color: "var:accent" } },
  { kind: "text", id: "name", name: "Guest name", x: 40, y: 200, width: 320, height: 60, text: "{{attendee_name}}", font: { family: "Inter", weight: 700, style: "normal" }, size: 40 },
  { kind: "text", id: "role", name: "Role", x: 100, y: 300, width: 200, height: 40, text: "Speaker", font: { family: "Inter", weight: 500, style: "normal" }, size: 24 },
  { kind: "qr", id: "qr", name: "QR code", x: 640, y: 200, width: 120, height: 120 },
];

const DESIGN = (layout: unknown, more: Record<string, unknown> = {}) => ({
  eventId: 42,
  kind: "ticket",
  audience: "event_default",
  version: 0,
  isOwn: true,
  fromStarter: false,
  brand: { orgName: "Code Club", primary: "#0F8A73", secondary: "#141614", logoUrl: null },
  tokens: [
    { key: "attendee_name", group: "Guest", label: "Name", sample: "Asha Rao" },
    { key: "ticket_code", group: "Ticket", label: "Ticket code", sample: "MOA-7K3QF-X9PLM" },
  ],
  sampleValues: { attendee_name: "Asha Rao" },
  qrRequired: true,
  v2: {
    layout,
    from: "saved",
    revision: 3,
    starters: [{ id: "ticket/03-aurora", name: "Aurora", preview: null, page: { widthMm: 203.2, heightMm: 95.25 } }],
    fonts: [
      { family: "Inter", weights: [400, 500, 600, 700], styles: ["normal"] },
      { family: "Anton", weights: [400], styles: ["normal"] },
      { family: "Google Sans", weights: [400, 500, 600, 700], styles: ["normal"] },
    ],
    images: { org_logo: null, uploads: {} },
    values: { attendee_name: "Asha Rao", ticket_code: "MOA-7K3QF-X9PLM" },
    context: { qr: "MOA-7K3QF-X9PLM", colors: { primary: "#0F8A73", secondary: "#141614" } },
  },
  ...more,
});

const EVENT: DesignScope = { kind: "event", eventId: 42 };

const stage = () => screen.getByTestId("board-stage");
const doc = () => stage().querySelector<HTMLElement>("[data-doc]")!.shadowRoot!;
const props = () => screen.getByRole("region", { name: "Properties" });
const field = (label: string) => within(props()).getByLabelText(label) as HTMLInputElement;
const saveBar = () => screen.getByRole("region", { name: "Save" });

/** Open the board on the design in use, at 100% so screen pixels are canvas pixels. */
const openBoard = async () => {
  render(<DesignerPage scope={EVENT} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open the ticket in use" }));
  fireEvent.change(await screen.findByRole("combobox", { name: "Zoom" }), { target: { value: "1" } });
};

const at = (x: number, y: number, more: Record<string, unknown> = {}) => ({ clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, ...more });
const press = (x: number, y: number, more: Record<string, unknown> = {}, target: Element = stage()) => fireEvent.pointerDown(target, at(x, y, more));
const drag = (from: [number, number], to: [number, number], more: Record<string, unknown> = {}, target: Element = stage()) => {
  fireEvent.pointerDown(target, at(from[0], from[1], more));
  fireEvent.pointerMove(stage(), at((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, more));
  fireEvent.pointerMove(stage(), at(to[0], to[1], more));
  fireEvent.pointerUp(stage(), at(to[0], to[1], { ...more, buttons: 0 }));
};
const click = (x: number, y: number, more: Record<string, unknown> = {}) => {
  press(x, y, more);
  fireEvent.pointerUp(stage(), at(x, y, { ...more, buttons: 0 }));
};
const handle = (name: string) => stage().querySelector(`[data-handle="${name}"]`)!;
const key = (k: string, more: Record<string, unknown> = {}) => fireEvent.keyDown(window, { key: k, ...more });

/** What the board would save, as the API gets it. */
const saved = async () => {
  fireEvent.click(within(saveBar()).getByRole("button", { name: /Save design/ }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  return LayoutV2.parse(save.mock.calls.at(-1)![0]);
};
const layerOf = (l: LayoutV2, id: string) => l.layers.find((x) => x.id === id)!;

beforeEach(() => {
  state.design = DESIGN(TICKET(LAYERS));
  state.starters = {};
  save.mockReset();
  // As the mutation answers: the saved design, parsed.
  save.mockImplementation(async (layout: unknown) => boardDesignSchema.parse({ ...DESIGN(layout), v2: { ...(DESIGN(layout).v2 as object), revision: 4 } }));
  reset.mockReset();
  preview.mockClear();
});

describe("the stage", () => {
  it("draws the builder's DOM, one element per drawn layer, in paint order", async () => {
    await openBoard();
    const ids = [...doc().querySelectorAll("[data-layer]")].map((e) => e.getAttribute("data-layer"));
    expect(ids).toEqual(["band", "name", "role", "qr"]);
    expect(doc().querySelector('[data-layer="name"]')!.textContent).toContain("Asha Rao");
  });

  it("picks a layer with a click, and shows its properties", async () => {
    await openBoard();
    click(60, 220);
    expect(field("Name")).toHaveValue("Guest name");
    expect(within(screen.getByRole("region", { name: "Layers" })).getByRole("button", { name: "Guest name" })).toHaveAttribute("aria-pressed", "true");
    // A click on nothing clears it.
    click(500, 150);
    expect(screen.getByRole("region", { name: "Document" })).toBeInTheDocument();
  });

  it("adds to the selection with shift, and picks with a marquee", async () => {
    await openBoard();
    click(60, 220);
    click(120, 310, { shiftKey: true });
    expect(screen.getByRole("region", { name: "Selection" })).toHaveTextContent("2 layers");
    click(500, 150);
    drag([20, 190], [380, 360]);
    expect(screen.getByRole("region", { name: "Selection" })).toHaveTextContent("2 layers");
  });

  it("drags a layer, one undo step, and redoes it", async () => {
    await openBoard();
    drag([60, 220], [110, 240], { altKey: true });
    expect(field("X")).toHaveValue(90);
    expect(field("Y")).toHaveValue(220);
    key("z", { metaKey: true });
    expect(field("X")).toHaveValue(40);
    key("z", { metaKey: true, shiftKey: true });
    expect(field("X")).toHaveValue(90);
  });

  it("snaps a drag to the canvas centre", async () => {
    await openBoard();
    // The name's centre is at x 200; moved 197 it would sit at 397, 3 px from the centre line.
    drag([60, 220], [257, 220]);
    expect(field("X")).toHaveValue(240);
  });

  it("moves several layers together", async () => {
    await openBoard();
    click(60, 220);
    click(120, 310, { shiftKey: true });
    drag([60, 220], [80, 220], { altKey: true });
    const l = await saved();
    expect(layerOf(l, "name").x).toBe(60);
    expect(layerOf(l, "role").x).toBe(120);
  });

  it("resizes from a handle, keeping the far corner, and keeps the shape with shift", async () => {
    await openBoard();
    click(60, 220);
    drag([360, 260], [400, 280], { altKey: true }, handle("se"));
    expect(field("Width")).toHaveValue(360);
    expect(field("Height")).toHaveValue(80);
    expect(field("X")).toHaveValue(40);
    drag([400, 280], [490, 280], { altKey: true, shiftKey: true }, handle("se"));
    expect(field("Width")).toHaveValue(450);
    expect(field("Height")).toHaveValue(100);
  });

  it("turns a layer with the rotate handle", async () => {
    await openBoard();
    click(60, 220);
    // The name's centre is (200, 230): the pointer straight to its right turns it a quarter.
    drag([200, 170], [300, 230], {}, handle("rotate"));
    expect(field("Rotation")).toHaveValue(90);
  });

  it("nudges with the arrows, ten at a time with shift", async () => {
    await openBoard();
    click(60, 220);
    key("ArrowRight");
    key("ArrowDown", { shiftKey: true });
    expect(field("X")).toHaveValue(41);
    expect(field("Y")).toHaveValue(210);
  });

  it("patches only the layer that moved: the others keep their elements", async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      kind: "shape",
      id: `s${i}`,
      name: `Shape ${i}`,
      x: (i % 10) * 70 + 20,
      y: Math.floor(i / 10) * 40 + 20,
      width: 40,
      height: 20,
      fill: { type: "solid", color: "#336699" },
    }));
    state.design = DESIGN(TICKET([...many, LAYERS[3]]));
    await openBoard();
    const before = new Map([...doc().querySelectorAll<HTMLElement>("[data-layer]")].map((e) => [e.dataset.layer!, e]));
    expect(before.size).toBe(81);
    fireEvent.pointerDown(stage(), at(30, 25));
    fireEvent.pointerMove(stage(), at(45, 30, { altKey: true }));
    fireEvent.pointerMove(stage(), at(60, 35, { altKey: true }));
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    // While dragging only its box style changes, on the same element.
    const moving = doc().querySelector<HTMLElement>('[data-layer="s0"]')!;
    expect(moving).toBe(before.get("s0"));
    expect(moving.style.left).toBe("50px");
    fireEvent.pointerUp(stage(), at(60, 35, { buttons: 0, altKey: true }));
    const after = new Map([...doc().querySelectorAll<HTMLElement>("[data-layer]")].map((e) => [e.dataset.layer!, e]));
    for (const [id, el] of before) if (id !== "s0") expect(after.get(id)).toBe(el);
  });
});

describe("arranging", () => {
  it("aligns the selection's left edges", async () => {
    await openBoard();
    click(60, 220);
    click(120, 310, { shiftKey: true });
    fireEvent.click(within(screen.getByRole("region", { name: "Selection" })).getByRole("button", { name: "Align left" }));
    const l = await saved();
    expect(layerOf(l, "role").x).toBe(40);
  });

  it("brings a layer to the front, copies, pastes and deletes", async () => {
    await openBoard();
    click(60, 220);
    key("]", { metaKey: true, shiftKey: true });
    key("d", { metaKey: true });
    // The copy is picked: delete it again.
    expect(field("Name")).toHaveValue("Guest name copy");
    key("Backspace");
    click(60, 220);
    fireEvent.copy(window);
    fireEvent.paste(window);
    const l = await saved();
    expect(l.layers.map((x) => x.name)).toEqual(["Accent band", "Role", "QR code", "Guest name", "Guest name copy"]);
  });

  it("keeps the ticket's QR: it cannot be deleted or hidden", async () => {
    await openBoard();
    click(700, 260);
    expect(within(props()).getByRole("button", { name: "This design needs its QR code" })).toBeDisabled();
    key("Delete");
    key("ArrowLeft");
    expect((await saved()).layers.some((x) => x.kind === "qr")).toBe(true);
  });
});

describe("text", () => {
  it("is written in place with a double-click, tokens from the menu", async () => {
    await openBoard();
    fireEvent.doubleClick(stage(), at(60, 220));
    const area = await screen.findByRole("textbox", { name: "Text of Guest name" });
    expect(area).toHaveValue("{{attendee_name}}");
    fireEvent.change(area, { target: { value: "Hello " } });
    fireEvent.keyDown(within(area.closest("[data-editor]") as HTMLElement).getByRole("button", { name: /Insert token/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Ticket code/ }));
    await waitFor(() => expect(area).toHaveValue("Hello {{ticket_code}}"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("textbox", { name: "Text of Guest name" })).not.toBeInTheDocument();
    expect(doc().querySelector('[data-layer="name"]')!.textContent).toContain("Hello MOA-7K3QF-X9PLM");
  });

  it("picks a font from the list, each shown in itself, and only its weights", async () => {
    await openBoard();
    click(60, 220);
    fireEvent.click(within(props()).getByRole("button", { name: "Font" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Search fonts" }), { target: { value: "ant" } });
    const options = within(screen.getByRole("listbox", { name: "Fonts" })).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]!.querySelector<HTMLElement>("span span")!.style.fontFamily).toMatch(/Anton/);
    fireEvent.click(options[0]!);
    expect(within(props()).getByRole("button", { name: "Font" })).toHaveTextContent("Anton");
    expect(within(props()).getByRole("combobox", { name: "Weight" })).toHaveValue("400");
    const l = await saved();
    expect(layerOf(l, "name").kind === "text" && layerOf(l, "name")).toMatchObject({ font: { family: "Anton", weight: 400, style: "normal" } });
  });
});

describe("the document", () => {
  it("recolours everything bound to the accent", async () => {
    await openBoard();
    expect(screen.getByRole("region", { name: "Document" })).toHaveTextContent("Used by 1 layer");
    fireEvent.change(within(screen.getByRole("region", { name: "Document" })).getByLabelText("Accent"), { target: { value: "#123456" } });
    await waitFor(() => expect(doc().querySelector('[data-layer="band"]')!.outerHTML).toMatch(/#123456|rgb\(18, 52, 86\)/i));
    expect((await saved()).vars.accent).toBe("#123456");
  });
});

describe("saving and previewing", () => {
  it("saves layout v2, every default filled", async () => {
    await openBoard();
    click(60, 220);
    key("ArrowRight");
    expect(within(saveBar()).getByRole("status")).toHaveTextContent(/Unsaved changes/);
    const l = await saved();
    expect(save.mock.calls[0]![0]).toMatchObject({ version: 2, page: { widthMm: 203.2, heightMm: 95.25 } });
    expect(l.layers).toHaveLength(4);
    await waitFor(() => expect(within(saveBar()).getByRole("status")).toHaveTextContent(/Saved · Ticket for everyone · version 4/));
  });

  it("previews the unsaved layout through the server, for the sample guest", async () => {
    await openBoard();
    fireEvent.click(screen.getByRole("button", { name: /Preview as issued/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Preview with the sample guest/ }));
    await waitFor(() => expect(preview).toHaveBeenCalled());
    const [scope, kind, audience, layout, ticket] = preview.mock.calls[0]!;
    expect(scope).toEqual(EVENT);
    expect([kind, audience, ticket]).toEqual(["ticket", "event_default", null]);
    expect(LayoutV2.parse(layout).layers).toHaveLength(4);
  });
});

describe("the gallery", () => {
  it("opens a starter's copy on the board, unsaved", async () => {
    state.starters["ticket/03-aurora"] = TICKET([
      { kind: "text", id: "title", name: "Aurora title", x: 40, y: 40, width: 500, height: 60, text: "{{event_name}}", font: { family: "Inter", weight: 700, style: "normal" }, size: 40 },
      LAYERS[3],
    ]);
    render(<DesignerPage scope={EVENT} />);
    fireEvent.click(await screen.findByRole("button", { name: "Start from Aurora" }));
    expect(await screen.findByRole("button", { name: "Aurora title" })).toBeInTheDocument();
    expect(within(saveBar()).getByRole("status")).toHaveTextContent(/Not saved yet/);
    expect(screen.getByText(/the Aurora design/)).toBeInTheDocument();
    const l = await saved();
    expect(l.layers.map((x) => x.id)).toEqual(["title", "qr"]);
  });

  it("opens a design saved before the board converted, from the canvas's fields", async () => {
    const { v2: _v2, ...v1 } = DESIGN(null);
    state.design = {
      ...v1,
      canvas: { width: 1560, height: 690, background: "#FFFFFF", templateKey: null, templatePreprinted: false, area: null },
      layers: [
        {
          kind: "text",
          id: "name",
          name: "Guest name",
          text: "{{attendee_name}}",
          x: 120,
          y: 300,
          width: 700,
          size: 64,
          font: "google_sans",
          weight: 600,
          color: "#141614",
          align: "left",
          maxLines: 1,
          lineSpacing: 0,
          letterSpacing: 0,
          fit: "shrink",
          opacity: 1,
        },
        { kind: "qr", id: "qr", name: "QR code", x: 1164, y: 168, size: 324, quietZone: 2, dark: "#000000", light: "#FFFFFF" },
      ],
      page: { widthMm: 203.2, heightMm: null },
    };
    await openBoard();
    expect(screen.getByText(/opens here with each part as its own layer/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("region", { name: "Layers" })).getByRole("button", { name: "Guest name" }));
    expect(within(props()).getByRole("button", { name: "Font" })).toHaveTextContent("Google Sans");
    key("ArrowRight");
    const l = await saved();
    expect(l.version).toBe(2);
    expect(l.layers.map((x) => x.kind)).toEqual(["text", "qr"]);
  });
});
