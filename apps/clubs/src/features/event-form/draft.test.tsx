import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toApiError } from "@moa/api";
import { parseTopicTree } from "@moa/app-kit";

import topicsFixture from "../__fixtures__/topics.json";

/**
 * "Create from poster or message" on a new event, against
 * POST /clubs/ai/event-draft (multipart `text` and/or `file`) →
 * {draft: EventDraft, warnings}. The draft fills the form; nothing is saved
 * until the organiser saves; the running order goes to the agenda once the
 * event exists.
 */

const STATUS = { enabled: true, plan_allows: true, used: 3, limit: 150, resets_at: "2026-11-01T00:00:00+05:30", byok: false, provider: null };
const CATEGORIES = [
  { id: 1, name: "Workshop" },
  { id: 2, name: "Hackathon" },
  { id: 3, name: "Talk" },
];

const DRAFT = {
  name: "Hack Night 05: Edge AI",
  event_datetime: "2026-11-08T18:00:00+05:30",
  duration_hours: 4,
  format: "in_person",
  venue_name: "Seminar Hall",
  venue_address: "CET, Thiruvananthapuram",
  online_link: null,
  fee: 100,
  capacity: 60,
  about: "A night of building with on-device AI.",
  guidelines: "Bring a laptop and a charger.",
  category: "hackathon",
  topics: ["deep-tech"],
  interests: ["artificial-intelligence", "coding", "underwater-basket-weaving"],
  agenda: [
    { at: "18:00", title: "Doors open", by: null },
    { at: "18:30", title: "Keynote", by: "Dr. A. Kumar" },
    { at: "later", title: "Mystery", by: null },
  ],
  speakers: [{ name: "Dr. A. Kumar", designation: "Head of Research, IIT-M", bio: "Builds rovers." }],
  questions: [
    { label: "T-shirt size", type: "select", options: ["S", "M", "L"], required: true },
    { label: "GitHub profile", type: "url", options: [], required: false },
    { label: "Dietary needs", type: "checkbox", options: [], required: false },
  ],
};
const WARNING = "No end time on the poster, so 4 hours is a guess. Please check it.";

type Answer = unknown | (() => unknown);
const state: { status: Answer; draft: Answer; ent: Answer } = { status: STATUS, draft: { draft: DRAFT, warnings: [WARNING] }, ent: {} };
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

async function answer(value: Answer) {
  const v = typeof value === "function" ? await (value as () => unknown)() : value;
  if (v instanceof Error) throw v;
  return v;
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/ai/status") return answer(state.status);
        if (path === "/api/v1/events/categories/list") return CATEGORIES;
        if (path === "/api/v1/interests/list") return topicsFixture;
        if (path === "/api/v1/clubs/entitlements") return answer(state.ent);
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/clubs/ai/event-draft") return answer(state.draft);
        if (/^\/api\/v1\/events\/\d+\/agenda$/.test(path)) {
          const b = body as Record<string, unknown>;
          return { id: `a${calls.length}`, event_id: 77, sort_order: 0, parallel: false, speaker_photo_key: null, speaker_photo_url: null, ...b };
        }
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventForm, emptyEventForm } = await import("./components/event-form");
const { draftToFormValues } = await import("./mapper");
const { saveDraftAgenda } = await import("./api");
const { eventDraftSchema } = await import("@/features/ai");
type Values = import("./schemas").EventFormValues;

const tree = parseTopicTree(topicsFixture);
const draft = (over: Record<string, unknown> = {}) => eventDraftSchema.parse({ ...DRAFT, ...over });
const ctx = (over: Partial<Parameters<typeof draftToFormValues>[1]> = {}) => ({
  current: emptyEventForm,
  dirty: new Set<string>(),
  mode: "keep" as const,
  categories: CATEGORIES,
  tree,
  feeLocked: false,
  ...over,
});

/** The form keeps datetime-local values on this browser's clock. */
function localOf(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

beforeEach(() => {
  calls.length = 0;
  state.status = STATUS;
  state.draft = { draft: DRAFT, warnings: [WARNING] };
  state.ent = {};
});

// ─── The mapping ─────────────────────────────────────────────────────────

describe("a draft onto the form (draftToFormValues)", () => {
  it("maps every field the draft has onto the form's own", () => {
    const { patch, notes } = draftToFormValues(draft(), ctx());
    expect(patch).toMatchObject({
      name: "Hack Night 05: Edge AI",
      category_id: 2,
      about: "A night of building with on-device AI.",
      event_guidelines: "Bring a laptop and a charger.",
      event_datetime: localOf(DRAFT.event_datetime),
      duration: 4,
      is_online: false,
      location_name: "Seminar Hall, CET, Thiruvananthapuram",
      has_fee: true,
      reg_fee: 100,
      max_participants: 60,
      // Interests by slug through the tree; the topic follows from them.
      interest_ids: [8, 6],
      agenda: [
        { at: "18:00", title: "Doors open", by: "" },
        { at: "18:30", title: "Keynote", by: "Dr. A. Kumar" },
      ],
      speakers: [{ name: "Dr. A. Kumar", designation: "Head of Research, IIT-M", bio: "Builds rovers.", link: "" }],
      additional_details: [
        // A select is one choice of several: the form's radio.
        { key: "t_shirt_size", label: "T-shirt size", field_type: "radio", required: true, options: ["S", "M", "L"] },
        { key: "github_profile", label: "GitHub profile", field_type: "url", required: false },
        // A choice question with no choices cannot be answered: it becomes text.
        { key: "dietary_needs", label: "Dietary needs", field_type: "text", required: false },
      ],
    });
    expect(notes).toEqual(["Some agenda items had no clear time and were left out."]);
  });

  it("takes an online event's link, and never a venue for it", () => {
    const { patch } = draftToFormValues(draft({ format: "online", online_link: "https://meet.google.com/abc-defg-hij" }), ctx());
    expect(patch).toMatchObject({ is_online: true, url: "https://meet.google.com/abc-defg-hij" });
    expect(patch).not.toHaveProperty("location_name");
    expect(draftToFormValues(draft({ format: "online", online_link: "meet.google.com/abc" }), ctx()).patch).not.toHaveProperty("url");
  });

  it("keeps what the organiser typed, adds what they lack, and fills fields still at their default", () => {
    const current: Values = {
      ...emptyEventForm,
      name: "My name for it",
      about: "",
      duration: 2,
      interest_ids: [31],
      speakers: [{ name: "dr. a. kumar", designation: "", bio: "", link: "" }],
      additional_details: [{ key: "t_shirt_size", label: "T-shirt size", field_type: "radio", required: true, options: ["M"] }],
    };
    const { patch } = draftToFormValues(draft(), ctx({ current, dirty: new Set(["name", "about", "interest_ids", "speakers", "additional_details"]) }));
    expect(patch).not.toHaveProperty("name");
    // Typed into and emptied again: still empty, so filled.
    expect(patch.about).toBe("A night of building with on-device AI.");
    // Never touched: the default 2 hours gives way.
    expect(patch.duration).toBe(4);
    expect(patch.interest_ids).toEqual([31, 8, 6]);
    // The same speaker is not added twice.
    expect(patch).not.toHaveProperty("speakers");
    // The organiser's question stays; the new ones get keys of their own.
    expect(patch.additional_details!.map((q) => q.key)).toEqual(["t_shirt_size", "github_profile", "dietary_needs"]);
    expect(patch.additional_details![0]).toMatchObject({ options: ["M"] });
  });

  it("replaces when asked, and drops a pin picked for the old venue", () => {
    const current: Values = { ...emptyEventForm, name: "Mine", location_name: "Old hall", lat: 8.5, lng: 76.9, geo_source: "manual", speakers: [{ name: "Someone else", designation: "", bio: "", link: "" }] };
    const { patch } = draftToFormValues(draft(), ctx({ current, dirty: new Set(["name", "location_name", "speakers"]), mode: "replace" }));
    expect(patch).toMatchObject({ name: "Hack Night 05: Edge AI", location_name: "Seminar Hall, CET, Thiruvananthapuram", lat: null, lng: null, geo_source: null });
    expect(patch.speakers!.map((s) => s.name)).toEqual(["Dr. A. Kumar"]);
  });

  it("does not switch on paid entry the plan lacks, and says so", () => {
    const { patch, notes } = draftToFormValues(draft(), ctx({ feeLocked: true }));
    expect(patch).not.toHaveProperty("has_fee");
    expect(patch).not.toHaveProperty("reg_fee");
    expect(notes).toContain("It mentions a ₹100 fee, but paid entry isn't on your plan, so the event is free for now.");
  });

  it("says what it could not place: an unknown kind of event, interests not on the list", () => {
    const { patch, notes } = draftToFormValues(draft({ category: "Gala dinner", interests: ["nothing-like-this"], agenda: [] }), ctx());
    expect(patch).not.toHaveProperty("category_id");
    expect(patch).not.toHaveProperty("interest_ids");
    expect(notes).toEqual(["“Gala dinner” isn't one of the kinds of event. Choose the closest one.", "None of the interests it suggested are on the list. Pick them under Reach and rules."]);
  });

  it("leaves alone what the draft did not find (a null fee is not free)", () => {
    const { patch } = draftToFormValues(
      draft({ name: null, event_datetime: null, duration_hours: null, fee: null, capacity: null, format: null, venue_name: null, venue_address: null, about: null, guidelines: null, category: null, interests: [], agenda: [], speakers: [], questions: [] }),
      ctx({ current: { ...emptyEventForm, has_fee: true, reg_fee: 50 } }),
    );
    expect(patch).toEqual({});
  });

  it("uses the image it read as the poster, unless one is already chosen", () => {
    const poster = new File(["x"], "poster.png", { type: "image/png" });
    expect(draftToFormValues(draft(), ctx({ poster })).patch.posterFile).toBe(poster);
    const mine = new File(["y"], "mine.png", { type: "image/png" });
    expect(draftToFormValues(draft(), ctx({ poster, current: { ...emptyEventForm, posterFile: mine } })).patch).not.toHaveProperty("posterFile");
  });
});

describe("the running order, once the event exists", () => {
  it("goes to the agenda in order, at its times on the event's day", async () => {
    const result = await saveDraftAgenda(77, "2026-11-08T18:00", [
      { at: "18:00", title: "Doors open", by: "" },
      { at: "18:30", title: "Keynote", by: "Dr. A. Kumar" },
    ]);
    expect(result).toEqual({ saved: 2, failed: 0 });
    const sent = calls.filter((c) => c.path === "/api/v1/events/77/agenda").map((c) => c.body);
    expect(sent).toEqual([
      { starts_at: new Date("2026-11-08T18:00").toISOString(), ends_at: null, title: "Doors open", description: null, speaker: null, location: null },
      { starts_at: new Date("2026-11-08T18:30").toISOString(), ends_at: null, title: "Keynote", description: null, speaker: "Dr. A. Kumar", location: null },
    ]);
  });

  it("cannot be timed without the event's day", async () => {
    expect(await saveDraftAgenda(77, "", [{ at: "18:00", title: "Doors open" }])).toEqual({ saved: 0, failed: 1 });
    expect(calls).toHaveLength(0);
  });
});

// ─── The dialog, on a new event ──────────────────────────────────────────

const nameInput = () => document.querySelector<HTMLInputElement>('input[name="name"]')!;
const itemOf = (el: Element) => el.closest<HTMLElement>('[data-slot="form-item"]')!;

async function openDraft() {
  fireEvent.click(await screen.findByRole("button", { name: /Create from poster or message/ }));
  return screen.findByRole("dialog", { name: /Create from poster or message/ });
}

function choose(dialog: HTMLElement, file: File) {
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("Create from poster or message", () => {
  it("reads a poster and a message, fills the form, marks what it filled, and saves nothing", async () => {
    render(<EventForm mode="create" />);
    // Interests and kinds of event are loaded with the form, as on the page.
    await screen.findByRole("checkbox", { name: "Robotics" });
    const dialog = await openDraft();
    expect(within(dialog).getByText("AI actions: 3 of 150 this month, resets 1 Nov")).toBeInTheDocument();
    const draftButton = within(dialog).getByRole("button", { name: "Draft my event" });
    expect(draftButton).toBeDisabled();

    const poster = new File(["png"], "poster.png", { type: "image/png" });
    choose(dialog, poster);
    expect(await within(dialog).findByText("poster.png")).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: "The poster you chose" })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/Anything to add/), { target: { value: "Entry ₹100, 60 seats" } });
    fireEvent.click(draftButton);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const sent = calls.find((c) => c.path === "/api/v1/clubs/ai/event-draft")!.body as FormData;
    expect(sent).toBeInstanceOf(FormData);
    expect((sent.get("file") as File).name).toBe("poster.png");
    expect(sent.get("text")).toBe("Entry ₹100, 60 seats");

    // The warnings, over the form, before anything else.
    const summary = await screen.findByRole("region", { name: "What AI filled in" });
    expect(within(summary).getByRole("alert")).toHaveTextContent(WARNING);
    expect(within(summary).getByRole("alert")).toHaveTextContent("Some agenda items had no clear time and were left out.");
    expect(summary).toHaveTextContent(/AI filled \d+ fields/);

    // The fields.
    expect(nameInput()).toHaveValue("Hack Night 05: Edge AI");
    expect(document.querySelector('textarea[name="about"]')).toHaveValue("A night of building with on-device AI.");
    expect(screen.getByRole("combobox", { name: /Venue/ })).toHaveValue("Seminar Hall, CET, Thiruvananthapuram");
    expect(document.querySelector("#ev-date")).toHaveValue(localOf(DRAFT.event_datetime).slice(0, 10));
    expect(document.querySelector('input[name="max_participants"]')).toHaveValue(60);
    expect(screen.getByRole("switch", { name: "Paid entry" })).toBeChecked();
    expect(document.querySelector('input[name="reg_fee"]')).toHaveValue(100);
    expect(screen.getByRole("checkbox", { name: /Artificial Intelligence/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Coding" })).toBeChecked();
    expect(document.querySelector('input[name="speakers.0.name"]')).toHaveValue("Dr. A. Kumar");
    expect(document.querySelector('input[name="additional_details.0.label"]')).toHaveValue("T-shirt size");
    const running = screen.getByRole("list", { name: "Running order" });
    expect(within(running).getAllByRole("listitem")).toHaveLength(2);
    expect(document.querySelector('input[name="agenda.1.title"]')).toHaveValue("Keynote");
    expect(document.querySelector('input[name="agenda.1.at"]')).toHaveValue("18:30");

    // Marked until changed.
    expect(within(itemOf(nameInput())).getByText("filled by AI, check it")).toBeInTheDocument();
    fireEvent.change(nameInput(), { target: { value: "Hack Night 05" } });
    await waitFor(() => expect(within(itemOf(nameInput())).queryByText("filled by AI, check it")).not.toBeInTheDocument());
    expect(within(itemOf(document.querySelector('textarea[name="about"]')!)).getByText("filled by AI, check it")).toBeInTheDocument();

    // Nothing was saved.
    expect(calls.some((c) => c.path === "/api/v1/events/create")).toBe(false);
  });

  it("keeps what the organiser already typed unless they choose Replace", async () => {
    render(<EventForm mode="create" />);
    await screen.findByRole("checkbox", { name: "Robotics" });
    fireEvent.change(nameInput(), { target: { value: "Our own name" } });

    let dialog = await openDraft();
    const group = within(dialog).getByRole("radiogroup", { name: "What happens to what you typed" });
    expect(within(group).getByRole("radio", { name: /Keep what I typed/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.change(within(dialog).getByLabelText("Or paste the message"), { target: { value: "Hack night on the 8th, 6pm, Seminar Hall" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Draft my event" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(nameInput()).toHaveValue("Our own name");
    expect(document.querySelector('textarea[name="about"]')).toHaveValue("A night of building with on-device AI.");
    // Only text was sent.
    const sent = calls.find((c) => c.path === "/api/v1/clubs/ai/event-draft")!.body as FormData;
    expect(sent.get("file")).toBeNull();

    dialog = await openDraft();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Replace/ }));
    fireEvent.change(within(dialog).getByLabelText("Or paste the message"), { target: { value: "Same again" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Draft my event" }));
    await waitFor(() => expect(nameInput()).toHaveValue("Hack Night 05: Edge AI"));
  });

  it("refuses a file it cannot read before sending it", async () => {
    render(<EventForm mode="create" />);
    const dialog = await openDraft();
    choose(dialog, new File(["gif"], "poster.gif", { type: "image/gif" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Use a PNG, JPEG or WebP image, or a PDF.");
    const big = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    choose(dialog, big);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("That file is over 10 MB.");
    expect(within(dialog).getByRole("button", { name: "Draft my event" })).toBeDisabled();
  });

  it("explains a spent month, and leaves the form as it was", async () => {
    state.draft = () => toApiError(new Response(JSON.stringify({ message: "Quota", error_code: "AI_QUOTA_REACHED" }), { status: 429, headers: { "Content-Type": "application/json" } }));
    render(<EventForm mode="create" />);
    const dialog = await openDraft();
    fireEvent.change(within(dialog).getByLabelText("Or paste the message"), { target: { value: "Hack night" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Draft my event" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("You've used all 150 AI actions this month. They reset on 1 Nov.");
    expect(nameInput()).toHaveValue("");
  });

  it("is not there while AI is off, nor on an event being edited", async () => {
    state.status = { ...STATUS, enabled: false };
    render(<EventForm mode="create" />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/ai/status")).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("button", { name: /Create from poster or message/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Write with AI/ })).not.toBeInTheDocument();
  });
});
