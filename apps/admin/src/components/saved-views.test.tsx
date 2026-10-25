import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

/**
 * Saved views: a named query string per list, kept in this browser's
 * storage. The lists themselves (Payments, Events, Organisations) are covered
 * in their own export tests; these cover what the menu does with the views.
 */
let search = "";
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/payments",
  useSearchParams: () => new URLSearchParams(search),
}));

const { render } = await import("@/test/render");
const { SavedViews } = await import("./saved-views");
const { toast } = await import("@moa/ui");

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}
const useStorage = (storage: Storage) =>
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });

const openMenu = () => fireEvent.keyDown(screen.getByRole("button", { name: "Views" }), { key: "Enter" });

beforeEach(() => {
  search = "";
  push.mockClear();
  useStorage(memoryStorage());
});
afterEach(() => vi.restoreAllMocks());

/*
 * The component caches each list's views for the life of the page, as the
 * browser would; each test uses its own key so one cannot see another's.
 */
describe("saved views", () => {
  it("cannot save an unfiltered list", async () => {
    render(<SavedViews storageKey="t-empty" />);
    openMenu();
    expect(await screen.findByRole("menuitem", { name: "No filters to save" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Filter the list, then save it here.")).toBeInTheDocument();
  });

  it("does nothing when the name prompt is dismissed", async () => {
    search = "status=failed";
    vi.spyOn(window, "prompt").mockReturnValue(null);
    render(<SavedViews storageKey="t-dismiss" />);
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Save current filters" }));
    expect(window.localStorage.getItem("moa.saved-views.t-dismiss")).toBeNull();
  });

  it("replaces a view saved under the same name, whatever its case", async () => {
    useStorage(
      memoryStorage({ "moa.saved-views.t-rename": JSON.stringify([{ name: "Failed UPI", query: "status=failed" }]) })
    );
    search = "status=failed&q=upi";
    vi.spyOn(window, "prompt").mockReturnValue("  failed upi ");
    const said = vi.spyOn(toast, "success");
    render(<SavedViews storageKey="t-rename" />);
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Save current filters" }));

    expect(JSON.parse(window.localStorage.getItem("moa.saved-views.t-rename")!)).toEqual([
      { name: "failed upi", query: "status=failed&q=upi" },
    ]);
    expect(said).toHaveBeenCalledWith("Saved “failed upi”");
  });

  it("deletes a view without opening it", async () => {
    useStorage(
      memoryStorage({
        "moa.saved-views.t-delete": JSON.stringify([
          { name: "Refunds", query: "status=refunded" },
          { name: "Club money", query: "gateway=club" },
        ]),
      })
    );
    render(<SavedViews storageKey="t-delete" />);
    openMenu();
    const refunds = await screen.findByRole("menuitem", { name: /Refunds/ });
    fireEvent.click(within(refunds).getByRole("button", { name: "Delete view Refunds" }));

    expect(push).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem("moa.saved-views.t-delete")!)).toEqual([
      { name: "Club money", query: "gateway=club" },
    ]);
    expect(screen.queryByRole("menuitem", { name: /Refunds/ })).not.toBeInTheDocument();
  });

  it("keeps each list's views to that list", async () => {
    useStorage(
      memoryStorage({ "moa.saved-views.t-payments": JSON.stringify([{ name: "Club money", query: "gateway=club" }]) })
    );
    render(<SavedViews storageKey="t-organisations" presets={[{ name: "Blocked", query: "status=blocked" }]} />);
    openMenu();
    expect(await screen.findByRole("menuitem", { name: "Blocked" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Club money/ })).not.toBeInTheDocument();
  });

  it("reads a damaged entry as no views rather than breaking the list", async () => {
    useStorage(memoryStorage({ "moa.saved-views.t-damaged": "{not json" }));
    render(<SavedViews storageKey="t-damaged" />);
    openMenu();
    expect(await screen.findByText("Filter the list, then save it here.")).toBeInTheDocument();
  });

  it("says so when the browser blocks storage, instead of pretending it saved", async () => {
    const blocked = memoryStorage();
    blocked.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    useStorage(blocked);
    search = "status=failed";
    vi.spyOn(window, "prompt").mockReturnValue("Failed");
    const said = vi.spyOn(toast, "error");
    render(<SavedViews storageKey="t-blocked" />);
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Save current filters" }));
    expect(said).toHaveBeenCalledWith("Could not save — this browser is blocking local storage");
  });
});
