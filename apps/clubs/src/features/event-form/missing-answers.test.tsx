import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { ApiError } from "@moa/api";
import { Form } from "@moa/ui";

import topicsFixture from "../__fixtures__/topics.json";
import clubInfoFixture from "../__fixtures__/club-info.json";
import eventFixture from "../__fixtures__/event-detail.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Changing the questions of an event people already answered
 * (missing-answers contract §1.1, §1.3, §3 item 1). A saved question keeps
 * its key whatever its label becomes, so the answers given under it stay
 * its answers; a new one takes its key from its label, never another's.
 * Saving a live event's changed questions first shows what that does to the
 * people signed up, then offers to ask them for what's new.
 */
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/events/37/edit",
  useSearchParams: () => new URLSearchParams(),
}));

const QUESTIONS = [
  { key: "status", label: "Status", field_type: "radio" as const, required: true, options: ["Student", "Working"] },
  { key: "collage", label: "Collage", field_type: "text" as const, required: true, show_if: { key: "status", any_of: ["Student"] } },
  { key: "tshirt", label: "T-shirt size", field_type: "select" as const, required: false, options: ["S", "M", "L"] },
];
const SUMMARY = {
  people: { registrations: 1, requests: 437 },
  people_missing: 0,
  questions: [
    { key: "status", label: "Status", required: true, answered: 430, blank: 8, invalid: 0, hidden: 0, missing: 8 },
    { key: "collage", label: "Collage", required: true, answered: 180, blank: 0, invalid: 0, hidden: 250, missing: 0 },
    { key: "tshirt", label: "T-shirt size", required: false, answered: 0, blank: 438, invalid: 0, hidden: 0, missing: 0 },
    { key: "why_join", label: "Why join", required: true, answered: 0, blank: 438, invalid: 0, hidden: 0, missing: 438 },
  ],
  stray: [],
  open_asks: 0,
};
const IMPACT = {
  people: { registrations: 1, requests: 437 },
  added: [{ key: "why_join", label: "Why join", required: true, askable: 438 }],
  removed: [],
  now_required: [{ key: "tshirt", label: "T-shirt size", missing: 438 }],
  options_removed: [],
  relabelled: [{ key: "collage", from: "Collage", to: "College" }],
  type_changed: [],
};

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const state: { impact: () => unknown } = { impact: () => IMPACT };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/events/categories/list") return [{ id: 1, name: "Workshop" }];
        if (path === "/api/v1/interests/list") return topicsFixture;
        if (path === "/api/v1/clubs/info") return clubInfoFixture;
        if (path === "/api/v1/events/37/answers/summary") return SUMMARY;
        if (path === "/api/v1/events/info/37") return eventFixture;
        if (path === "/api/v1/events/37/summary") return summaryFixture;
        throw new ApiError({ status: 404, message: "Not here" });
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/events/37/form/impact") return state.impact();
        if (path === "/api/v1/events/37/answers/asks/preview") return { people: 438, reach: { push: 200, email: 438, whatsapp: 0 }, whatsapp: { available: false, reason: "NO_FEATURE" } };
        throw new ApiError({ status: 404, message: "Not here" });
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return { id: 37, name: "Hack Night" };
      }),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventForm, emptyEventForm } = await import("./components/event-form");
const { QuestionsStep } = await import("./components/steps/questions-step");
type Values = import("./schemas").EventFormValues;

const saved: Values = {
  ...emptyEventForm,
  name: "Hack Night",
  category_id: 1,
  event_datetime: "2026-11-08T18:00",
  duration: 3,
  location_name: "Seminar Hall, CET",
  additional_details: QUESTIONS,
};

let form: UseFormReturn<Values>;
function Builder({ newEvent = false, questions = QUESTIONS }: { newEvent?: boolean; questions?: Values["additional_details"] }) {
  const f = useForm<Values>({ defaultValues: { ...saved, additional_details: questions } });
  React.useEffect(() => {
    form = f;
  }, [f]);
  return (
    <Form {...f}>
      <form>
        <QuestionsStep newEvent={newEvent} />
      </form>
    </Form>
  );
}
const keys = () => (form.getValues("additional_details") ?? []).map((q) => q.key);
const label = (n: number) => screen.getByRole("textbox", { name: `Question ${n}` });
const findLabel = (n: number) => screen.findByRole("textbox", { name: `Question ${n}` });
const putQuestions = () => {
  const put = calls.find((c) => c.method === "PUT");
  return put ? (JSON.parse((put.body as FormData).get("additional_details") as string) as Array<Record<string, unknown>>) : null;
};

beforeEach(() => {
  calls.length = 0;
  nav.push.mockClear();
  state.impact = () => IMPACT;
});

describe("stable keys (§1.1)", () => {
  it("keeps a saved question's key whatever its label becomes, and its children's conditions with it", async () => {
    render(<Builder />);
    fireEvent.change(label(2), { target: { value: "College" } });
    fireEvent.change(label(1), { target: { value: "Are you working or a student?" } });
    await waitFor(() => expect(form.getValues("additional_details.1.label")).toBe("College"));
    expect(keys()).toEqual(["status", "collage", "tshirt"]);
    expect(form.getValues("additional_details.1.show_if")).toEqual({ key: "status", any_of: ["Student"] });
  });

  it("gives a new question its key from its label while it is new, never one the form already has", async () => {
    render(<Builder />);
    fireEvent.click(screen.getByRole("button", { name: /Your own/ }));
    fireEvent.change(await findLabel(4), { target: { value: "Why join" } });
    await waitFor(() => expect(keys()[3]).toBe("why_join"));
    fireEvent.change(label(4), { target: { value: "Why join us?" } });
    await waitFor(() => expect(keys()[3]).toBe("why_join_us"));
    // Its label made into a key clashes with a saved one: _2.
    fireEvent.change(label(4), { target: { value: "Collage" } });
    await waitFor(() => expect(keys()[3]).toBe("collage_2"));
  });

  it("gives a starter question a key no other question has", async () => {
    render(<Builder questions={[{ key: "college", label: "University", field_type: "text", required: true }]} />);
    fireEvent.click(screen.getByRole("button", { name: "College" }));
    await waitFor(() => expect(keys()).toEqual(["college", "college_2"]));
  });

  it("lets every key follow its label on an event not saved yet", async () => {
    render(<Builder newEvent />);
    fireEvent.change(label(3), { target: { value: "Shirt size" } });
    await waitFor(() => expect(keys()[2]).toBe("shirt_size"));
  });
});

function renderEdit(status: "published" | "draft" = "published") {
  return render(<EventForm mode="edit" eventId={37} defaultValues={saved} context={{ status, registered: 1 }} />);
}
const saveButton = async () => (await screen.findAllByRole("button", { name: /Save changes/ }))[0]!;

describe("saving changed questions of a live event (§1.3, §3 item 1)", () => {
  it("says how many people answered each saved question", async () => {
    renderEdit();
    expect(await screen.findByText("Answered by 180")).toBeInTheDocument();
    expect(screen.getByText("Answered by 430")).toBeInTheDocument();
    // Nobody answered the T-shirt question: nothing said.
    expect(within(screen.getByRole("listitem", { name: /^Question 3\b/ })).queryByText(/Answered by/)).toBeNull();
  });

  it("shows what the change does to them, saves on their word with every key kept, then offers to ask them", async () => {
    renderEdit();
    await screen.findByText("Answered by 180");
    fireEvent.change(label(2), { target: { value: "College" } });
    fireEvent.click(screen.getByRole("switch", { name: "Question 3 is required" }));
    fireEvent.click(screen.getByRole("button", { name: /Your own/ }));
    fireEvent.change(await findLabel(4), { target: { value: "Why join" } });
    fireEvent.click(await saveButton());

    const dialog = await screen.findByRole("alertdialog", { name: "Change the questions for 438 people?" });
    const impact = calls.find((c) => c.path === "/api/v1/events/37/form/impact")!;
    expect((impact.body as { additional_details: Array<{ key: string }> }).additional_details.map((q) => q.key)).toEqual(["status", "collage", "tshirt", "why_join"]);
    expect(within(dialog).getByText("Reworded — answers kept")).toBeInTheDocument();
    expect(within(dialog).getByText("“Collage” → “College”")).toBeInTheDocument();
    expect(within(dialog).getByText(/“Why join” must be answered — 438 people haven't answered it yet/)).toBeInTheDocument();
    expect(within(dialog).getByText(/“T-shirt size” — 438 people left it blank/)).toBeInTheDocument();
    // Nothing is saved until the club says so.
    expect(calls.some((c) => c.method === "PUT")).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(putQuestions()).not.toBeNull());
    expect(putQuestions()!.map((q) => [q.key, q.label, q.required])).toEqual([
      ["status", "Status", true],
      ["collage", "College", true],
      ["tshirt", "T-shirt size", true],
      ["why_join", "Why join", true],
    ]);
    // The child still names its parent by the key it was saved under.
    expect(putQuestions()![1]).toMatchObject({ show_if: { key: "status", any_of: ["Student"] }, required_when_shown: true });

    const offer = await screen.findByRole("alertdialog", { name: "Saved. Ask the people already signed up?" });
    fireEvent.click(within(offer).getByRole("button", { name: /Ask them now/ }));
    expect(await screen.findByRole("heading", { name: "Ask for missing answers" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Why join/ })).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByRole("checkbox", { name: /T-shirt size/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: /^Status/ })).toHaveAttribute("aria-checked", "false");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("goes back to editing without saving", async () => {
    renderEdit();
    fireEvent.change(await findLabel(2), { target: { value: "College" } });
    fireEvent.click(await saveButton());
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to editing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    expect(label(2)).toHaveValue("College");
  });

  it("not now: saved, and on to the event", async () => {
    renderEdit();
    fireEvent.change(await findLabel(2), { target: { value: "College" } });
    fireEvent.click(await saveButton());
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save changes" }));
    fireEvent.click(within(await screen.findByRole("alertdialog", { name: /Saved/ })).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/events/37"));
  });

  it("saves straight away when nobody has signed up yet", async () => {
    state.impact = () => ({ ...IMPACT, people: { registrations: 0, requests: 0 } });
    renderEdit();
    fireEvent.change(await findLabel(2), { target: { value: "College" } });
    fireEvent.click(await saveButton());
    await waitFor(() => expect(putQuestions()).not.toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/events/37"));
  });

  it("asks nothing when the questions didn't change, or the event is a draft, or the server has no preview yet", async () => {
    const { unmount } = renderEdit();
    fireEvent.change(document.querySelector('input[name="name"]')!, { target: { value: "Hack Night 2" } });
    fireEvent.click(await saveButton());
    await waitFor(() => expect(putQuestions()).not.toBeNull());
    expect(calls.some((c) => c.path.endsWith("/form/impact"))).toBe(false);
    unmount();

    calls.length = 0;
    const draft = renderEdit("draft");
    fireEvent.change(await findLabel(2), { target: { value: "College" } });
    fireEvent.click(await saveButton());
    await waitFor(() => expect(putQuestions()).not.toBeNull());
    expect(calls.some((c) => c.path.endsWith("/form/impact"))).toBe(false);
    draft.unmount();

    calls.length = 0;
    state.impact = () => {
      throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
    };
    renderEdit();
    fireEvent.change(await findLabel(2), { target: { value: "College" } });
    fireEvent.click(await saveButton());
    await waitFor(() => expect(putQuestions()).not.toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("says the form's own problem when the preview refuses it, and saves nothing", async () => {
    state.impact = () => {
      throw new ApiError({ status: 422, message: "'College' depends on 'Status', which must come before it.", errorCode: "INVALID_FORM" });
    };
    renderEdit();
    fireEvent.change(await findLabel(2), { target: { value: "College" } });
    fireEvent.click(await saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("'College' depends on 'Status', which must come before it.");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });
});
