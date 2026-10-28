import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import eventsFixture from "../__fixtures__/events.json";

/**
 * The Events list's Export and Views.
 *
 * Both lived on the old EventsTable (since removed), which no page had
 * rendered since the v2 Events screen replaced it -- so the live list had
 * neither. They read the v2 screen's own URL (period, fee, club, category,
 * sort), which the export turns into the API's booleans and ids exactly as
 * the list does.
 */
let search = "";
const push = vi.fn();
const downloads: Array<{ filename: string; csv: string }> = [];
const exports: Array<Record<string, unknown>> = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/events",
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    downloadCsv: vi.fn((filename: string, csv: string) => downloads.push({ filename, csv })),
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        if (path === "/api/v1/events/categories/list") return [{ id: 1, name: "Hackathon" }];
        if (path === "/api/v1/clubs/admin/list") return { limit: 100, offset: 0, total: 0, next: null, items: [] };
        if (path === "/api/v1/events/admin/list") {
          if (init?.query?.limit === 100) exports.push(init.query);
          return eventsFixture;
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventsV2 } = await import("./components/events-v2");

/** A browser's storage, in memory: the test runtime's own is not usable. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

beforeEach(() => {
  search = "";
  push.mockClear();
  downloads.length = 0;
  exports.length = 0;
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const ready = () => screen.findByRole("link", { name: /Mutate/ });

describe("exporting the events", () => {
  it("asks for the filtered set the way the list does and writes one row per event", async () => {
    search = "period=upcoming&fee=paid&category=1&club=5&sort=name&q=hack";
    render(<EventsV2 />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(downloads).toHaveLength(1));

    expect(exports).toEqual([
      {
        search: "hack",
        club_id: 5,
        org_id: undefined,
        category_id: 1,
        is_ended: false,
        has_fee: true,
        sort: "name",
        order: "asc",
        offset: 0,
        limit: 100,
      },
    ]);
    expect(downloads[0]!.filename).toMatch(/^events-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = downloads[0]!.csv.split("\r\n");
    expect(lines[0]).toBe("ID,Name,Club,Category,When,Where,Online,Fee,Page views,Reviews registrations,Registrations under review,Registrations received for review");
    // An older server's rows: off, and the request counts left blank rather than a made-up 0.
    expect(lines[1]).toBe("45,Mutate,Yukthi,Competition,2026-03-07T10:00:00+05:30,faya,no,0,4,no,,");
    expect(lines).toHaveLength(1 + eventsFixture.items.length);
  });

  it("sends no filter at all for the unfiltered list", async () => {
    render(<EventsV2 />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(exports).toHaveLength(1));
    expect(exports[0]).toMatchObject({ is_ended: undefined, has_fee: undefined, club_id: undefined, sort: "date", order: "desc" });
  });
});

describe("the events' views", () => {
  it("offers Upcoming, Paid events and Most viewed in this screen's own terms", async () => {
    render(<EventsV2 />);
    await ready();
    fireEvent.keyDown(screen.getByRole("button", { name: "Views" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "Upcoming" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Most viewed" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Paid events" }));
    expect(push).toHaveBeenCalledWith("/events?fee=paid", { scroll: false });
  });

  it("saves the current filters under a name, in this browser, and reopens them", async () => {
    search = "period=ended&fee=free";
    vi.spyOn(window, "prompt").mockReturnValue("Finished free events");
    render(<EventsV2 />);
    await ready();

    fireEvent.keyDown(screen.getByRole("button", { name: "Views" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Save current filters" }));

    expect(JSON.parse(window.localStorage.getItem("moa.saved-views.events")!)).toEqual([
      { name: "Finished free events", query: "period=ended&fee=free" },
    ]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Views" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Finished free events/ }));
    expect(push).toHaveBeenCalledWith("/events?period=ended&fee=free", { scroll: false });
  });
});
