import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { shownPicture, stubImageLoading } from "@/test/images";
import usersFixture from "../__fixtures__/users.json";

/**
 * The v2 Users screen.
 *
 * Three things here are easy to get wrong in ways nothing else catches:
 *
 * - The status column. `admin_role` is NOT NULL on the backend and defaults
 *   to `owner`, so a table that trusts the raw column badges every signup as
 *   an administrator. The fixture carries one admin, one ordinary user and
 *   one suspended user for exactly this.
 * - The export. It must send the filters the table is showing, and it must be
 *   absent for a role that cannot use it -- a button that always 403s is
 *   worse than no button.
 * - The empty state. "No users match" and "no users exist" are different
 *   facts, and the one that matters during triage is the first.
 */
const calls: string[] = [];
let role: string | null = "owner";

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({
      data: {
        id: 1,
        username: "platform_admin",
        email: "a@b.c",
        full_name: "Admin",
        user_type: "admin",
        admin_role: role,
      },
    }),
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown>; onResponse?: (r: Response) => void }) => {
        const query = new URLSearchParams(
          Object.entries(init?.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString();
        calls.push(query ? `${path}?${query}` : path);
        if (path.includes("/user/admin/list")) {
          init?.onResponse?.(new Response(null, { headers: capped ? { "X-Total-Capped": "true" } : {} }));
          return { ...pageOf(rows), ...envelope };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

type Row = (typeof usersFixture)["items"][number];

let rows: Row[] = usersFixture.items;
/** What the Wave-1 API adds: the capped header, and a cursor in `next`. Off for today's API. */
let capped = false;
let envelope: Record<string, unknown> = {};

function pageOf(items: Row[]) {
  return { ...usersFixture, items, total: items.length === 0 ? 0 : usersFixture.total };
}

const { render } = await import("@/test/render");
const { UsersV2 } = await import("./components/users-v2");
const { adminUserSchema } = await import("./schemas");
const { exportUsersCsv, fetchUsers, cursorOf } = await import("./api");

beforeEach(() => {
  calls.length = 0;
  rows = usersFixture.items;
  role = "owner";
  capped = false;
  envelope = {};
});

describe("admin user row schema", () => {
  it("parses the suspension and role fields", () => {
    const admin = adminUserSchema.parse(usersFixture.items.at(0));
    const suspended = adminUserSchema.parse(usersFixture.items.at(2));

    expect(admin.admin_role).toBe("owner");
    expect(admin.is_active).toBe(true);
    expect(suspended.is_active).toBe(false);
    expect(suspended.admin_role).toBeNull();
  });

  it("treats a row from a backend that predates the fields as active", () => {
    // A deploy where the dashboard ships before the API would otherwise badge
    // the whole table as suspended.
    const older: Record<string, unknown> = { ...usersFixture.items.at(1) };
    delete older.is_active;
    delete older.admin_role;

    expect(adminUserSchema.parse(older).is_active).toBe(true);
  });
});

describe("users screen", () => {
  it("renders a row per user with its identity", async () => {
    render(<UsersV2 />);
    expect(await screen.findByText("@platform_admin")).toBeInTheDocument();
    expect(screen.getByText("@jose_thomas")).toBeInTheDocument();
  });

  it("badges a suspended account, an admin and an ordinary user differently", async () => {
    render(<UsersV2 />);
    await screen.findByText("@platform_admin");

    // Scoped to the row: "Admin" is also the type of that row and an option
    // in the filter dropdown, so an unscoped query would pass by accident.
    const adminRow = screen.getByText("@platform_admin").closest("button")!;
    const plainRow = screen.getByText("@jose_thomas").closest("button")!;
    const suspendedRow = screen.getByText("@arafa_n").closest("button")!;

    // The role, not a second "Admin" -- the type cell in the same row already
    // says that, and a tag repeating it tells the reader nothing.
    expect(within(adminRow).getByText("Owner")).toBeInTheDocument();
    expect(within(adminRow).getByText("Admin")).toBeInTheDocument();
    expect(within(plainRow).getByText("Active")).toBeInTheDocument();
    expect(within(suspendedRow).getByText("Suspended")).toBeInTheDocument();
  });

  it("asks the API for 25 rows, which is the page size the pager reports", async () => {
    render(<UsersV2 />);
    await screen.findByText("@platform_admin");
    expect(calls[0]).toContain("limit=25");
  });

  it("offers the export to an owner", async () => {
    render(<UsersV2 />);
    expect(
      await screen.findByRole("button", { name: /Export .* as CSV/ })
    ).toBeInTheDocument();
  });

  it("hides the export from a role that cannot use it", async () => {
    role = "support";
    render(<UsersV2 />);
    await screen.findByText("@platform_admin");
    expect(screen.queryByRole("button", { name: /as CSV/ })).not.toBeInTheDocument();
  });

  it("says how many users the filters are hiding, not just that none matched", async () => {
    rows = [];
    render(<UsersV2 />);
    // useSearchParams is stubbed empty in setup.ts, so no filter is applied
    // and this is the genuinely-empty wording.
    expect(await screen.findByText("No users yet")).toBeInTheDocument();
  });
});

describe("each person's picture", () => {
  /*
   * The owner's report: no profile pictures anywhere in the portal. The API
   * sent `profile.profile_pic` and `profile.avatar` on every row all along;
   * the row schema stripped `profile` and the row drew initials only.
   */
  const photo = { thumbnail: "https://cdn.test/users/profile_pic/jose.thumbnail.png", medium: "https://cdn.test/users/profile_pic/jose.medium.png" };
  const fox = { thumbnail: "https://cdn.test/avatars/fox.thumbnail.png", medium: "https://cdn.test/avatars/fox.medium.png" };

  function withPictures(): Row[] {
    const [admin, jose, arafa] = usersFixture.items;
    return [
      admin!,
      // A photo and an avatar: the photo wins.
      { ...jose!, profile: { full_name: "Jose", profile_pic: photo, avatar: { id: 2, name: "Fox", image: fox } } },
      // Only the avatar they picked.
      { ...arafa!, profile: { full_name: "Arafa", profile_pic: null, avatar: { id: 2, name: "Fox", image: fox } } },
    ] as unknown as Row[];
  }

  beforeEach(() => stubImageLoading());
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the pictures on the parsed row", () => {
    const parsed = adminUserSchema.parse(withPictures()[1]);
    expect(parsed.profile?.profile_pic?.thumbnail).toBe(photo.thumbnail);
    expect(parsed.profile?.avatar?.image?.thumbnail).toBe(fox.thumbnail);
  });

  it("shows the photo, else the avatar, else the initials, at thumbnail size", async () => {
    rows = withPictures();
    render(<UsersV2 />);
    const rowOf = async (username: string) => (await screen.findByText(`@${username}`)).closest("button")!;

    await waitFor(async () => expect(shownPicture(await rowOf("jose_thomas"))).toBe(photo.thumbnail));
    await waitFor(async () => expect(shownPicture(await rowOf("arafa_n"))).toBe(fox.thumbnail));
    const admin = await rowOf("platform_admin");
    expect(shownPicture(admin)).toBeNull();
    expect(within(admin).getByText("TP")).toBeInTheDocument();
  });

  it("shows the picture in the drawer a row opens, at the larger size", async () => {
    rows = withPictures();
    render(<UsersV2 />);
    fireEvent.click((await screen.findByText("@jose_thomas")).closest("button")!);
    const drawer = await screen.findByRole("dialog");
    await waitFor(() => expect(shownPicture(drawer)).toBe(photo.medium));
  });
});

describe("a platform past ten thousand accounts", () => {
  it("says 10,000+ when the API stopped counting, and names no last page", async () => {
    capped = true;
    envelope = { total: 10_000, next: "/api/v1/user/admin/list?limit=25&sort=joined&order=desc&cursor=2026-10-18T09%3A00%3A00%2B00%3A00~4211" };
    render(<UsersV2 />);
    expect(await screen.findByText(/^10,000\+ people/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export 10,000+ as CSV" })).toBeInTheDocument();
    expect(screen.getByText("Page 1 · 1–3 of 10,000+")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/ })).toBeEnabled();
  });

  it("reads today's exact total as it always did", async () => {
    render(<UsersV2 />);
    expect(await screen.findByText(/^668 people/)).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 27/)).toBeInTheDocument();
  });

  it("reads the cursor out of the next link, and the cap off the header", async () => {
    capped = true;
    envelope = { total: 10_000, next: "/api/v1/user/admin/list?limit=25&cursor=2026-10-18T09%3A00%3A00%2B00%3A00~4211" };
    const page = await fetchUsers({ offset: 0, limit: 25 });
    expect(page.capped).toBe(true);
    expect(page.nextCursor).toBe("2026-10-18T09:00:00+00:00~4211");
    expect(cursorOf("/api/v1/user/admin/list?limit=3&offset=3")).toBeNull();
    expect(cursorOf(null)).toBeNull();

    // The page after it is asked for by its cursor, not an offset.
    calls.length = 0;
    await fetchUsers({ offset: 25, limit: 25, cursor: "2026-10-18T09:00:00+00:00~4211" });
    expect(calls[0]).toContain("cursor=2026-10-18T09%3A00%3A00%2B00%3A00%7E4211");
    expect(calls[0]).not.toContain("offset=");
  });

  it("pages by offset against today's API, which hands out no cursor", async () => {
    const page = await fetchUsers({ offset: 0, limit: 25 });
    expect(page.capped).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(calls[0]).toContain("offset=0");
  });
});

describe("the CSV export request", () => {
  function stubFetch(response: Response) {
    // Typed with the arguments so the assertions below can read the URL it
    // was called with.
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response);
    vi.stubGlobal("fetch", fetchMock);
    // jsdom logs "navigation not implemented" for a download anchor and the
    // noise buries real failures. The click itself is not what is under test.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:stub"),
      revokeObjectURL: vi.fn(),
    });
    return fetchMock;
  }

  it("sends the same filters the table is showing", async () => {
    const fetchMock = stubFetch(
      new Response("id,name\n", {
        status: 200,
        headers: { "content-type": "text/csv" },
      })
    );

    await exportUsersCsv({
      search: "ara",
      userType: "club",
      provider: "apple",
      sort: "name",
      order: "asc",
      isActive: false,
    });

    const url = String(fetchMock.mock.calls.at(0)?.[0]);
    expect(url).toContain("/api/gateway/api/v1/user/admin/export");
    expect(url).toContain("search=ara");
    expect(url).toContain("user_type=club");
    expect(url).toContain("provider=apple");
    expect(url).toContain("sort=name");
    expect(url).toContain("order=asc");
    // The one that is not a string: a dropped `false` would export everyone
    // when the admin asked for suspended accounts only.
    expect(url).toContain("is_active=false");
  });

  it("leaves an unset filter out rather than sending it empty", async () => {
    const fetchMock = stubFetch(new Response("id\n", { status: 200 }));

    await exportUsersCsv({ search: "", userType: undefined });

    const url = String(fetchMock.mock.calls.at(0)?.[0]);
    expect(url).not.toContain("search=");
    expect(url).not.toContain("user_type=");
  });

  it("raises a refusal instead of downloading the error body as a CSV", async () => {
    stubFetch(
      new Response(JSON.stringify({ message: "Not permitted" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(exportUsersCsv({})).rejects.toThrow(/Not permitted/);
  });
});
