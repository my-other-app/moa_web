import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import usersFixture from "../features/__fixtures__/users.json";
import clubsFixture from "../features/__fixtures__/clubs.json";
import eventsFixture from "../features/__fixtures__/events.json";
import orgsFixture from "../features/__fixtures__/orgs.json";
import badgesFixture from "../features/__fixtures__/badges.json";

/**
 * ⌘K: one search across users, clubs, events, organisations and badges.
 *
 * Users, clubs and events are searched by the server; organisations and
 * badges have no search parameter, so the whole collection comes back and is
 * filtered by name here. One section failing must not empty the others.
 */
const push = vi.fn();
const gets: Array<{ path: string; query?: Record<string, unknown> }> = [];
let usersFail = false;
/** Off: the server-searched sections find nothing. */
let serverFinds = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const page = <T,>(fixture: { items: T[] }, items: T[]) => ({ ...fixture, items, total: items.length, next: null });
const USERS = page(usersFixture, [{ ...usersFixture.items[0]!, id: 31, full_name: "Chess Captain", email: "captain@example.com" }]);
const CLUBS = page(clubsFixture, [
  { ...clubsFixture.items[0]!, id: 5, name: "Chess Club", is_verified: true, location_name: "Kochi" },
  { ...clubsFixture.items[1]!, id: 6, name: "Chess Juniors", is_verified: false },
]);
const EVENTS = page(eventsFixture, [{ ...eventsFixture.items[0]!, id: 45, name: "Chess Night" }]);
const ORGS = [
  { ...orgsFixture[0]!, id: 1, name: "Chess Federation", address: "Thrissur" },
  { ...orgsFixture[1]!, id: 2, name: "Model Engineering College" },
];
const BADGES = [
  { ...badgesFixture[0]!, id: 2, name: "Chess Champion", description: "Won a chess event" },
  { ...badgesFixture[1]!, id: 8, name: "Runner Up" },
];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        gets.push({ path, query: init?.query });
        if (path === "/api/v1/user/admin/list") {
          if (usersFail) throw new Error("Internal Server Error");
          return serverFinds ? USERS : page(usersFixture, []);
        }
        if (path === "/api/v1/clubs/admin/list") return serverFinds ? CLUBS : page(clubsFixture, []);
        if (path === "/api/v1/events/admin/list") return serverFinds ? EVENTS : page(eventsFixture, []);
        if (path === "/api/v1/orgs/list") return ORGS;
        if (path === "/api/v1/badges/admin") return BADGES;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { CommandPalette } = await import("./command-palette");

const pressCmdK = (init: KeyboardEventInit = { metaKey: true }) =>
  fireEvent.keyDown(window, { key: "k", ...init });
const searchBox = () => screen.getByRole("textbox", { name: "Search everything" });
const type = (text: string) => fireEvent.change(searchBox(), { target: { value: text } });
const hit = (label: string) => screen.findByRole("button", { name: new RegExp(`^${label}`) });

beforeEach(() => {
  push.mockClear();
  gets.length = 0;
  usersFail = false;
  serverFinds = true;
});

describe("the command palette", () => {
  it("opens on ⌘K or Ctrl+K and closes on a second press", async () => {
    render(<CommandPalette />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    pressCmdK();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(searchBox()).toHaveFocus();

    pressCmdK({ ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    pressCmdK({ ctrlKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens from the search button in the top bar too", async () => {
    render(<CommandPalette />);
    fireEvent.click(screen.getByRole("button", { name: /Search everything/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("asks for nothing until two characters are typed", async () => {
    render(<CommandPalette />);
    pressCmdK();
    await screen.findByRole("dialog");
    type("c");
    expect(screen.getByText("Type at least two characters.")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(gets).toHaveLength(0);
  });

  it("searches all five sections at once and groups what it finds", async () => {
    render(<CommandPalette />);
    pressCmdK();
    await screen.findByRole("dialog");
    type("chess");

    expect(await hit("Chess Captain")).toHaveTextContent("captain@example.com");
    const dialog = screen.getByRole("dialog");
    for (const group of ["Users", "Clubs", "Events", "Organisations", "Badges"]) {
      expect(within(dialog).getByText(group)).toBeInTheDocument();
    }
    expect(await hit("Chess Club")).toHaveTextContent("Kochi");
    expect(await hit("Chess Juniors")).toHaveTextContent("Pending approval");
    expect(await hit("Chess Night")).toBeInTheDocument();
    expect(await hit("Chess Federation")).toHaveTextContent("Thrissur");
    expect(await hit("Chess Champion")).toHaveTextContent("Won a chess event");

    // The server-searched sections get the term and a small page.
    const query = (path: string) => gets.find((g) => g.path === path)?.query;
    expect(query("/api/v1/user/admin/list")).toMatchObject({ search: "chess", offset: 0, limit: 5 });
    expect(query("/api/v1/clubs/admin/list")).toMatchObject({ search: "chess", offset: 0, limit: 5 });
    expect(query("/api/v1/events/admin/list")).toMatchObject({ search: "chess", offset: 0, limit: 5 });
  });

  it("filters organisations and badges by name here, since their endpoints cannot", async () => {
    render(<CommandPalette />);
    pressCmdK();
    await screen.findByRole("dialog");
    type("chess");
    await hit("Chess Federation");
    expect(screen.queryByRole("button", { name: /Model Engineering College/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Runner Up/ })).not.toBeInTheDocument();
  });

  it("opens the record picked, and closes", async () => {
    render(<CommandPalette />);
    pressCmdK();
    await screen.findByRole("dialog");
    type("chess");
    fireEvent.click(await hit("Chess Club"));

    expect(push).toHaveBeenCalledWith("/clubs/5");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("moves through the results with the arrow keys and opens one with Enter", async () => {
    render(<CommandPalette />);
    pressCmdK();
    await screen.findByRole("dialog");
    type("chess");
    await hit("Chess Champion");

    // Users first, then clubs: down once is the first club.
    fireEvent.keyDown(searchBox(), { key: "ArrowDown" });
    fireEvent.keyDown(searchBox(), { key: "ArrowDown" });
    fireEvent.keyDown(searchBox(), { key: "ArrowUp" });
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/clubs/5");
  });

  it("still shows the other sections when one fails", async () => {
    usersFail = true;
    render(<CommandPalette />);
    pressCmdK();
    await screen.findByRole("dialog");
    type("chess");
    expect(await hit("Chess Club")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Chess Captain/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).queryByText("Users")).not.toBeInTheDocument();
  });

  it("says when nothing matched", async () => {
    serverFinds = false;
    render(<CommandPalette />);
    pressCmdK();
    await screen.findByRole("dialog");
    type("zz");
    expect(await screen.findByText("Nothing matched “zz”.")).toBeInTheDocument();
    expect(gets.map((g) => g.path)).toHaveLength(5);
  });
});
