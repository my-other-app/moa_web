import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import { render } from "@/test/render";

import { layerDesignSchema, type DesignScope, type LayerDesign } from "../schemas";
import { DesignerPage } from "./designer-page";

/**
 * The designer's chrome, rendered: what is being designed and for whom,
 * where the design comes from, what is selected, the layer row's controls,
 * and whether the design is saved -- the things a person reads before they
 * touch the stage. The stage itself is drawn by the same component as
 * before and is not asserted here.
 */

const state: { design: LayerDesign; saving: boolean } = { design: null as unknown as LayerDesign, saving: false };
const save = vi.fn();
const reset = vi.fn();

vi.mock("../queries", () => ({
  useLayout: () => ({ data: state.design, isError: false, error: null, refetch: vi.fn(async () => ({})) }),
  useSaveLayout: () => ({ mutateAsync: save, isPending: state.saving, isError: false, error: null }),
  useResetLayout: () => ({ mutateAsync: reset, isPending: false }),
}));
vi.mock("@/features/events", () => ({
  useEventDetail: (id: number) => ({ data: id ? { id, name: "Hack Night" } : undefined }),
}));
vi.mock("@/features/registrations", () => ({
  useRegistrations: () => ({ data: { items: [], total: 0 } }),
}));

// The stage waits for its fonts; jsdom has no FontFace or font set, so here they simply never arrive.
vi.stubGlobal(
  "FontFace",
  class {
    load() {
      return new Promise(() => {});
    }
  }
);
if (!document.fonts) Object.defineProperty(document, "fonts", { value: { add: () => {} }, configurable: true });

const LAYERS = [
  { kind: "shape", id: "band", name: "Brand band", x: 0, y: 0, width: 1560, height: 120, fill: "brand.primary", stroke: null, strokeWidth: 0, radius: 0, opacity: 1, path: null },
  {
    kind: "text",
    id: "name",
    name: "Guest name",
    text: "{{attendee_name}}",
    x: 120,
    y: 300,
    width: 700,
    size: 64,
    font: "inter",
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
];

const design = (over: Partial<Record<string, unknown>> = {}) =>
  layerDesignSchema.parse({
    eventId: 42,
    kind: "ticket",
    audience: "event_default",
    canvas: { width: 1560, height: 690, background: "#FFFFFF", templateKey: null, templatePreprinted: false, area: null },
    layers: LAYERS,
    page: { widthMm: 203.2, heightMm: null },
    version: 0,
    isOwn: false,
    fromStarter: false,
    brand: { orgName: "Code Club", primary: "#0F8A73", secondary: "#141614", logoUrl: null },
    starters: {},
    tokens: [{ key: "attendee_name", group: "Guest", label: "Name", sample: "Asha Rao" }],
    qrRequired: true,
    sampleValues: { attendee_name: "Asha Rao" },
    ...over,
  });

const open = (scope: DesignScope) => render(<DesignerPage scope={scope} />);
const EVENT: DesignScope = { kind: "event", eventId: 42 };
const saveBar = () => screen.getByRole("region", { name: "Save" });

beforeEach(() => {
  state.design = design();
  state.saving = false;
  save.mockReset();
  reset.mockReset();
});

describe("the designer's header", () => {
  it("says what is designed, for which event, with a tab per kind", async () => {
    open(EVENT);
    expect(await screen.findByRole("heading", { name: "Designs" })).toBeInTheDocument();
    expect(screen.getByText(/Hack Night ·/)).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Ticket", "ID card", "Certificate", "Programme"]);
    expect(screen.getByRole("tab", { name: "Ticket" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: /Back to event/ })).toHaveAttribute("href", "/events/42");
  });

  it("offers an event the audiences, and the club's templates none", async () => {
    const { unmount } = open(EVENT);
    expect(await screen.findByRole("radiogroup", { name: "Designing for" })).toBeInTheDocument();
    unmount();
    open({ kind: "club" });
    expect(await screen.findByRole("heading", { name: "Templates" })).toBeInTheDocument();
    expect(screen.getByText(/Your club's defaults ·/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Designing for" })).not.toBeInTheDocument();
  });
});

describe("where the design comes from", () => {
  it("says an event follows the club's template, and links to it", async () => {
    open(EVENT);
    expect(await screen.findByText(/uses your club's ticket template/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit the template" })).toHaveAttribute("href", "/templates?kind=ticket");
  });

  it("offers the club a way back to the built-in layout once it has its own", async () => {
    state.design = design({ isOwn: true, version: 3 });
    open({ kind: "club" });
    expect(await screen.findByText(/Your club's ticket template · version 3\. Every new event starts from it/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Back to the built-in layout/ }));
    expect(await screen.findByRole("dialog", { name: "Go back to the built-in ticket?" })).toBeInTheDocument();
  });
});

describe("the save state", () => {
  it("is always in view: no changes while following the template", async () => {
    open(EVENT);
    await screen.findByRole("heading", { name: "Designs" });
    expect(within(saveBar()).getByRole("status")).toHaveTextContent("No changes · Following your club's template");
    expect(within(saveBar()).getByRole("button", { name: /Save design/ })).toBeDisabled();
  });

  it("says saved, with the version, for a design of its own", async () => {
    state.design = design({ isOwn: true, version: 4 });
    open(EVENT);
    await screen.findByRole("heading", { name: "Designs" });
    expect(within(saveBar()).getByRole("status")).toHaveTextContent(/Saved · Ticket for everyone · version 4/);
    expect(within(saveBar()).getByRole("button", { name: /Saved/ })).toBeDisabled();
  });

  it("turns to unsaved changes after an edit, with discard beside save", async () => {
    open(EVENT);
    fireEvent.click(await screen.findByRole("button", { name: "Hide Guest name" }));
    expect(within(saveBar()).getByRole("status")).toHaveTextContent(/Unsaved changes · Ticket for everyone/);
    expect(within(saveBar()).getByRole("button", { name: /Save design/ })).toBeEnabled();
    expect(within(saveBar()).getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });

  it("asks before switching kind with unsaved changes", async () => {
    open(EVENT);
    fireEvent.click(await screen.findByRole("button", { name: "Lock Guest name in place" }));
    fireEvent.click(screen.getByRole("tab", { name: "ID card" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave this design?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("tab", { name: "Ticket" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("layers and properties", () => {
  it("lists the layers front first, with the kit's eye, lock and row actions", async () => {
    open(EVENT);
    const panel = await screen.findByRole("region", { name: "Layers" });
    const rows = within(panel).getAllByRole("button", { pressed: false }).filter((b) => b.getAttribute("role") === "button");
    expect(rows.map((r) => r.querySelector(".font-medium")?.textContent)).toEqual(["QR code", "Guest name", "Brand band"]);
    expect(within(panel).getByRole("button", { name: "Hide Guest name" })).toHaveAttribute("data-slot", "icon-toggle");
    expect(within(panel).getByRole("button", { name: "Delete Guest name" })).toHaveAttribute("data-slot", "icon-button");
    // The QR is what the gate scans: it can be neither hidden nor deleted.
    expect(within(panel).getByRole("button", { name: "Every ticket needs its QR code" })).toBeDisabled();
    expect(within(panel).getByRole("button", { name: "QR code" })).toBeDisabled();
  });

  it("shows the canvas until a layer is picked, then that layer's properties", async () => {
    open(EVENT);
    expect(await screen.findByRole("region", { name: "Canvas" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("region", { name: "Layers" })).getByText("Guest name"));
    const props = screen.getByRole("region", { name: "Properties" });
    expect(within(props).getByLabelText("Name")).toHaveValue("Guest name");
    expect(within(props).getByRole("heading", { name: "Type" })).toBeInTheDocument();
    expect(within(props).getByRole("combobox", { name: "Font" })).toHaveValue("inter");
    fireEvent.click(within(props).getByRole("button", { name: "Deselect" }));
    expect(screen.getByRole("region", { name: "Canvas" })).toBeInTheDocument();
  });

  it("offers a colour as fixed or following the brand", async () => {
    open(EVENT);
    fireEvent.click(within(await screen.findByRole("region", { name: "Layers" })).getByText("Brand band"));
    const fill = screen.getByRole("combobox", { name: "Fill" });
    expect(fill).toHaveValue("brand.primary");
    expect(within(fill).getAllByRole("option").map((o) => o.textContent)).toEqual(["Fixed colour", "Club primary", "Club secondary", "Ticket type colour", "None"]);
  });
});

describe("layouts", () => {
  it("lists the starters as choices and replaces the design only once one is picked", async () => {
    open(EVENT);
    fireEvent.click(await screen.findByRole("button", { name: /Layouts/ }));
    const dialog = await screen.findByRole("dialog", { name: "Start from a layout" });
    const choices = within(dialog).getAllByRole("radio");
    expect(choices.length).toBeGreaterThan(1);
    const replace = within(dialog).getByRole("button", { name: "Replace the design" });
    expect(replace).toBeDisabled();
    fireEvent.click(choices[0]!);
    expect(replace).toBeEnabled();
    fireEvent.click(replace);
    expect(within(saveBar()).getByRole("status")).toHaveTextContent(/Unsaved changes/);
  });
});
