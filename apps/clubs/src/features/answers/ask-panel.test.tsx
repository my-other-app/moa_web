import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import eventFixture from "../__fixtures__/event-detail.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * The Ask panel and the asks list (missing-answers contract §2.1, §3 items
 * 4–5), against the contract's shapes with the API mocked: what is ticked,
 * who it reaches on each channel, WhatsApp greyed out with its reason, the
 * message written for them, the deadline, the preview, and exactly what Send
 * sends -- once, however often it is pressed. Then each ask's progress, Remind
 * now (and its refusals) and Close, and who may press them.
 */
const SUMMARY = {
  people: { registrations: 1, requests: 437 },
  people_missing: 62,
  questions: [
    { key: "t_shirt_size", label: "T-shirt size", required: true, answered: 400, blank: 30, invalid: 2, hidden: 6, missing: 32 },
    { key: "why", label: "Why do you want to come?", required: true, answered: 408, blank: 30, invalid: 0, hidden: 0, missing: 30 },
    { key: "diet", label: "Diet", required: false, answered: 10, blank: 428, invalid: 0, hidden: 0, missing: 0 },
  ],
  stray: [],
  open_asks: 1,
};
const ASK = {
  id: "a1",
  created_at: "2026-11-08T10:00:00+05:30",
  created_by: "Haritha",
  questions: [{ key: "t_shirt_size", label: "T-shirt size" }],
  channels: ["push", "email"],
  message: "We need 1 more detail.",
  deadline: null,
  remind_after_hours: 48,
  status: "open",
  counts: { people: 62, sent: 62, failed: 0, opened: 40, answered: 31, still_askable: 31 },
  reminders_sent: 1,
  next_reminder_at: null,
};
const DOOR_CAN = { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: false, delete_events: false, door: true };
const me = (role: "door" | "editor") => ({ role, role_label: role, role_description: "", can: { ...DOOR_CAN, edit_events: role === "editor" }, club_id: 5, club_name: "Circuit Society", member: null });

const posts: Array<{ path: string; body: unknown }> = [];
const state: {
  me: ReturnType<typeof me>;
  whatsapp: { available: boolean; reason: string | null };
  create: (body: unknown) => unknown;
  remind: () => unknown;
} = { me: me("editor"), whatsapp: { available: false, reason: "NOT_CONNECTED" }, create: () => ASK, remind: () => ASK };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/clubs/access/me")) return state.me;
        if (path === "/api/v1/events/info/37") return eventFixture;
        if (path === "/api/v1/events/37/summary") return summaryFixture;
        if (path === "/api/v1/events/37/answers/summary") return SUMMARY;
        if (path === "/api/v1/events/37/answers/asks") return { asks: [ASK, { ...ASK, id: "a0", questions: [{ key: "why", label: "Why do you want to come?" }], status: "closed", reminders_sent: 2 }] };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        posts.push({ path, body });
        if (path === "/api/v1/events/37/answers/asks/preview") {
          const b = body as { questions: string[]; refs: string[] | null };
          const people = b.refs ? 1 : b.questions.length * 31;
          return { people, reach: { push: Math.round(people * 0.6), email: people, whatsapp: 0 }, whatsapp: state.whatsapp };
        }
        if (path === "/api/v1/events/37/answers/asks") return state.create(body);
        if (path === "/api/v1/events/37/answers/asks/a1/remind") return state.remind();
        if (path === "/api/v1/events/37/answers/asks/a1/close") return { ...ASK, status: "closed" };
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { AskPanel } = await import("./components/ask-panel");
const { AsksPanel } = await import("./components/asks-panel");

const box = (name: RegExp) => screen.getByRole("checkbox", { name });
const sends = () => posts.filter((p) => p.path === "/api/v1/events/37/answers/asks");
const previews = () => posts.filter((p) => p.path.endsWith("/asks/preview"));

beforeEach(() => {
  posts.length = 0;
  state.me = me("editor");
  state.whatsapp = { available: false, reason: "NOT_CONNECTED" };
  state.create = () => ASK;
  state.remind = () => ASK;
  vi.restoreAllMocks();
});

describe("the Ask panel", () => {
  it("ticks what it was opened with, and counts who that reaches on each channel", async () => {
    render(<AskPanel eventId={37} target={{ preselect: ["why"] }} onOpenChange={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Ask for missing answers" })).toBeInTheDocument();
    await waitFor(() => expect(box(/Why do you want to come/)).toHaveAttribute("aria-checked", "true"));
    expect(box(/T-shirt size/)).toHaveAttribute("aria-checked", "false");
    // Who it reaches, from the preview: one question ticked → 31 people.
    expect(await screen.findByText("31 people")).toBeInTheDocument();
    expect(screen.getByText("19 can get it")).toBeInTheDocument();
    expect(previews().at(-1)!.body).toEqual({ questions: ["why"], include_requests: true, refs: null });
  });

  it("ticks every question someone is missing when opened on nothing in particular", async () => {
    render(<AskPanel eventId={37} target={{}} onOpenChange={() => {}} />);
    await waitFor(() => expect(box(/T-shirt size/)).toHaveAttribute("aria-checked", "true"));
    expect(box(/Why do you want to come/)).toHaveAttribute("aria-checked", "true");
    expect(box(/Diet/)).toHaveAttribute("aria-checked", "false");
    // The message counts what is asked, until the club writes its own.
    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue("We need 2 more details for your SF Sea Hackathon registration. It takes a minute, and your ticket stays as it is."));
    fireEvent.click(box(/Why do you want to come/));
    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue("We need 1 more detail for your SF Sea Hackathon registration. It takes a minute, and your ticket stays as it is."));
  });

  it("greys WhatsApp out with the reason, and offers it when the club's WhatsApp can send", async () => {
    const { unmount } = render(<AskPanel eventId={37} target={{}} onOpenChange={() => {}} />);
    expect(await screen.findByText(/Connect your club's WhatsApp number first/)).toBeInTheDocument();
    expect(box(/WhatsApp/)).toBeDisabled();
    expect(box(/WhatsApp/)).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("link", { name: "Connect WhatsApp" })).toHaveAttribute("href", "/whatsapp/settings");
    unmount();
    state.whatsapp = { available: true, reason: null };
    render(<AskPanel eventId={37} target={{}} onOpenChange={() => {}} />);
    await waitFor(() => expect(box(/WhatsApp/)).toBeEnabled());
    expect(box(/WhatsApp/)).toHaveAttribute("aria-checked", "true");
  });

  it("refuses a deadline that has passed", async () => {
    render(<AskPanel eventId={37} target={{}} onOpenChange={() => {}} />);
    const deadline = await screen.findByLabelText(/Deadline/);
    fireEvent.change(deadline, { target: { value: "2020-01-01T10:00" } });
    expect((await screen.findAllByText("Pick a time that's still ahead.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^Send/ })).toBeDisabled();
  });

  it("previews the email, the app notification and the WhatsApp template", async () => {
    render(<AskPanel eventId={37} target={{ preselect: ["t_shirt_size"] }} onOpenChange={() => {}} />);
    const preview = await screen.findByTestId("ask-preview");
    await waitFor(() => expect(preview).toHaveTextContent("SF Sea Hackathon needs 1 more detail from you"));
    expect(within(preview).getByText("T-shirt size")).toBeInTheDocument();
    expect(within(preview).getByText("Add my details")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "App" }));
    expect(preview).toHaveTextContent("SF Sea Hackathon needs 1 more detail");
    fireEvent.click(screen.getByRole("radio", { name: "WhatsApp" }));
    expect(preview).toHaveTextContent("Hi Haritha, SF Sea Hackathon needs 1 more details for your registration. Please add them by the event.");
  });

  it("sends exactly what the contract asks, once however often Send is pressed", async () => {
    let release: (v: unknown) => void = () => {};
    state.create = () => new Promise((r) => (release = r));
    const onSent = vi.fn();
    const onOpenChange = vi.fn();
    const success = vi.spyOn(toast, "success");
    render(<AskPanel eventId={37} target={{ preselect: ["t_shirt_size", "why"] }} onOpenChange={onOpenChange} onSent={onSent} />);
    const send = await screen.findByRole("button", { name: "Send to 62 people" });
    await waitFor(() => expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toContain("SF Sea Hackathon"));
    fireEvent.click(send);
    fireEvent.click(send);
    expect(await screen.findByRole("button", { name: /Sending/ })).toBeDisabled();
    release(ASK);
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(sends()).toHaveLength(1);
    const body = sends()[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({
      questions: ["t_shirt_size", "why"],
      channels: ["push", "email"],
      message: "We need 2 more details for your SF Sea Hackathon registration. It takes a minute, and your ticket stays as it is.",
      deadline: null,
      remind_after_hours: 48,
      include_requests: true,
      refs: null,
    });
    expect(typeof body.client_ref).toBe("string");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(success).toHaveBeenCalledWith("Asked 62 people", expect.anything());
  });

  it("asks one person again by their ref, and can leave out the reminder and the requests", async () => {
    render(<AskPanel eventId={37} target={{ refs: ["q9a2e"], preselect: ["why"], who: "Ananya" }} onOpenChange={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Ask Ananya again" })).toBeInTheDocument();
    // One person: the requests switch has nothing to say.
    expect(screen.queryByRole("switch", { name: "Include registrations under review" })).toBeNull();
    fireEvent.click(await screen.findByRole("switch", { name: /Remind them after 48 hours/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to 1 person" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]!.body).toMatchObject({ questions: ["why"], refs: ["q9a2e"], remind_after_hours: null });
  });

  it("stays open and says why when there is nobody to ask any more", async () => {
    state.create = () => {
      throw new ApiError({ status: 409, message: "Nothing to ask.", errorCode: "NOTHING_TO_ASK" });
    };
    const error = vi.spyOn(toast, "error");
    const onOpenChange = vi.fn();
    render(<AskPanel eventId={37} target={{ preselect: ["why"] }} onOpenChange={onOpenChange} />);
    fireEvent.click(await screen.findByRole("button", { name: "Send to 31 people" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Nobody is missing these answers any more, so there's nobody to ask."));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("the asks list", () => {
  it("shows each ask's progress: sent, opened, answered with the share, still missing", async () => {
    render(<AsksPanel eventId={37} />);
    const open = await screen.findByRole("listitem", { name: "Ask for T-shirt size" });
    expect(within(open).getByText("Open")).toBeInTheDocument();
    expect(within(open).getByText("31 (50%)")).toBeInTheDocument();
    expect(within(open).getByText("Sent").nextSibling).toHaveTextContent("62");
    expect(within(open).getByText("Opened").nextSibling).toHaveTextContent("40");
    expect(within(open).getByText("Still missing").nextSibling).toHaveTextContent("31");
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("reminds now, and says when it's too soon", async () => {
    state.remind = () => {
      throw new ApiError({ status: 409, message: "Too soon.", errorCode: "REMIND_TOO_SOON", fieldErrors: { retry_after: [5400] as unknown as string[] } });
    };
    const error = vi.spyOn(toast, "error");
    render(<AsksPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Remind the 31 people still missing T-shirt size/ }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("The last reminder went less than 12 hours ago. You can remind them again in 2 h."));
    expect(posts.some((p) => p.path.endsWith("/asks/a1/remind"))).toBe(true);
  });

  it("closes an ask", async () => {
    render(<AsksPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Close the ask for T-shirt size" }));
    await waitFor(() => expect(posts.some((p) => p.path === "/api/v1/events/37/answers/asks/a1/close")).toBe(true));
  });

  it("shows door staff the progress, and nothing to press", async () => {
    state.me = me("door");
    render(<AsksPanel eventId={37} />);
    expect((await screen.findAllByText("31 (50%)")).length).toBe(2);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Remind/ })).toBeNull());
    expect(screen.queryByRole("button", { name: /Close the ask/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ask for missing answers/ })).toBeNull();
  });
});
