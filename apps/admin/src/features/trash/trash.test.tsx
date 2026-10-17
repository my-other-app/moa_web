import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * Trash, against GET /clubs/admin/deleted/list (PaginatedResponse of
 * ClubAdminDetailResponse, newest deletion first) and POST
 * /clubs/admin/{id}/restore.
 *
 * What went wrong on this side: the tab asked for the first fifty and had no
 * way past them, every Restore button waited on whichever one was pressed,
 * and a failed load said "Try reloading" whatever the server said.
 */
let deleted: Array<Record<string, unknown>> = [];
let total: number | null = null;
let failWith: Error | null = null;
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];
const posts: string[] = [];
let holdRestore: Promise<void> | null = null;

/** A deleted club as ClubAdminDetailResponse serialises it. */
function club(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `Club ${id}`,
    slug: `club-${id}`,
    logo: { original: "https://cdn/logo.png", thumbnail: null, medium: null },
    location_name: "Thiruvananthapuram",
    location_link: null,
    about: null,
    contact_phone: null,
    contact_email: null,
    initial_password: null,
    created_at: "2026-09-01T10:00:00+05:30",
    is_verified: true,
    interests: [{ id: 1, name: "Robotics" }],
    followers_count: 0,
    events_count: 0,
    org: null,
    owner_email: null,
    ...over,
  };
}

const LIVE = club(5, { name: "Circuit" });

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        gets.push({ path, query: init?.query });
        if (path === "/api/v1/clubs/admin/deleted/list") {
          if (failWith) throw failWith;
          const offset = Number(init?.query?.offset ?? 0);
          const limit = Number(init?.query?.limit ?? 20);
          // Like the backend: one more row than asked for, so the caller knows a next page exists.
          const items = deleted.slice(offset, offset + limit + 1);
          return { limit, offset, total: total ?? deleted.length, next: null, items };
        }
        if (path === "/api/v1/events/admin/deleted/list" || path === "/api/v1/orgs/deleted/list") {
          return { limit: 20, offset: 0, total: 0, next: null, items: [] };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string) => {
        posts.push(path);
        if (holdRestore) await holdRestore;
        const id = Number(path.split("/").at(-2));
        deleted = deleted.filter((c) => c.id !== id);
      }),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        const id = Number(path.split("/").at(-1));
        if (id === LIVE.id) deleted = [{ ...LIVE }, ...deleted];
        return LIVE;
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { TrashTabs } = await import("./index");
const { useDeleteClub } = await import("@/features/clubs");

const listCalls = () => gets.filter((g) => g.path === "/api/v1/clubs/admin/deleted/list");

beforeEach(() => {
  deleted = [];
  total = null;
  failWith = null;
  gets.length = 0;
  posts.length = 0;
  holdRestore = null;
});

describe("deleted clubs in Trash", () => {
  it("lists them as the backend serialises them, with what each was before", async () => {
    deleted = [club(7, { name: "Robotics" }), club(8, { name: "Drama", is_verified: false })];
    render(<TrashTabs />);
    expect(await screen.findByText("Robotics")).toBeInTheDocument();
    expect(screen.getByText("Drama")).toBeInTheDocument();
    expect(screen.getByText("Was verified")).toBeInTheDocument();
    expect(screen.getByText("Was pending")).toBeInTheDocument();
    expect(listCalls()[0]!.query).toEqual({ offset: 0, limit: 20 });
  });

  it("pages past the first twenty, and shows twenty when the backend sends one more", async () => {
    deleted = Array.from({ length: 45 }, (_, i) => club(100 + i));
    render(<TrashTabs />);
    expect(await screen.findByText("Club 100")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Restore/ })).toHaveLength(20);
    expect(screen.queryByText("Club 120")).not.toBeInTheDocument();
    expect(screen.getByText(/1–20 of 45 deleted clubs/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(listCalls().at(-1)!.query).toEqual({ offset: 20, limit: 20 }));
    expect(await screen.findByText("Club 120")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Club 144")).toBeInTheDocument();
    expect(screen.getByText(/41–45 of 45 deleted clubs/)).toBeInTheDocument();
  });

  it("holds only the row being restored, then lists again", async () => {
    deleted = [club(7, { name: "Robotics" }), club(8, { name: "Drama" })];
    let release!: () => void;
    holdRestore = new Promise<void>((resolve) => (release = resolve));
    render(<TrashTabs />);
    const robotics = (await screen.findByText("Robotics")).closest<HTMLElement>("div.rounded-lg")!;
    const drama = screen.getByText("Drama").closest<HTMLElement>("div.rounded-lg")!;
    const before = listCalls().length;

    fireEvent.click(within(robotics).getByRole("button", { name: /Restore/ }));
    await waitFor(() => expect(posts).toEqual(["/api/v1/clubs/admin/7/restore"]));
    await waitFor(() => expect(within(robotics).getByRole("button", { name: /Restore/ })).toBeDisabled());
    expect(within(drama).getByRole("button", { name: /Restore/ })).toBeEnabled();

    release();
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText("Robotics")).not.toBeInTheDocument());
    expect(screen.getByText("Drama")).toBeInTheDocument();
  });

  it("steps back a page when restoring empties the one it is on", async () => {
    deleted = Array.from({ length: 21 }, (_, i) => club(100 + i));
    render(<TrashTabs />);
    await screen.findByText("Club 100");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const last = await screen.findByText("Club 120");
    fireEvent.click(within(last.closest<HTMLElement>("div.rounded-lg")!).getByRole("button", { name: /Restore/ }));
    await waitFor(() => expect(listCalls().at(-1)!.query).toEqual({ offset: 0, limit: 20 }));
    expect(await screen.findByText("Club 100")).toBeInTheDocument();
    expect(screen.queryByText("No deleted clubs")).not.toBeInTheDocument();
  });

  it("says what the server said when the list cannot be read", async () => {
    failWith = new Error("You do not have permission to do that.");
    render(<TrashTabs />);
    expect(await screen.findByText("Could not load")).toBeInTheDocument();
    expect(screen.getByText("You do not have permission to do that.")).toBeInTheDocument();
  });

  it("shows a club deleted elsewhere in the app: deleting invalidates the Trash list", async () => {
    function DeleteThenLook() {
      const remove = useDeleteClub();
      return (
        <>
          <button type="button" onClick={() => remove.mutate(LIVE.id)}>
            Delete Circuit
          </button>
          <TrashTabs />
        </>
      );
    }
    render(<DeleteThenLook />);
    expect(await screen.findByText("No deleted clubs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Circuit" }));
    expect(await screen.findByText("Circuit")).toBeInTheDocument();
  });
});
