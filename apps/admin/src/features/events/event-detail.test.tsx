import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import analyticsFixture from "../__fixtures__/event-analytics-admin.json";
import detailFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/event-registrations-admin.json";

const calls: string[] = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        const q = new URLSearchParams(
          Object.entries(init?.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString();
        calls.push(q ? `${path}?${q}` : path);

        if (path.includes("/analytics")) return analyticsFixture;
        if (path.includes("/registration/") && path.includes("/list"))
          return registrationsFixture;
        if (path.includes("/events/info/")) return detailFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventDetail } = await import("./components/event-detail");
const { adminEventDetailSchema, eventAnalyticsSchema } = await import("./schemas");
const { fetchEventRegistrations } = await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("admin event schemas", () => {
  it("parses the detail payload", () => {
    const event = adminEventDetailSchema.parse(detailFixture);
    expect(event.name).toBe("SF Sea Hackathon");
    expect(event.page_views).toBe(234);
    expect(event.club?.name).toBe("IEDC CET");
  });

  it("parses analytics including the distinct institution count", () => {
    const analytics = eventAnalyticsSchema.parse(analyticsFixture);
    expect(analytics.total_institutions).toBe(7);
    // The list is capped at five server-side; the count is not its length.
    expect(analytics.top_institutions).toHaveLength(5);
  });

  it("survives analytics with no institutions block", () => {
    const { top_institutions: _omitted, ...rest } = analyticsFixture as Record<
      string,
      unknown
    >;
    const analytics = eventAnalyticsSchema.parse(rest);
    expect(analytics.top_institutions).toEqual([]);
  });
});

describe("admin event page", () => {
  it("renders without throwing", () => {
    expect(() => render(<EventDetail eventId={37} />)).not.toThrow();
  });

  it("shows the event with its club and performance figures", async () => {
    render(<EventDetail eventId={37} />);
    expect(
      await screen.findByRole("heading", { name: "SF Sea Hackathon" })
    ).toBeInTheDocument();
    expect(await screen.findByText("IEDC CET")).toBeInTheDocument();
    // "Registrations" is both a stat label and a tab.
    expect((await screen.findAllByText("Registrations")).length).toBeGreaterThan(0);
    expect(await screen.findByText("24")).toBeInTheDocument();
    expect(await screen.findByText("Conversion")).toBeInTheDocument();
    expect(await screen.findByText("Page views")).toBeInTheDocument();
    expect(await screen.findByText("234")).toBeInTheDocument();
  });

  it("reads analytics, which used to 403 for every admin", async () => {
    render(<EventDetail eventId={37} />);
    await screen.findByText("Attendance rate");
    expect(calls.some((c) => c.includes("/analytics"))).toBe(true);
  });

  it("lists registrations with their winner and attendance state", async () => {
    render(<EventDetail eventId={37} />);
    expect(await screen.findByText("Test Participant One")).toBeInTheDocument();
    expect(await screen.findByText("Winner")).toBeInTheDocument();
    expect(await screen.findByText("Attended")).toBeInTheDocument();
  });

  it("offers an export link", async () => {
    render(<EventDetail eventId={37} />);
    const link = await screen.findByRole("link", { name: /Export/ });
    expect(link).toHaveAttribute("download");
  });
});

describe("registration query", () => {
  it("omits is_attended entirely when not filtering", async () => {
    // A present `false` means "only rows where the flag is off" server-side.
    await fetchEventRegistrations(37, { offset: 0, limit: 10 });
    expect(calls[0]).not.toContain("is_attended");
  });

  it("sends is_attended=true when filtering to attendees", async () => {
    await fetchEventRegistrations(37, { offset: 0, limit: 10, isAttended: true });
    expect(calls[0]).toContain("is_attended=true");
  });
});
