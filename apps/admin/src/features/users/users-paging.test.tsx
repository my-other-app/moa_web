import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";

import usersFixture from "../__fixtures__/users.json";

/**
 * Paging the Users screen by the cursor each page hands out (Wave 1's
 * keyset pages): Next asks for the page after by the cursor in `next`,
 * never by skipping rows; Previous goes back by the cursor it came with.
 */
const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (url: string) => void (nav.search = url.split("?")[1] ?? ""),
    replace: (url: string) => void (nav.search = url.split("?")[1] ?? ""),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/users",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const queries: Array<Record<string, unknown>> = [];
/** The cursor page `n` hands out: its last row's join time and id. */
const cursorFor = (n: number) => `2026-10-18T00:00:00+00:00~${n}`;

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "a", email: "a@b.c", full_name: "A", user_type: "admin", admin_role: "owner" } }),
    api: {
      get: vi.fn(async (_path: string, init?: { query?: Record<string, unknown>; onResponse?: (r: Response) => void }) => {
        const q = init?.query ?? {};
        queries.push(q);
        init?.onResponse?.(new Response(null, { headers: { "X-Total-Capped": "true" } }));
        // Which page this is: 1, or the one after the cursor it was asked with.
        const page = typeof q.cursor === "string" ? Number(q.cursor.split("~")[1]) + 1 : 1;
        return { ...usersFixture, total: 10_000, offset: 0, next: `/api/v1/user/admin/list?limit=25&cursor=${encodeURIComponent(cursorFor(page))}` };
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { UsersV2 } = await import("./components/users-v2");

/** The URL here is a plain variable: this re-renders the screen after a push, as a navigation would. */
const navigated = { current: () => {} };
function Screen() {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    navigated.current = () => setTick((n) => n + 1);
  }, []);
  return <UsersV2 />;
}
const press = (name: RegExp) => {
  fireEvent.click(screen.getByRole("button", { name }));
  act(() => navigated.current());
};

beforeEach(() => {
  nav.search = "";
  queries.length = 0;
});

describe("paging the users by cursor", () => {
  it("asks for the next page by the cursor the last one gave, and goes back by it too", async () => {
    render(<Screen />);
    expect(await screen.findByText("Page 1 · 1–3 of 10,000+")).toBeInTheDocument();
    expect(queries.at(-1)).toMatchObject({ offset: 0 });
    expect(queries.at(-1)).not.toHaveProperty("cursor");

    press(/Next/);
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ cursor: cursorFor(1) }));
    expect(queries.at(-1)).not.toHaveProperty("offset");
    expect(await screen.findByText(/^Page 2 ·/)).toBeInTheDocument();

    press(/Next/);
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ cursor: cursorFor(2) }));
    expect(await screen.findByText(/^Page 3 ·/)).toBeInTheDocument();

    // Back to page 2: the cursor it was reached by, not an offset.
    const before = queries.length;
    press(/Previous/);
    expect(await screen.findByText(/^Page 2 ·/)).toBeInTheDocument();
    expect(queries.slice(before).every((q) => q.cursor === cursorFor(1) && !("offset" in q))).toBe(true);
  });
});
