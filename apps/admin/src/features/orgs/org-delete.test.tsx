import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "@moa/ui";

import analyticsFixture from "../__fixtures__/org-analytics.json";
import clubsFixture from "../__fixtures__/org-clubs.json";
import eventsFixture from "../__fixtures__/org-events.json";
import detailFixture from "../__fixtures__/org-detail.json";

/**
 * Deleting an organisation from its page.
 *
 * Its clubs are not deleted with it, but they are left with no organisation,
 * so the confirmation names how many and points at blocking, which is the
 * reversible option. Restoring from Trash is covered in critical-surfaces.
 */
const calls: Array<{ method: string; path: string }> = [];
let refuse: Error | null = null;
let analytics: Record<string, unknown> = analyticsFixture;

const nav = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/organizations/1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.includes("/analytics")) return analytics;
        if (path.includes("/clubs/admin/list")) return clubsFixture;
        if (path.includes("/events/admin/list")) return eventsFixture;
        if (/\/orgs\/\d+$/.test(path)) return detailFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        if (refuse) throw refuse;
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { OrgDetail } = await import("./components/org-detail");

const deletes = () => calls.filter((c) => c.method === "DELETE");
let success: MockInstance<typeof toast.success>;
let failure: MockInstance<typeof toast.error>;

beforeEach(() => {
  calls.length = 0;
  refuse = null;
  analytics = analyticsFixture;
  nav.replace.mockClear();
  success = vi.spyOn(toast, "success");
  failure = vi.spyOn(toast, "error");
});

afterEach(() => vi.restoreAllMocks());

async function askToDelete() {
  render(<OrgDetail orgId={1} />);
  await screen.findByRole("heading", { name: "College of Engineering Trivandrum" });
  // Wait for the analytics (the followers figure), which carry the club
  // count the confirmation quotes.
  await screen.findByText("512");
  fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  return screen.findByRole("alertdialog");
}

describe("delete an organisation", () => {
  it("names how many clubs lose their organisation and offers blocking instead", async () => {
    const confirm = await askToDelete();
    expect(within(confirm).getByText("Delete “College of Engineering Trivandrum”?")).toBeInTheDocument();
    expect(within(confirm).getByText("4 clubs")).toBeInTheDocument();
    expect(within(confirm).getByText(/consider blocking it instead/i)).toBeInTheDocument();
  });

  it("says plainly when no club belongs to it", async () => {
    analytics = { ...analyticsFixture, total_clubs: 0 };
    render(<OrgDetail orgId={1} />);
    await screen.findByRole("heading", { name: "College of Engineering Trivandrum" });
    await screen.findByText("512");
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/this removes the organisation/i)).toBeInTheDocument();
  });

  it("cancelling sends nothing", async () => {
    const confirm = await askToDelete();
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(deletes()).toEqual([]);
  });

  it("deletes by id, says so and goes back to the list", async () => {
    const confirm = await askToDelete();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete organisation" }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/organizations"));
    expect(deletes()).toEqual([{ method: "DELETE", path: "/api/v1/orgs/delete/1" }]);
    expect(success).toHaveBeenCalledWith("Organisation deleted");
  });

  it("stays on the organisation and says why when the server refuses", async () => {
    refuse = new Error("Organisation not found");
    const confirm = await askToDelete();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete organisation" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("Organisation not found"));
    expect(nav.replace).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });
});
