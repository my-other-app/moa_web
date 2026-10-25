import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * The contact book: what close-out kept of each event's guests, searchable,
 * filtered by event, dates and whether they came, and exported with the same
 * filters. Against a backend without it, the page says it isn't there yet and
 * the menu item stays hidden.
 */
const calls: Array<{ path: string; query?: Record<string, unknown> }> = [];
let server: "old" | "new" = "new";
let empty = false;

const PAGE = {
  items: [
    { id: "c1", name: "Asha Menon", email: "asha@example.com", phone: "9847012345", role: "attendee", attended: true, event_id: 37, event_name: "Hack Night 04", event_ended_at: "2026-09-20T18:00:00+00:00", archived_at: "2026-09-23T18:00:00+00:00" },
    { id: "c2", name: "Rahul K", email: null, phone: null, role: "speaker", attended: false, event_id: 41, event_name: "Design Jam", event_ended_at: "2026-10-02T18:00:00+00:00", archived_at: "2026-10-05T18:00:00+00:00" },
  ],
  total: 2,
  page: 1,
  page_size: 50,
  groups: [
    { event_id: 41, event_name: "Design Jam", event_ended_at: "2026-10-02T18:00:00+00:00", archived_at: "2026-10-05T18:00:00+00:00", contacts: 1 },
    { event_id: 37, event_name: "Hack Night 04", event_ended_at: "2026-09-20T18:00:00+00:00", archived_at: "2026-09-23T18:00:00+00:00", contacts: 1 },
  ],
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        calls.push({ path, query: options?.query });
        if (path === "/api/v1/clubs/contacts") {
          if (server === "old") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
          if (empty) return { items: [], total: 0, page: 1, page_size: 50, groups: [] };
          return PAGE;
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ContactsPage } = await import("./components/contacts-page");
const { contactsExportUrl } = await import("./api");

beforeEach(() => {
  calls.length = 0;
  server = "new";
  empty = false;
});

const lastQuery = () => calls.filter((c) => c.path === "/api/v1/clubs/contacts").at(-1)?.query ?? {};

describe("the contact book", () => {
  it("lists the kept contacts with their event and whether they came", async () => {
    render(<ContactsPage />);
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Asha Menon")).toBeInTheDocument();
    expect(within(table).getByText("asha@example.com")).toHaveAttribute("href", "mailto:asha@example.com");
    expect(within(table).getByText("speaker")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText(/2 kept from 2 events/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Export all as CSV/ })).toHaveAttribute("href", "/api/gateway/api/v1/clubs/contacts/export.csv");
  });

  it("filters by event, came and dates, from the first page, and exports with the same filters", async () => {
    render(<ContactsPage />);
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Event"), { target: { value: "37" } });
    fireEvent.change(screen.getByLabelText("Came"), { target: { value: "no" } });
    fireEvent.change(screen.getByLabelText("Event ended from"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("to"), { target: { value: "2026-09-30" } });
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({ event_id: 37, attended: false, since: "2026-09-01", until: "2026-09-30", page: 1, page_size: 50 }),
    );
    const href = screen.getByRole("link", { name: /Export these as CSV/ }).getAttribute("href")!;
    expect(href).toBe("/api/gateway/api/v1/clubs/contacts/export.csv?event_id=37&attended=false&since=2026-09-01&until=2026-09-30");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("link", { name: /Export all as CSV/ })).toHaveAttribute("href", "/api/gateway/api/v1/clubs/contacts/export.csv");
    expect(screen.getByLabelText("Event")).toHaveValue("");
  });

  it("searches on commit", async () => {
    render(<ContactsPage />);
    await screen.findByRole("table");
    const box = screen.getByRole("searchbox", { name: "Search contacts" });
    fireEvent.change(box, { target: { value: "asha" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: "asha" }));
  });

  it("says how contacts get here when none were kept yet", async () => {
    empty = true;
    render(<ContactsPage />);
    expect(await screen.findByText("No contacts kept yet")).toBeInTheDocument();
    expect(screen.getByText(/Switch on “Keep contacts for the club” in an event's Close-out/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Export/ })).not.toBeInTheDocument();
  });

  it("says the book isn't there yet against a backend without it", async () => {
    server = "old";
    render(<ContactsPage />);
    expect(await screen.findByText(/The contact book isn't available yet/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("builds the export address without empty filters", () => {
    expect(contactsExportUrl({ q: "  ", event_id: null, attended: true })).toBe("/api/gateway/api/v1/clubs/contacts/export.csv?attended=true");
  });
});
