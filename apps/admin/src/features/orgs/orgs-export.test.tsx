import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

/**
 * The Organisations list's Export and Views.
 *
 * /orgs/list returns the whole collection, so the list filters, sorts and
 * searches in the browser -- and the export has to apply the same three, or
 * the file is not what the admin is looking at.
 */
let search = "";
const push = vi.fn();
const downloads: Array<{ filename: string; csv: string }> = [];

const org = (id: number, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  type: "college",
  address: "Kochi",
  phone: "9000000000",
  email: `org${id}@example.com`,
  website: "",
  logo: null,
  is_blocked: false,
  ...over,
});
let orgs: unknown[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/organizations",
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    downloadCsv: vi.fn((filename: string, csv: string) => downloads.push({ filename, csv })),
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/orgs/list") return orgs;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { OrgsTable } = await import("./index");
const { toast } = await import("@moa/ui");

const exportList = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Export" }));
  await waitFor(() => expect(downloads).toHaveLength(1));
  return downloads[0]!.csv.split("\r\n");
};

beforeEach(() => {
  search = "";
  push.mockClear();
  downloads.length = 0;
  orgs = [
    org(1, "Model Engineering College"),
    org(2, "Kerala Startup Mission", { type: "community" }),
    org(3, "Old Polytechnic", { is_blocked: true }),
    org(4, "CET", { address: "Trivandrum" }),
  ];
});

describe("exporting the organisations", () => {
  it("writes every column, sorted as the list is", async () => {
    render(<OrgsTable />);
    await screen.findByRole("link", { name: "CET" });
    const lines = await exportList();
    expect(downloads[0]!.filename).toMatch(/^organisations-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(lines[0]).toBe("ID,Name,Type,Address,Email,Phone,Status");
    expect(lines.slice(1).map((l) => l.split(",")[1])).toEqual([
      "CET",
      "Kerala Startup Mission",
      "Model Engineering College",
      "Old Polytechnic",
    ]);
    expect(lines.at(-1)).toBe("3,Old Polytechnic,college,Kochi,org3@example.com,9000000000,Blocked");
  });

  it("keeps to the type and status filters in the URL", async () => {
    search = "type=college&status=active";
    render(<OrgsTable />);
    await screen.findByRole("link", { name: "CET" });
    const lines = await exportList();
    expect(lines.slice(1).map((l) => l.split(",")[1])).toEqual(["CET", "Model Engineering College"]);
  });

  it("keeps to the search box, as the list on screen does", async () => {
    search = "q=college";
    render(<OrgsTable />);
    await screen.findByRole("link", { name: "Model Engineering College" });
    expect(screen.queryByRole("link", { name: "Kerala Startup Mission" })).not.toBeInTheDocument();
    const lines = await exportList();
    expect(lines.slice(1).map((l) => l.split(",")[1])).toEqual([
      // "college" is the type of three of them; the search reads the type too.
      "CET",
      "Model Engineering College",
      "Old Polytechnic",
    ]);
  });

  it("writes each organisation once when there are more than one export page of them", async () => {
    orgs = Array.from({ length: 150 }, (_, i) => org(i + 1, `Org ${String(i + 1).padStart(3, "0")}`));
    const said = vi.spyOn(toast, "success");
    render(<OrgsTable />);
    await screen.findByRole("link", { name: "Org 001" });
    const lines = await exportList();
    const ids = lines.slice(1).map((l) => l.split(",")[0]);
    expect(ids).toHaveLength(150);
    expect(new Set(ids).size).toBe(150);
    expect(said).toHaveBeenCalledWith("Exported 150 rows");
  });

  it("says there is nothing to export rather than handing over an empty file", async () => {
    search = "status=blocked&type=school";
    const said = vi.spyOn(toast, "info");
    render(<OrgsTable />);
    await screen.findByText("No organisations");
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(said).toHaveBeenCalledWith("Nothing to export with the current filters"));
    expect(downloads).toHaveLength(0);
  });
});

describe("the organisations' views", () => {
  it("offers the Blocked view, which opens the list filtered to it", async () => {
    render(<OrgsTable />);
    fireEvent.keyDown(await screen.findByRole("button", { name: "Views" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Blocked" }));
    expect(push).toHaveBeenCalledWith("/organizations?status=blocked", { scroll: false });
  });
});
