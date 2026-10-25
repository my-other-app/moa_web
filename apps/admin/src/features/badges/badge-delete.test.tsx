import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "@moa/ui";

import recipientsFixture from "../__fixtures__/badge-recipients.json";
import statsFixture from "../__fixtures__/badge-stats.json";

/**
 * Deleting a badge from its page.
 *
 * A badge definition has no soft delete: everyone who holds it loses it, and
 * nothing in the dashboard brings it back. So the confirmation has to say how
 * many people that is, and the page must only leave once the server agreed.
 */
const calls: Array<{ method: string; path: string }> = [];
let refuse: Error | null = null;
let stats: Record<string, unknown> = statsFixture;

const nav = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/badges/4",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.includes("/stats")) return stats;
        if (path.includes("/recipients")) return recipientsFixture;
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
const { BadgeDetail } = await import("./components/badge-detail");

const deletes = () => calls.filter((c) => c.method === "DELETE");
let success: MockInstance<typeof toast.success>;
let failure: MockInstance<typeof toast.error>;

beforeEach(() => {
  calls.length = 0;
  refuse = null;
  stats = statsFixture;
  nav.replace.mockClear();
  success = vi.spyOn(toast, "success");
  failure = vi.spyOn(toast, "error");
});

afterEach(() => vi.restoreAllMocks());

async function askToDelete() {
  render(<BadgeDetail badgeId={4} />);
  await screen.findByRole("heading", { name: "Regular" });
  fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  return screen.findByRole("alertdialog");
}

describe("delete a badge", () => {
  it("says how many holders lose it and that it is permanent", async () => {
    const confirm = await askToDelete();
    expect(within(confirm).getByText("Delete “Regular”?")).toBeInTheDocument();
    expect(within(confirm).getByText("38 persons")).toBeInTheDocument();
    expect(within(confirm).getByText(/permanent and cannot be undone/i)).toBeInTheDocument();
  });

  it("says nobody holds it when nobody does", async () => {
    stats = { ...statsFixture, total_awarded: 0 };
    const confirm = await askToDelete();
    expect(within(confirm).getByText(/nobody holds this badge/i)).toBeInTheDocument();
  });

  it("cancelling sends nothing", async () => {
    const confirm = await askToDelete();
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(deletes()).toEqual([]);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("deletes it by id, says so and goes back to the badge list", async () => {
    const confirm = await askToDelete();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete badge" }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/badges"));
    expect(deletes()).toEqual([{ method: "DELETE", path: "/api/v1/badges/admin/4" }]);
    expect(success).toHaveBeenCalledWith("Badge deleted");
  });

  it("stays on the badge and says why when the server refuses", async () => {
    refuse = new Error("You do not have permission to do this");
    const confirm = await askToDelete();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete badge" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("You do not have permission to do this"));
    expect(nav.replace).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Regular" })).toBeInTheDocument();
  });
});
