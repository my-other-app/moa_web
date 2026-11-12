import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { render } from "@/test/render";

import { ApiError } from "@moa/api";

import { layerDesignSchema, type DesignKind, type DesignScope, type LayerDesign } from "../schemas";
import { DesignerPage } from "./designer-page";
import { serverProblems } from "./preset-editor";

/**
 * The ready designs, rendered: the gallery before the canvas, a design's
 * settings and the preview the server fills, the save, and the ways to the
 * canvas -- Custom design, and the CR80 card for badges. The backend's
 * answers are stubbed in the shape it sends (snake_case manifests).
 */

const state: { designs: Partial<Record<DesignKind, LayerDesign>> } = { designs: {} };
const savePreset = vi.fn();
const saveLayout = vi.fn();
const reset = vi.fn();
const applyIssued = vi.fn();
const certificates: { summary: { other_design: number } | undefined } = { summary: undefined };
const clearPreset = vi.fn();
const saveArtwork = vi.fn();
const previewHtml = vi.fn(async (..._args: unknown[]) => "<!doctype html><p>Filled by the server</p>");

vi.mock("../queries", () => ({
  useLayout: (_scope: unknown, kind: DesignKind) => ({ data: state.designs[kind], isError: false, error: null, refetch: vi.fn(async () => ({})) }),
  useSaveLayout: () => ({ mutateAsync: saveLayout, isPending: false, isError: false, error: null }),
  useSavePreset: () => ({ mutateAsync: savePreset, isPending: false, isError: false, error: null }),
  useResetLayout: () => ({ mutateAsync: reset, isPending: false }),
  useResetPreset: () => ({ mutateAsync: clearPreset, isPending: false }),
  useArtwork: () => ({ data: { logo: "https://cdn.example/logo.png", signature_1: null, signature_2: null } }),
  useSaveArtwork: () => ({ mutateAsync: saveArtwork, isPending: false }),
}));
vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  previewPresetHtml: (...args: unknown[]) => previewHtml(...args),
  previewPresetPng: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
}));
vi.mock("@/lib/images", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/images")>()),
  fitImage: async (f: File) => f,
}));
vi.mock("@/features/events", () => ({
  useEventDetail: (id: number) => ({ data: id ? { id, name: "Hack Night" } : undefined }),
}));
vi.mock("@/features/certificates", () => ({
  useCertificateSummary: () => ({ data: certificates.summary }),
  useApplyDesignToIssued: () => ({ mutate: applyIssued, isPending: false }),
}));
vi.mock("@/features/registrations", () => ({
  useRegistrations: () => ({ data: { items: [], total: 0 } }),
}));

vi.stubGlobal(
  "FontFace",
  class {
    load() {
      return new Promise(() => {});
    }
  }
);
if (!document.fonts) Object.defineProperty(document, "fonts", { value: { add: () => {} }, configurable: true });

const LANYARD = { key: "lanyard", label: "Lanyard slot", type: "bool", default: true, hint: "Turn it off for pre-punched cards." };

const CATALOGUE: Record<"ticket" | "badge" | "certificate", unknown[]> = {
  ticket: [
    {
      id: "ticket/03-daylight-boarding-pass",
      name: "Daylight Boarding Pass",
      kind: "ticket",
      page: { width_px: 1280, height_px: 600, width_mm: null, height_mm: null },
      has_photo: false,
      accent: null,
      tokens: [{ name: "event_name", required: true }, { name: "tagline", required: false }],
      options: [],
      preview: null,
    },
    {
      id: "ticket/02-midnight-arcade",
      name: "Midnight Arcade",
      kind: "ticket",
      page: { width_px: 1280, height_px: 600 },
      has_photo: false,
      accent: null,
      tokens: [{ name: "gate", required: false }],
      options: [],
    },
  ],
  certificate: [
    {
      id: "certificate/07-swiss-minimal",
      name: "Swiss Minimal",
      kind: "certificate",
      page: { width_px: 1123, height_px: 794, width_mm: 297, height_mm: 210 },
      accent: { default: "#D90429", suggestions: ["#D90429", "#1F3BD8"], contrast_note: null },
      tokens: [{ name: "recipient_name", required: true }, { name: "grade", required: false }, { name: "logo_src", required: false }, { name: "signature_src", required: false }],
      options: [
        { key: "title", label: "Title", type: "text", default: "Certificate", required: true, max_length: 20 },
        { key: "signatory_name", label: "Signatory", type: "text", group: "signatories", default: "" },
      ],
    },
    // As the backend's catalogue sends it (DesignInfo.to_dict): maps of tokens and options.
    {
      id: "certificate/02-midnight-deco",
      kind: "certificate",
      name: "Midnight Deco",
      colour: "colour",
      page: { width_px: 1123, height_px: 794, width_mm: 297, height_mm: 210 },
      accent: { default: "#E0BC6A", suggestions: ["#E0BC6A", "#D9D9DE"], against: ["#0D111C"], min_contrast: 3, note: "" },
      tokens: { recipient_name: "required", grade: "optional" },
      bindable: ["grade"],
      options: {
        wording: { type: "choice", choices: ["participation", "achievement"], default: "achievement", label: "Wording" },
        text: { type: "text", slots: ["title", "statement"], max_length: 200, label: "Your own words for a line" },
      },
      preview: "certificate/02-midnight-deco.png",
    },
  ],
  badge: [
    {
      id: "badge/06-thermal-mono",
      name: "Thermal Mono",
      kind: "badge",
      page: { width_px: 384, height_px: 576, width_mm: 101.6, height_mm: 152.4 },
      has_photo: false,
      accent: null,
      tokens: [{ name: "zone", required: false }, { name: "organization", required: false }],
      options: [LANYARD],
    },
    {
      id: "badge/01-ticket-stub",
      name: "Ticket Stub",
      kind: "badge",
      page: { width_px: 384, height_px: 576, width_mm: 101.6, height_mm: 152.4 },
      has_photo: true,
      accent: { default: "#FF8A3D", suggestions: ["#FF8A3D", "#3DD6A3"] },
      tokens: [{ name: "job_title", required: false }, { name: "photo_url", required: true }],
      options: [LANYARD],
    },
    {
      id: "badge/04-big-name",
      name: "Big Name",
      kind: "badge",
      page: { width_px: 384, height_px: 576, width_mm: 101.6, height_mm: 152.4 },
      has_photo: false,
      accent: { default: "#FFD83A", suggestions: ["#FFD83A"] },
      tokens: [],
      options: [LANYARD],
    },
  ],
};
const DEFAULTS = { ticket: "ticket/03-daylight-boarding-pass", certificate: "certificate/07-swiss-minimal", badge: "badge/06-thermal-mono" } as const;
const preset = (id: string) => ({ id, options: {}, bindings: {}, accent: null });

/** What B's GET .../layout says of the bindable fields (app/api/doc_presets/values.py bindable). */
const BINDABLE = {
  ticket: [{ token: "tagline", auto: "Hidden: events have no subtitle" }, { token: "gate", auto: "Hidden: no seating" }, { token: "event_name", auto: null }],
  certificate: [{ token: "grade", auto: "The competition placing, if any" }, { token: "logo_src", auto: null, image: true }, { token: "signature_src", auto: null, image: true }],
  badge: [{ token: "zone", auto: null }, { token: "organization", auto: "The guest's organisation, from their app profile" }, { token: "job_title", auto: "Hidden unless you bind it" }, { token: "photo_url", auto: "The form's photo answer", image: true }],
};

const LAYERS = [
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

const design = (kind: DesignKind, over: Partial<Record<string, unknown>> = {}) =>
  layerDesignSchema.parse({
    eventId: 42,
    kind,
    audience: "event_default",
    canvas: { width: 1560, height: 690, background: "#FFFFFF", templateKey: null, templatePreprinted: false, area: null },
    layers: LAYERS,
    page: { widthMm: 203.2, heightMm: null },
    version: 0,
    isOwn: false,
    fromStarter: true,
    brand: { orgName: "Code Club", primary: "#0F8A73", secondary: "#141614", logoUrl: null },
    starters: {},
    tokens: [
      { key: "attendee_name", group: "Guest", label: "Name", sample: "Asha Rao" },
      { key: "field.designation", group: "Guest fields", label: "Designation", sample: "‹Designation›" },
    ],
    qrRequired: kind !== "certificate",
    sampleValues: { attendee_name: "Asha Rao" },
    ...(kind === "agenda"
      ? {}
      : {
          active: "preset",
          preset: preset(DEFAULTS[kind]),
          presetDefault: preset(DEFAULTS[kind]),
          catalogue: CATALOGUE[kind],
          bindable: BINDABLE[kind],
          hasLayout: false,
          questions: [
            { key: "designation", label: "Designation", type: "text", token: "field.designation" },
            { key: "headshot", label: "Headshot", type: "image", token: "field.headshot" },
          ],
          hasPhotoQuestion: false,
        }),
    ...over,
  });

const EVENT: DesignScope = { kind: "event", eventId: 42 };
const open = (scope: DesignScope = EVENT) => render(<DesignerPage scope={scope} />);
const saveBar = () => screen.getByRole("region", { name: "Save" });
const tab = async (name: string) => fireEvent.click(await screen.findByRole("tab", { name }));
const pick = async (name: RegExp) => fireEvent.click(await screen.findByRole("button", { name }));

beforeEach(() => {
  state.designs = { ticket: design("ticket"), badge: design("badge"), certificate: design("certificate"), agenda: design("agenda") };
  savePreset.mockReset();
  applyIssued.mockReset();
  certificates.summary = undefined;
  saveLayout.mockReset();
  reset.mockReset();
  previewHtml.mockClear();
});

describe("the gallery", () => {
  it("shows the ready designs first, the one in use marked, then the ways to make your own", async () => {
    open();
    expect(await screen.findByRole("heading", { name: "Ready designs" })).toBeInTheDocument();
    const inUse = screen.getByRole("button", { name: /Daylight Boarding Pass/ });
    expect(within(inUse).getByText("In use")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Midnight Arcade/ })).toBeInTheDocument();
    // The picture is the designer's preview, shipped as WebP.
    expect(inUse.querySelector("img")).toHaveAttribute("src", "/designs/ticket/03-daylight-boarding-pass.webp");
    expect(screen.getByRole("heading", { name: "Make your own" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Custom design/ })).toBeInTheDocument();
    // Card (CR80) is for badges only.
    expect(screen.queryByRole("button", { name: /Card \(CR80\)/ })).not.toBeInTheDocument();
  });

  it("filters badges by photo and by printer, and offers the CR80 card", async () => {
    open();
    await tab("ID card");
    const list = () => screen.getAllByRole("listitem").map((li) => li.querySelector(".font-medium")?.textContent);
    await screen.findByRole("button", { name: /Thermal Mono/ });
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Photo" })).getByRole("radio", { name: "With photo" }));
    expect(list()).toEqual(["Ticket Stub", "Custom design", "Card (CR80)"]);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Photo" })).getByRole("radio", { name: "All" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Printer" })).getByRole("radio", { name: "Black and white" }));
    expect(list()).toEqual(["Thermal Mono", "Custom design", "Card (CR80)"]);
  });

  it("opens the canvas from Custom design, with a way back and the design it would replace", async () => {
    open();
    await pick(/Custom design/);
    expect(await screen.findByRole("region", { name: "Layers" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Canvas" })).toBeInTheDocument();
    expect(screen.getByText(/Tickets use the Daylight Boarding Pass design now/)).toBeInTheDocument();
    // The ticket's old layouts are gone: nothing to start from but the canvas.
    expect(screen.queryByRole("button", { name: /Layouts/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /All designs/ }));
    expect(await screen.findByRole("heading", { name: "Ready designs" })).toBeInTheDocument();
  });

  it("opens the CR80 card on the canvas, unsaved, and lists it as the badge's only layout", async () => {
    open();
    await tab("ID card");
    await pick(/Card \(CR80\)/);
    const layers = await screen.findByRole("region", { name: "Layers" });
    expect(within(layers).getByText("Guest photo")).toBeInTheDocument();
    expect(within(layers).getByText("Role band")).toBeInTheDocument();
    expect(within(saveBar()).getByRole("status")).toHaveTextContent(/Unsaved changes/);
    fireEvent.click(screen.getByRole("button", { name: /Layouts/ }));
    const dialog = await screen.findByRole("dialog", { name: "Start from a layout" });
    const layouts = within(dialog).getAllByRole("radio");
    expect(layouts).toHaveLength(1);
    expect(layouts[0]).toHaveTextContent(/Card \(CR80\)For card printers/);
  });

  it("keeps the programme on the canvas, with its layouts", async () => {
    open();
    await tab("Programme");
    expect(await screen.findByRole("region", { name: "Layers" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ready designs" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Layouts/ })).toBeInTheDocument();
  });
});

describe("a design's settings", () => {
  it("previews in a frame sandboxed to scripts only, filled by the server", async () => {
    open();
    await pick(/Daylight Boarding Pass/);
    const frame = await screen.findByTitle("Daylight Boarding Pass, live preview");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toMatch(/allow-same-origin/);
    expect(frame.getAttribute("srcdoc")).toContain("Filled by the server");
    expect(previewHtml).toHaveBeenCalledWith(EVENT, "ticket", "event_default", { id: "ticket/03-daylight-boarding-pass", options: {}, bindings: {}, accent: null }, null, expect.any(AbortSignal));
  });

  it("chooses another design and saves its id, options, bindings and accent", async () => {
    savePreset.mockResolvedValue(design("certificate"));
    open();
    await tab("Certificate");
    await pick(/Midnight Deco/);
    expect(within(saveBar()).getByRole("status")).toHaveTextContent("Not saved yet · Midnight Deco is not in use until you save it");
    const settings = screen.getByRole("region", { name: "Settings" });
    const wording = within(settings).getByLabelText("Wording");
    expect(within(wording).getAllByRole("option").map((o) => o.textContent)).toEqual(["Participation", "Achievement"]);
    fireEvent.change(wording, { target: { value: "participation" } });
    fireEvent.change(within(settings).getByLabelText("Title"), { target: { value: "Certificate of Merit" } });
    fireEvent.click(within(settings).getByRole("radio", { name: "#D9D9DE" }));
    fireEvent.click(within(saveBar()).getByRole("button", { name: /Save design/ }));
    await waitFor(() =>
      expect(savePreset).toHaveBeenCalledWith({
        id: "certificate/02-midnight-deco",
        options: { wording: "participation", text: { title: "Certificate of Merit" } },
        bindings: {},
        accent: "#d9d9de",
      })
    );
  });

  it("refuses to save an empty title, an over-long one, or a colour that is not one", async () => {
    open();
    await tab("Certificate");
    await pick(/Swiss Minimal/);
    const settings = screen.getByRole("region", { name: "Settings" });
    const title = within(settings).getByLabelText("Title");
    fireEvent.change(title, { target: { value: "" } });
    expect(within(settings).getByText("Title can't be empty.")).toBeInTheDocument();
    expect(title).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(title, { target: { value: "A title far too long to fit" } });
    expect(within(settings).getByText("Title is 27 characters; keep it to 20.")).toBeInTheDocument();
    fireEvent.change(title, { target: { value: "Certificate" } });
    fireEvent.change(within(settings).getByLabelText("Accent colour as hex"), { target: { value: "#12" } });
    expect(within(settings).getByText("Pick a colour, or type one as #RRGGBB.")).toBeInTheDocument();
    expect(screen.getByText(/Fix the marked settings to update it/)).toBeInTheDocument();
    fireEvent.click(within(saveBar()).getByRole("button", { name: /Save design/ }));
    expect(savePreset).not.toHaveBeenCalled();
  });

  it("shows the server's refusal next to the field it names", async () => {
    savePreset.mockRejectedValue(
      new ApiError({ message: "This design's settings need attention.", status: 422, fieldErrors: { fields: { "options.text.title": "At most 200 characters." } } as never })
    );
    open();
    await tab("Certificate");
    await pick(/Midnight Deco/);
    fireEvent.click(within(saveBar()).getByRole("button", { name: /Save design/ }));
    expect(await within(screen.getByRole("region", { name: "Settings" })).findByText("At most 200 characters.")).toBeInTheDocument();
    expect(serverProblems(new ApiError({ message: "x", status: 422, fieldErrors: { "body.accent": ["A hex colour like #1db9a0."] } }))).toEqual(
      new Map([["accent", "A hex colour like #1db9a0."]])
    );
  });

  it("warns when the colour is hard to see on the design", async () => {
    open();
    await tab("Certificate");
    await pick(/Swiss Minimal/);
    const settings = screen.getByRole("region", { name: "Settings" });
    fireEvent.change(within(settings).getByLabelText("Accent colour as hex"), { target: { value: "#FFE066" } });
    expect(within(settings).getByText(/This colour is hard to see on this design \(\d\.\d:1\)\. Try a darker one/)).toBeInTheDocument();
  });

  it("binds optional fields to a fixed text, a sign-up question, or nothing", async () => {
    savePreset.mockResolvedValue(design("badge"));
    open();
    await tab("ID card");
    await pick(/Thermal Mono/);
    const fields = within(screen.getByRole("region", { name: "Settings" })).getByRole("list", { name: "Fields" });
    expect(within(fields).getAllByRole("listitem")).toHaveLength(2);
    expect(within(fields).getByText("Left off: there is nothing to fill it with.")).toBeInTheDocument();
    expect(within(fields).getByText("The guest's organisation, from their app profile.")).toBeInTheDocument();

    fireEvent.change(within(fields).getByLabelText("Zone"), { target: { value: "text" } });
    fireEvent.change(within(fields).getByLabelText("Zone text"), { target: { value: "Hall B" } });
    fireEvent.change(within(fields).getByLabelText("Organisation"), { target: { value: "field" } });
    const question = within(fields).getByLabelText("Organisation question");
    expect(question).toHaveValue("designation");
    // A photo answer is never printed as text.
    expect(within(question).queryByRole("option", { name: "Headshot" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Lanyard slot" }));

    fireEvent.click(within(saveBar()).getByRole("button", { name: /Save design/ }));
    await waitFor(() =>
      expect(savePreset).toHaveBeenCalledWith({
        id: "badge/06-thermal-mono",
        options: { lanyard: false },
        bindings: { zone: { source: "text", value: "Hall B" }, organization: { source: "field", value: "designation" } },
        accent: null,
      })
    );

    fireEvent.change(within(fields).getByLabelText("Zone"), { target: { value: "hidden" } });
    expect(within(fields).getByText("Not shown.")).toBeInTheDocument();
  });

  it("says where a photo badge's photos come from when the form asks for none", async () => {
    open();
    await tab("ID card");
    await pick(/Ticket Stub/);
    const hint = within(screen.getByRole("region", { name: "Settings" })).getByText(/photos come from each guest's app profile/);
    expect(hint).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign-up questions" })).toHaveAttribute("href", "/events/42/edit#section-questions");
  });

  it("says nothing of photos when the form has a photo question", async () => {
    state.designs.badge = design("badge", { hasPhotoQuestion: true });
    open();
    await tab("ID card");
    await pick(/Ticket Stub/);
    await screen.findByRole("region", { name: "Settings" });
    expect(screen.queryByText(/photos come from each guest's app profile/)).not.toBeInTheDocument();
  });
});

describe("a certificate's pictures", () => {
  it("uploads the logo and signature as the event's artwork, at once", async () => {
    saveArtwork.mockResolvedValue({ logo: null, signature_1: "https://cdn.example/sig.png", signature_2: null });
    open();
    await tab("Certificate");
    await pick(/Swiss Minimal/);
    const pictures = within(screen.getByRole("region", { name: "Settings" }));
    expect(pictures.getByRole("button", { name: /Replace logo/ })).toBeInTheDocument();
    const sig = new File([new Uint8Array([137, 80, 78, 71])], "sig.png", { type: "image/png" });
    fireEvent.change(pictures.getByLabelText("Signature file"), { target: { files: [sig] } });
    await waitFor(() => expect(saveArtwork).toHaveBeenCalledWith({ field: "signature_1", file: sig }));
    fireEvent.click(pictures.getByRole("button", { name: "Remove the logo" }));
    await waitFor(() => expect(saveArtwork).toHaveBeenCalledWith({ field: "logo", file: null }));
    // Pictures are never bound: the design refuses it.
    expect(within(pictures.getByRole("list", { name: "Fields" })).queryByLabelText("Logo")).not.toBeInTheDocument();
  });

  it("says where the pictures come from on the club's templates", async () => {
    open({ kind: "club" });
    await tab("Certificate");
    await pick(/Swiss Minimal/);
    expect(screen.getByText(/Your club's logo is used\. Signatures are uploaded on each event's certificate design\./)).toBeInTheDocument();
    expect(screen.queryByLabelText("Signature file")).not.toBeInTheDocument();
  });
});

describe("where the design comes from", () => {
  it("says the club's own ready design is the club's, and the built-in one is built in", async () => {
    state.designs.ticket = design("ticket", { preset: { id: "ticket/02-midnight-arcade", options: {}, bindings: {}, accent: null } });
    open({ kind: "club" });
    await pick(/Midnight Arcade/);
    expect(screen.getByText(/Your club's ticket design\. Every event without its own uses it\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to the built-in design/ })).toBeInTheDocument();
  });

  it("says an event with nothing picked uses the built-in design", async () => {
    open();
    await pick(/Daylight Boarding Pass/);
    expect(screen.getByText(/Nothing is picked for this event or your club yet, so tickets use Daylight Boarding Pass/)).toBeInTheDocument();
  });

  it("puts a canvas saved here back in use, as it is", async () => {
    state.designs.ticket = design("ticket", { isOwn: true, hasLayout: true, fromStarter: false });
    open();
    await pick(/Custom design/);
    fireEvent.click(await screen.findByRole("button", { name: /Use this design/ }));
    await waitFor(() => expect(clearPreset).toHaveBeenCalled());
  });
});

describe("certificates already issued", () => {
  it("says how many keep another design, and applies the current one after asking", async () => {
    certificates.summary = { other_design: 3 };
    open();
    await tab("Certificate");
    expect(await screen.findByText(/3 certificates already issued keep the design they were issued with/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply the current design" }));
    const dialog = await screen.findByRole("dialog", { name: "Apply the current design to 3 certificates?" });
    expect(applyIssued).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: /Apply to 3 certificates/ }));
    expect(applyIssued).toHaveBeenCalled();
  });

  it("says nothing when every issued certificate is on the current design, or on the club's templates", async () => {
    certificates.summary = { other_design: 0 };
    const { unmount } = open();
    await tab("Certificate");
    await screen.findByRole("heading", { name: "Ready designs" });
    expect(screen.queryByText(/already issued keep/)).not.toBeInTheDocument();
    unmount();
    certificates.summary = { other_design: 2 };
    open({ kind: "club" });
    await tab("Certificate");
    await screen.findByRole("heading", { name: "Ready designs" });
    expect(screen.queryByText(/already issued keep/)).not.toBeInTheDocument();
  });
});
