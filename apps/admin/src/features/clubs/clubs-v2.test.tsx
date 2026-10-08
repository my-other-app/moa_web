import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import clubsFixture from "../__fixtures__/clubs.json";

/**
 * The v2 Clubs screen.
 *
 * Bulk approve is the reason this screen was rebuilt -- approving a term's
 * worth of clubs one dialog at a time was the most repetitive thing in the
 * old dashboard -- and it is also the thing most dangerous to get subtly
 * wrong. The selection must never outlive the rows it was made on: a filter
 * change that hides a club and leaves it selected means "Approve 3" acts on
 * something the admin can no longer see.
 */
const calls: string[] = [];
const approved: string[] = [];
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

        if (path.includes("/clubs/admin/list")) {
          const verified = init?.query?.is_verified;
          const items =
            verified === undefined
              ? clubsFixture.items
              : clubsFixture.items.filter((c) => c.is_verified === verified);
          return { ...clubsFixture, items, total: items.length };
        }
        if (path.includes("/orgs/list")) {
          return [
            { id: 1, name: "COEP Technological University" },
            { id: 2, name: "VIT Pune" },
          ];
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string) => {
        approved.push(path);
        return {};
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubsV2, selectionWithin } = await import("./components/clubs-v2");
const { adminClubSchema } = await import("./schemas");

beforeEach(() => {
  calls.length = 0;
  approved.length = 0;
  role = "owner";
});

describe("admin club row schema", () => {
  it("parses the organisation, login email and counts", () => {
    const club = adminClubSchema.parse(clubsFixture.items.at(0));
    expect(club.org).toEqual({ id: 1, name: "COEP Technological University" });
    expect(club.owner_email).toBe("club5@clubs.myotherapp.in");
    expect(club.followers_count).toBe(1284);
    expect(club.events_count).toBe(20);
  });

  it("defaults the counts so approve and reject still parse", () => {
    // Those two return the same schema built without the extra fields. A
    // required field would make a successful approval look like a failure.
    const bare: Record<string, unknown> = { ...clubsFixture.items.at(1) };
    for (const key of ["followers_count", "events_count", "org", "owner_email"]) {
      delete bare[key];
    }
    const club = adminClubSchema.parse(bare);
    expect(club.followers_count).toBe(0);
    expect(club.events_count).toBe(0);
    expect(club.org).toBeUndefined();
  });
});

describe("clubs screen", () => {
  it("shows each club with its organisation and counts", async () => {
    render(<ClubsV2 />);
    await screen.findByText("LetMeGoo");

    // Scoped to the row: the organisation name is also an option in the
    // filter dropdown, so an unscoped query would pass without the column
    // rendering at all.
    const row = screen.getByText("LetMeGoo").closest<HTMLElement>("div.rule-fade")!;
    expect(within(row).getByText("COEP Technological University")).toBeInTheDocument();
    expect(within(row).getByText("1,284")).toBeInTheDocument();
    expect(within(row).getByText("club5@clubs.myotherapp.in")).toBeInTheDocument();
  });

  it("badges verified and awaiting clubs differently", async () => {
    render(<ClubsV2 />);
    await screen.findByText("LetMeGoo");

    const verifiedRow = screen.getByText("LetMeGoo").closest<HTMLElement>("div.rule-fade")!;
    const awaitingRow = screen.getByText("DOTSLASH 25").closest<HTMLElement>("div.rule-fade")!;

    expect(within(verifiedRow).getByText("Verified")).toBeInTheDocument();
    expect(within(awaitingRow).getByText("Awaiting")).toBeInTheDocument();
  });

  it("counts each verification segment from the list filtered the same way", async () => {
    render(<ClubsV2 />);
    await screen.findByText("LetMeGoo");

    // Two of the three fixtures are verified, one is not.
    const segment = screen.getByRole("group", { name: "Verification" });
    expect(within(segment).getByText("3")).toBeInTheDocument();
    expect(within(segment).getByText("2")).toBeInTheDocument();
    expect(within(segment).getByText("1")).toBeInTheDocument();
  });

  it("offers a checkbox only on a club awaiting approval", async () => {
    render(<ClubsV2 />);
    await screen.findByText("LetMeGoo");

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAccessibleName(/DOTSLASH 25/);
  });

  it("hides the checkboxes from a role that cannot approve", async () => {
    role = "viewer";
    render(<ClubsV2 />);
    await screen.findByText("LetMeGoo");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("hides Create club from a role that cannot create one", async () => {
    role = "support";
    render(<ClubsV2 />);
    await screen.findByText("LetMeGoo");
    expect(screen.queryByRole("button", { name: /Create club/ })).not.toBeInTheDocument();
  });

  it("approves every selected club and says how many", async () => {
    render(<ClubsV2 />);
    await screen.findByText("LetMeGoo");

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(await screen.findByRole("button", { name: /Approve 1/ }));

    await waitFor(() => expect(approved).toEqual(["/api/v1/clubs/3/approve"]));
  });

  it("drops a selected club that the current rows no longer contain", () => {
    /*
     * The failure this prevents: select an unverified club, switch to the
     * Verified segment, and the bar would still read "Approve 1" and approve
     * a club that is no longer on screen.
     *
     * Asserted on the function rather than through the rendered screen
     * because the filters live in the URL and the test environment stubs
     * `useSearchParams` as a constant -- a segment click cannot change what
     * the component reads back.
     */
    const awaiting = { id: 3, is_verified: false };
    const verified = { id: 5, is_verified: true };

    expect(selectionWithin([awaiting, verified], [3])).toEqual([3]);
    // The Verified segment: the selected club is not among the rows.
    expect(selectionWithin([verified], [3])).toEqual([]);
    // And a verified club can never be selected, however it got into the list.
    expect(selectionWithin([awaiting, verified], [3, 5])).toEqual([3]);
  });
});
