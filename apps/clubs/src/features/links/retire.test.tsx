import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import overviewFixture from "../__fixtures__/links-overview.json";

/**
 * Retiring a tracking link: it stops counting, keeps what it already
 * brought, and is addressed to wherever the link belongs. A club page lists
 * its events' links beside its own, so retiring an event's link from there
 * has to go to that event, not to the club.
 */
const calls: Array<{ method: string; path: string }> = [];
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
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        if (refuse) throw refuse;
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

const deletes = () => calls.filter((c) => c.method === "DELETE").map((c) => c.path);
const overviewReads = () => calls.filter((c) => c.path.endsWith("/clubs/links/overview")).length;

async function openRetire(name: string) {
  render(<LinksPage scope={{ kind: "club" }} />);
  fireEvent.click(await screen.findByRole("button", { name: `Open ${name}` }));
  fireEvent.click(await screen.findByRole("button", { name: /Retire this link/ }));
  return screen.findByRole("alertdialog");
}

describe("retiring a tracking link", () => {
  it("asks first, says what retiring does, and sends nothing on 'Keep it'", async () => {
    const dialog = await openRetire("Instagram bio");
    expect(dialog).toHaveTextContent("Retire “Instagram bio”?");
    expect(dialog).toHaveTextContent("What it already brought stays counted. Posters carrying its QR keep working.");
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(deletes()).toEqual([]);
  });

  it("retires the club page's own link at the club's address, says so, and reloads the list", async () => {
    const success = vi.spyOn(toast, "success");
    await openRetire("Instagram bio");
    const before = overviewReads();
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    await waitFor(() => expect(deletes()).toEqual(["/api/v1/clubs/links/aaaaaaaa-0000-0000-0000-000000000002"]));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Link retired. What it already brought stays counted."));
    await waitFor(() => expect(overviewReads()).toBeGreaterThan(before));
  });

  it("retires an event's link from the club page at that event's address", async () => {
    await openRetire("Freshers fair QR");
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    await waitFor(() => expect(deletes()).toEqual(["/api/v1/events/37/links/aaaaaaaa-0000-0000-0000-000000000001"]));
  });

  it("says why when the server will not retire it, and claims nothing", async () => {
    const success = vi.spyOn(toast, "success");
    const error = vi.spyOn(toast, "error");
    refuse = new ApiError({ status: 404, message: "That link was already retired" });
    await openRetire("Notice board");
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("That link was already retired"));
    expect(deletes()).toEqual(["/api/v1/events/37/links/aaaaaaaa-0000-0000-0000-000000000003"]);
    expect(success).not.toHaveBeenCalled();
  });
});
