import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

const responses: { history: unknown } = {
  history: {
    items: [
      // Exactly what the endpoint sends: a string id per grouped send, the text under `description`.
      { id: "37-0", title: "Doors open at 5", description: "Come early", event_id: 37, event_name: "SF Sea Hackathon", event_poster: null, sent_count: 24, read_count: 3, read_percentage: 12.5, created_at: "2099-06-09T08:00:00+00:00" },
      { id: "37-1", title: "Untitled", description: "no body key, only description", event_id: 37, event_name: "SF Sea Hackathon", event_poster: null, sent_count: 2, read_count: 0, read_percentage: 0, created_at: "2099-06-08T08:00:00+00:00" },
    ],
    total: 2,
  },
};

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => "/announcements",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/clubs/notifications/history")) return responses.history;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { AnnouncementHistory } = await import("./components/announcement-history");

describe("announcement history", () => {
  it("lists every send with its event and recipients, whatever the row carries", async () => {
    render(<AnnouncementHistory />);
    expect(await screen.findByText("Doors open at 5")).toBeInTheDocument();
    expect(screen.getByText("Come early")).toBeInTheDocument();
    expect(screen.getByText("no body key, only description")).toBeInTheDocument();
    expect(screen.getAllByText("SF Sea Hackathon").length).toBeGreaterThan(0);
    expect(screen.getByText(/^24/)).toHaveTextContent("3 read");
  });

  it("says so when nothing has been sent", async () => {
    responses.history = { items: [], total: 0 };
    render(<AnnouncementHistory />);
    expect(await screen.findByText("No announcements yet")).toBeInTheDocument();
  });
});
