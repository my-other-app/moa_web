import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

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
        if (path === "/api/v1/clubs/ai/status") return { enabled: true, plan_allows: true, used: 1, limit: 150, resets_at: "2026-11-01T00:00:00+05:30", byok: false, provider: null };
        if (path.endsWith("/notifications/events/37/audience")) return { event: { id: 37, name: "Hack Night 04", starts_at: null }, registered: 148, checked_in: 88, reachable: 120, by_audience: { all: { people: 148, reachable: 120 }, attendees: { people: 88, reachable: 70 }, non_attendees: { people: 60, reachable: 50 } } };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/clubs/ai/write") return { text: "Hall B, same time. Doors open at 5:45.", subject: "We've moved to Hall B" };
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
    // Each audience says what it reaches before it is picked.
    expect(await screen.findByText("70 of 88 reachable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Only those who checked in/ }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Venue change" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "We've moved to Hall B." } });
    expect(screen.getByText("Venue change", { selector: "p" })).toBeInTheDocument(); // the phone preview
    fireEvent.click(screen.getByRole("button", { name: "Send to 70 phones" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/api/v1/clubs/notifications/events/37/send", body: { title: "Venue change", body: "We've moved to Hall B.", audience: "attendees" } });
  });

  it("writes the message with AI for the picked event, takes its subject as the title, and sends nothing", async () => {
    render(<NewAnnouncementDialog />);
    fireEvent.click(screen.getByRole("button", { name: /New announcement/ }));
    await screen.findByRole("option", { name: /Hack Night 04/ });
    fireEvent.change(screen.getByLabelText("Event"), { target: { value: "37" } });
    fireEvent.click(await screen.findByRole("button", { name: /Write with AI/ }));
    const writer = await screen.findByRole("dialog", { name: /Write with AI/ });
    expect(within(writer).getByLabelText("What it's for")).toHaveValue("announcement");
    fireEvent.change(within(writer).getByLabelText("What should it say?"), { target: { value: "Venue moved to Hall B" } });
    fireEvent.click(within(writer).getByRole("button", { name: "Write it" }));
    fireEvent.click(await within(writer).findByRole("button", { name: "Insert" }));
    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue("Hall B, same time. Doors open at 5:45."));
    expect(screen.getByLabelText("Title")).toHaveValue("We've moved to Hall B");
    expect(calls.find((c) => c.path === "/api/v1/clubs/ai/write")!.body).toMatchObject({ kind: "announcement", event_id: 37, prompt: "Venue moved to Hall B" });
    expect(calls.some((c) => c.path.endsWith("/send"))).toBe(false);
  });

  it("turns a polite refusal from the API into an error the organiser sees", async () => {
    answer = { success: false, message: "No registrants found for this event.", notifications_sent: 0 };
    await expect(sendAnnouncement(37, { title: "Hello", body: "World!", audience: "all" })).rejects.toThrow("No registrants found for this event.");
    answer = { success: true, notifications_sent: 3 };
    await expect(sendAnnouncement(37, { title: "Hello", body: "World!", audience: "all" })).resolves.toBe(3);
  });
});
