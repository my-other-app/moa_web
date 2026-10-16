import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import detail from "../__fixtures__/event-detail.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const block = (id: string, starts: string, ends: string | null, title: string, extra: object = {}) => ({ id, event_id: 37, starts_at: starts, ends_at: ends, title, description: null, speaker: null, speaker_photo_key: null, speaker_photo_url: null, location: null, sort_order: 0, parallel: false, ...extra });
// 09:00–09:30, 09:45–10:30 (a 15 minute gap), and a talk beside it in another room.
const agenda = {
  items: [
    block("a1", "2099-06-09T03:30:00Z", "2099-06-09T04:00:00Z", "Doors and registration", { location: "Foyer" }),
    block("a2", "2099-06-09T04:15:00Z", "2099-06-09T05:00:00Z", "Keynote", { speaker: "Ananya Iyer", location: "Main hall" }),
    block("a3", "2099-06-09T04:15:00Z", "2099-06-09T05:00:00Z", "Hardware clinic", { speaker: "Rohan Patil", location: "Lab 2", parallel: true }),
  ],
  timezone: "Asia/Kolkata",
  has_programme: false,
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.includes("/events/info/")) return detail;
        if (path.endsWith("/37/agenda")) return agenda;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        return { ...agenda.items[0], ...(body as object), id: "a9" };
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return { ...agenda.items[1], ...(body as object) };
      }),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return {};
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { AgendaPage } = await import("./components/agenda-page");

beforeEach(() => {
  calls.length = 0;
});

describe("the agenda", () => {
  it("reads the day's shape, then the running order with its free time and parallel tracks", async () => {
    render(<AgendaPage eventId={37} />);
    expect(await screen.findByText("Runs for")).toBeInTheDocument();
    expect(screen.getByText("1 run side by side")).toBeInTheDocument();
    expect(screen.getByText("1 h 30 min")).toBeInTheDocument();
    expect(screen.getByText("09:00 to 10:30")).toBeInTheDocument();
    expect(screen.getByText("1 block without one")).toBeInTheDocument();
    expect(screen.getByText("Foyer, Main hall and 1 more")).toBeInTheDocument();
    expect(screen.getByText(/No programme design yet/)).toBeInTheDocument();
    expect(screen.getByText("15 min free")).toBeInTheDocument();
    expect(screen.getByText("Parallel")).toBeInTheDocument();
    expect(screen.getByText("Ananya Iyer")).toBeInTheDocument();
  });

  it("corrects a block in the form beside it, and removes one only after asking", async () => {
    render(<AgendaPage eventId={37} />);
    await screen.findByText("Runs for");
    fireEvent.click(screen.getByRole("button", { name: "Edit Keynote" }));
    expect(screen.getByText("Edit the block")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Opening keynote" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the block" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/v1/events/37/agenda/a2", body: { title: "Opening keynote", speaker: "Ananya Iyer", location: "Main hall" } }));

    fireEvent.click(screen.getByRole("button", { name: "Remove Hardware clinic" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove block" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path.endsWith("/agenda/a3"))).toBe(true));
  });

  it("adds a block, and says what is missing first", async () => {
    render(<AgendaPage eventId={37} />);
    await screen.findByText("Runs for");
    fireEvent.click(screen.getByRole("button", { name: "Add to the agenda" }));
    expect(await screen.findByText("Give the block a title.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Workshops" } });
    fireEvent.change(screen.getByLabelText("Room (optional)"), { target: { value: "Lab 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to the agenda" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/api/v1/events/37/agenda", body: { title: "Workshops", location: "Lab 1", speaker: null } }));
  });
});
