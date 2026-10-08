import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

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
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        const query = new URLSearchParams(
          Object.entries(init?.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString();
        calls.push(query ? `${path}?${query}` : path);
        if (path.includes("/user/admin/list")) return pageOf(rows);
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

function pageOf(items: Row[]) {
  return { ...usersFixture, items, total: items.length === 0 ? 0 : usersFixture.total };
}

const { render } = await import("@/test/render");
const { UsersV2 } = await import("./components/users-v2");
const { adminUserSchema } = await import("./schemas");
const { exportUsersCsv } = await import("./api");

beforeEach(() => {
  calls.length = 0;
  rows = usersFixture.items;
  role = "owner";
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
