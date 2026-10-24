import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * The club's bell, against GET /clubs/alerts ({items, unread}) and POST
 * /clubs/alerts/read ({ids?}): the unread count, the notices, and marking
 * them read.
 */
let answer: Record<string, unknown> = {};
const posts: Array<{ path: string; body: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/clubs/alerts") return answer;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        posts.push({ path, body });
        return { marked: 1 };
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubBell, safeLink, alertLink, ago } = await import("./index");

const NOW = new Date("2026-10-24T12:00:00Z");

beforeEach(() => {
  posts.length = 0;
  answer = {
    unread: 1,
    items: [
      { id: 2, kind: "message_quota_100", title: "You've used all 1,000 emails for October 2026", body: "1,000 of 1,000 emails sent this month on Starter.", link: "/billing", data: {}, created_at: "2026-10-24T11:55:00Z", read: false },
      { id: 1, kind: "message_quota_80", title: "You've used 80% of your emails for October 2026", body: "", link: "https://evil.example/", data: {}, created_at: "2026-10-20T10:00:00Z", read: true },
    ],
  };
});

describe("the bell's words", () => {
  it("follows only the dashboard's own paths, and says how long ago", () => {
    expect(safeLink("/billing")).toBe("/billing");
    expect(safeLink("https://evil.example/")).toBeNull();
    expect(safeLink("//evil.example")).toBeNull();
    expect(safeLink(null)).toBeNull();
    expect(ago("2026-10-24T11:59:30Z", NOW)).toBe("just now");
    expect(ago("2026-10-24T11:55:00Z", NOW)).toBe("5 min ago");
    expect(ago("2026-10-24T09:00:00Z", NOW)).toBe("3 h ago");
    expect(ago("2026-10-20T10:00:00Z", NOW)).toBe("4 d ago");
  });
});

describe("the bell", () => {
  it("counts the unread, lists the notices and marks them read", async () => {
    render(<ClubBell />);
    const bell = await screen.findByRole("button", { name: "Notifications: 1 unread" });
    fireEvent.click(bell);
    const list = await screen.findByRole("list", { name: "Latest notifications" });
    const link = within(list).getByRole("link", { name: /You've used all 1,000 emails/ });
    expect(link).toHaveAttribute("href", "/billing");
    // A link off the dashboard is never followed: that notice is a plain button.
    expect(within(list).queryByRole("link", { name: /80% of your emails/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Mark all read/ }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/v1/clubs/alerts/read", body: {} }]));
  });

  it("marks one read when it is opened", async () => {
    render(<ClubBell />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications: 1 unread" }));
    fireEvent.click(await screen.findByRole("link", { name: /You've used all 1,000 emails/ }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/v1/clubs/alerts/read", body: { ids: [2] } }]));
  });

  it("says nothing is there yet", async () => {
    answer = { unread: 0, items: [] };
    render(<ClubBell />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByText(/Warnings about your plan's monthly messages and your own WhatsApp number show up here/)).toBeInTheDocument();
  });

  it("labels the club's own WhatsApp notices and leads each to WhatsApp settings", async () => {
    answer = {
      unread: 3,
      items: [
        { id: 7, kind: "whatsapp_failed", title: "+91 98470 12345 stopped working on MyOtherApp", body: "Meta refused your club's WhatsApp number.", link: "/whatsapp/settings", data: { kind: "failed" }, created_at: "2026-10-24T11:58:00Z", read: false },
        { id: 6, kind: "whatsapp_quality", title: "+91 98470 12345: WhatsApp quality dropped", body: "Meta says its quality rating dropped from GREEN to RED.", link: null, data: {}, created_at: "2026-10-24T10:00:00Z", read: false },
        { id: 5, kind: "whatsapp_restricted", title: "Meta restricted your club's WhatsApp account", body: "", data: {}, created_at: "2026-10-23T10:00:00Z", read: false },
      ],
    };
    render(<ClubBell />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications: 3 unread" }));
    const list = await screen.findByRole("list", { name: "Latest notifications" });
    for (const [label, title] of [
      ["WhatsApp number", /stopped working on MyOtherApp/],
      ["WhatsApp quality", /WhatsApp quality dropped/],
      ["WhatsApp account", /Meta restricted your club's WhatsApp account/],
    ] as const) {
      const link = within(list).getByRole("link", { name: title });
      expect(link).toHaveAttribute("href", "/whatsapp/settings");
      expect(within(link).getByText(label)).toBeInTheDocument();
    }
    // Named nowhere, a notice leads to its kind's page; a link off the dashboard is still never followed.
    expect(alertLink({ kind: "whatsapp_quality", link: null })).toBe("/whatsapp/settings");
    expect(alertLink({ kind: "whatsapp_failed", link: "https://evil.example/" })).toBeNull();
    expect(alertLink({ kind: "something_new", link: null })).toBeNull();
    expect(alertLink({ kind: "message_quota_80", link: "/billing" })).toBe("/billing");
  });
});
