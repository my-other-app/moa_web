import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let answer: { success: boolean; message?: string; notifications_sent?: number } = { success: true, notifications_sent: 12 };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.includes("/clubs/events/list")) return { items: [{ id: 37, name: "Hack Night 04", event_datetime: "2026-10-04T12:30:00+00:00" }, { id: 41, name: "Intro to KiCad", event_datetime: null }], total: 2, limit: 100, offset: 0 };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        return answer;
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { NewAnnouncementDialog } = await import("./components/new-announcement-dialog");
const { sendAnnouncement } = await import("./api");

beforeEach(() => {
  calls.length = 0;
  answer = { success: true, notifications_sent: 12 };
});

describe("new announcement", () => {
  it("picks an event and an audience and sends", async () => {
    render(<NewAnnouncementDialog />);
    fireEvent.click(screen.getByRole("button", { name: /New announcement/ }));
    expect(await screen.findByRole("option", { name: /Hack Night 04/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Pick the event")).toBeInTheDocument();
    expect(screen.getByText("Give the announcement a title")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Event"), { target: { value: "37" } });
    fireEvent.change(screen.getByLabelText("Who gets it"), { target: { value: "attendees" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Venue change" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "We've moved to Hall B." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/api/v1/clubs/notifications/events/37/send", body: { title: "Venue change", body: "We've moved to Hall B.", audience: "attendees" } });
  });

  it("turns a polite refusal from the API into an error the organiser sees", async () => {
    answer = { success: false, message: "No registrants found for this event.", notifications_sent: 0 };
    await expect(sendAnnouncement(37, { title: "Hello", body: "World!", audience: "all" })).rejects.toThrow("No registrants found for this event.");
    answer = { success: true, notifications_sent: 3 };
    await expect(sendAnnouncement(37, { title: "Hello", body: "World!", audience: "all" })).resolves.toBe(3);
  });
});
