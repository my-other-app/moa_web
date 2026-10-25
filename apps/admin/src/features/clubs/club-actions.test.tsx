import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "@moa/ui";

import detailFixture from "../__fixtures__/club-detail.json";
import eventsFixture from "../__fixtures__/club-events.json";
import followersFixture from "../__fixtures__/club-followers.json";
import lifetimeFixture from "../__fixtures__/club-lifetime.json";
import topicsFixture from "../__fixtures__/topics.json";

/**
 * Deleting a club and editing it, from the club's admin page.
 *
 * Restoring from Trash is covered in trash.test.tsx and the update payload in
 * club-detail.test.tsx; these are the button and the tab in front of them.
 * The Edit tab has to send the club's interests and organisation back
 * untouched -- the handler replaces the interest links with whatever it is
 * sent, so a form that forgot them would wipe them.
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let refuse: Error | null = null;

const nav = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/clubs/5",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (/\/clubs\/followers\//.test(path)) return followersFixture;
        if (/\/clubs\/\d+\/events/.test(path)) return eventsFixture;
        if (/\/clubs\/admin\/\d+\/lifetime$/.test(path)) return lifetimeFixture;
        if (/\/clubs\/admin\/\d+$/.test(path)) return detailFixture;
        if (path === "/api/v1/interests/list") return topicsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (refuse) throw refuse;
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        if (refuse) throw refuse;
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubDetail } = await import("./components/club-detail");

const writes = () => calls.filter((c) => c.method !== "GET");
let success: MockInstance<typeof toast.success>;
let failure: MockInstance<typeof toast.error>;

beforeEach(() => {
  calls.length = 0;
  refuse = null;
  nav.replace.mockClear();
  success = vi.spyOn(toast, "success");
  failure = vi.spyOn(toast, "error");
});

afterEach(() => vi.restoreAllMocks());

async function openPage() {
  render(<ClubDetail clubId={5} />);
  await screen.findByRole("heading", { name: "IEDC CET" });
}

async function askToDelete() {
  await openPage();
  fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
  return screen.findByRole("alertdialog");
}

describe("delete a club from its page", () => {
  it("says what goes with it, and that Trash can bring it back", async () => {
    const confirm = await askToDelete();
    expect(within(confirm).getByText("Delete “IEDC CET”?")).toBeInTheDocument();
    expect(within(confirm).getByText(/its organisers lose access/i)).toHaveTextContent("9 events go with it");
    expect(within(confirm).getByText(/goes to Trash, where it can be restored/i)).toBeInTheDocument();
  });

  it("cancelling sends nothing", async () => {
    const confirm = await askToDelete();
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(writes()).toEqual([]);
  });

  it("deletes by id, says so and goes back to the clubs list", async () => {
    const confirm = await askToDelete();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete club" }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/clubs"));
    expect(writes()).toEqual([{ method: "DELETE", path: "/api/v1/clubs/admin/5" }]);
    expect(success).toHaveBeenCalledWith("Club deleted");
  });

  it("stays on the club and says why when the server refuses", async () => {
    refuse = new Error("Club has an active subscription");
    const confirm = await askToDelete();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete club" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("Club has an active subscription"));
    expect(nav.replace).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });
});

describe("edit a club (the Edit tab)", () => {
  async function openEdit() {
    await openPage();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Edit" }), { button: 0, ctrlKey: false });
    return screen.findByRole("tabpanel", { name: "Edit" });
  }

  const sent = () => {
    const put = writes().find((c) => c.method === "PUT");
    expect(put?.path).toBe("/api/v1/clubs/admin/5");
    return Object.fromEntries((put!.body as FormData).entries());
  };

  it("starts from the club as it is, with nothing to save yet", async () => {
    const panel = await openEdit();
    expect(within(panel).getByLabelText("Club name")).toHaveValue("IEDC CET");
    expect(within(panel).getByLabelText("Contact email")).toHaveValue("iedc@example.com");
    expect(within(panel).getByLabelText("Instagram")).toHaveValue("https://instagram.com/example");
    expect(within(panel).getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("saves the change and sends the interests and organisation back unchanged", async () => {
    const panel = await openEdit();
    fireEvent.change(within(panel).getByLabelText("Location"), { target: { value: "CET Campus" } });
    expect(within(panel).getByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(success).toHaveBeenCalledWith("Club updated"));
    const body = sent();
    expect(body.location_name).toBe("CET Campus");
    expect(body.name).toBe("IEDC CET");
    // No controls for these: they round-trip, or saving would wipe them.
    expect(body.interest_ids).toBe("6,7");
    expect(body.org_id).toBe("1");
  });

  it("shows a field's problem and sends nothing", async () => {
    const panel = await openEdit();
    fireEvent.change(within(panel).getByLabelText("Club name"), { target: { value: "IE" } });
    fireEvent.change(within(panel).getByLabelText("Website"), { target: { value: "not a url" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save changes" }));

    expect(await within(panel).findByText("Club name needs at least 3 characters")).toBeInTheDocument();
    expect(within(panel).getByText("Enter a full URL")).toBeInTheDocument();
    expect(writes()).toEqual([]);
  });

  it("says why when the server refuses and keeps the edit", async () => {
    refuse = new Error("A club with this name already exists");
    const panel = await openEdit();
    fireEvent.change(within(panel).getByLabelText("Club name"), { target: { value: "TinkerHub" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("A club with this name already exists"));
    expect(success).not.toHaveBeenCalled();
    expect(within(panel).getByLabelText("Club name")).toHaveValue("TinkerHub");
  });
});
