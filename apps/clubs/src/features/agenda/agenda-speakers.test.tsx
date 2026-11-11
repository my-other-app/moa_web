import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import detail from "../__fixtures__/event-detail.json";

/**
 * A session's speakers, picked from the event's own (the speakers
 * directory): ticks instead of typing, the typed text still there for an
 * older session, and nothing new on an API from before the directory.
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const server = vi.hoisted(() => ({ directory: true }));
const block = (id: string, starts: string, ends: string | null, title: string, extra: object = {}) => ({ id, event_id: 37, starts_at: starts, ends_at: ends, title, description: null, speaker: null, speaker_photo_key: null, speaker_photo_url: null, location: null, sort_order: 0, parallel: false, ...extra });

const agenda = () => ({
  items: [
    block("a2", "2099-06-09T04:15:00Z", "2099-06-09T05:00:00Z", "Keynote", {
      speaker: "Ananya Iyer",
      ...(server.directory ? { event_speaker_ids: [11], speakers: [{ event_speaker_id: 11, name: "Ananya Iyer", photo_thumbnail: null, profile_slug: "ananya-iyer" }] } : {}),
    }),
    block("a3", "2099-06-09T05:15:00Z", "2099-06-09T06:00:00Z", "Hardware clinic", { speaker: "Rohan P.", ...(server.directory ? { event_speaker_ids: [], speakers: [] } : {}) }),
  ],
  timezone: "Asia/Kolkata",
  has_programme: false,
});

const speakers = () => [
  { id: 11, name: "Ananya Iyer", designation: "IIT-M", ...(server.directory ? { speaker_profile_id: 7, talk_title: null } : {}) },
  { id: 12, name: "Rohan Patil", designation: null, ...(server.directory ? { speaker_profile_id: null, talk_title: null } : {}) },
];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.includes("/events/info/")) return { ...detail, speakers: speakers() };
        if (path.endsWith("/37/agenda")) return agenda();
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        return { ...agenda().items[0], ...(body as object), id: "a9" };
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return { ...agenda().items[1], ...(body as object) };
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { AgendaPage } = await import("./components/agenda-page");

beforeEach(() => {
  calls.length = 0;
  server.directory = true;
});

describe("a session's speakers", () => {
  it("are ticked from the event's speakers, and the picked names show in the running order", async () => {
    render(<AgendaPage eventId={37} />);
    const picker = await screen.findByRole("group", { name: "Speakers (from this event)" });
    expect(screen.queryByLabelText("Speaker (optional)")).toBeNull();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Robotics demo" } });
    fireEvent.click(within(picker).getByRole("checkbox", { name: "Rohan Patil" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to the agenda" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ title: "Robotics demo", speaker: null, event_speaker_ids: [12] }));
  });

  it("keeps the typed name of an older session beside the ticks, and saves both", async () => {
    render(<AgendaPage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Hardware clinic" }));
    const typed = await screen.findByLabelText("Speaker as typed (older session)");
    expect(typed).toHaveValue("Rohan P.");
    fireEvent.click(within(screen.getByRole("group", { name: "Speakers (from this event)" })).getByRole("checkbox", { name: "Rohan Patil" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the block" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ speaker: "Rohan P.", event_speaker_ids: [12] }));
  });

  it("opens a picked session with its speakers ticked and no text box", async () => {
    render(<AgendaPage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Keynote" }));
    const picker = await screen.findByRole("group", { name: "Speakers (from this event)" });
    expect(within(picker).getByRole("checkbox", { name: "Ananya Iyer" })).toBeChecked();
    expect(screen.queryByLabelText(/Speaker as typed/)).toBeNull();
  });

  it("stays a typed name on an API from before the speakers directory", async () => {
    server.directory = false;
    render(<AgendaPage eventId={37} />);
    await screen.findByText("Runs for");
    expect(screen.queryByRole("group", { name: "Speakers (from this event)" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Robotics demo" } });
    fireEvent.change(screen.getByLabelText("Speaker (optional)"), { target: { value: "Rohan Patil" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to the agenda" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ speaker: "Rohan Patil" }));
    expect(calls.find((c) => c.method === "POST")?.body).not.toHaveProperty("event_speaker_ids");
  });
});
