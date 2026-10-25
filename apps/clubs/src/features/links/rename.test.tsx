import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import overviewFixture from "../__fixtures__/links-overview.json";

/**
 * Renaming or retagging a tracking link: PATCH where the link belongs, the
 * code and its history untouched. Before this the only way to fix a name was
 * to retire the link and make a new one, losing everything it had counted.
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let refuse: Error | null = null;

const detailOf = (id: string) => ({
  id, name: "x", code: "x7k2m9pq", url: "https://api.myotherapp.in/l/x7k2m9pq", destination: "https://myotherapp.in/events/hack-night-04",
  clicks: 0, uniques: 0, first_click_at: null, last_click_at: null, series: [], devices: [], referrers: [],
  hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, clicks: 0 })), created_at: "2099-05-20T08:00:00+00:00", generated_at: "2099-06-09T09:05:00+00:00",
});

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/clubs/links/overview")) return overviewFixture;
        const detail = path.match(/\/links\/([^/]+)\/detail$/);
        if (detail) return detailOf(detail[1]!);
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
      patch: vi.fn(async (path: string, body: Record<string, unknown>) => {
        calls.push({ method: "PATCH", path, body });
        if (refuse) throw refuse;
        const link = overviewFixture.links.find((l) => path.endsWith(l.id))!;
        return { ...link, ...body };
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { LinksPage } = await import("./components/links-page");

beforeEach(() => {
  calls.length = 0;
  refuse = null;
  vi.restoreAllMocks();
});

const patches = () => calls.filter((c) => c.method === "PATCH");

async function openEdit(name: string) {
  render(<LinksPage scope={{ kind: "club" }} />);
  fireEvent.click(await screen.findByRole("button", { name: `Open ${name}` }));
  fireEvent.click(await screen.findByRole("button", { name: /Rename or retag/ }));
  return screen.findByRole("dialog");
}

describe("renaming a tracking link", () => {
  it("opens with the link as it stands and says its history stays", async () => {
    const dialog = await openEdit("Instagram bio");
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue("Instagram bio");
    expect(within(dialog).getByLabelText(/utm_source/)).toHaveValue("instagram");
    expect(within(dialog).getByLabelText(/utm_campaign/)).toHaveValue("club-page");
    expect(dialog).toHaveTextContent("everything it already brought stay the same");
  });

  it("saves a new name and tags at the club's address", async () => {
    const success = vi.spyOn(toast, "success");
    const dialog = await openEdit("Instagram bio");
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: "Insta bio, autumn" } });
    fireEvent.change(within(dialog).getByLabelText(/utm_campaign/), { target: { value: "" } });
    fireEvent.change(within(dialog).getByLabelText(/utm_content/), { target: { value: "bio" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toEqual({
      method: "PATCH",
      path: "/api/v1/clubs/links/aaaaaaaa-0000-0000-0000-000000000002",
      body: { name: "Insta bio, autumn", utm_source: "instagram", utm_medium: "social", utm_campaign: null, utm_content: "bio" },
    });
    await waitFor(() => expect(success).toHaveBeenCalledWith("Link saved. Its code and everything it brought stay the same."));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("changes an event's link at that event's address", async () => {
    const dialog = await openEdit("Freshers fair QR");
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: "Fair poster" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(patches().map((p) => p.path)).toEqual(["/api/v1/events/37/links/aaaaaaaa-0000-0000-0000-000000000001"]));
  });

  it("refuses an empty name without asking the server", async () => {
    const dialog = await openEdit("Notice board");
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: "  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Name the link so you know where it went")).toBeInTheDocument();
    expect(patches()).toEqual([]);
  });

  it("says why when the server will not save it, and keeps the dialog open", async () => {
    const error = vi.spyOn(toast, "error");
    refuse = new ApiError({ status: 422, message: "utm_source cannot be empty." });
    const dialog = await openEdit("Notice board");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("utm_source cannot be empty."));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
