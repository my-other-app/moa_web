import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * The Contacts item in the rail: there once the backend has the contact
 * book, for the roles that may read guests' addresses -- never door staff,
 * and not at all on a backend from before it.
 */
const calls: string[] = [];
let server: "old" | "new" = "new";
let me: unknown = null;

const caps = (role: string, over: Record<string, boolean> = {}) => ({
  role, role_label: role, role_description: "", club_id: 5, club_name: "Circuit Society", member: null,
  can: { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: role !== "door", delete_events: false, door: true, ...over },
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push(path);
        if (path === "/api/v1/clubs/access/me") {
          if (me) return me;
          throw new ApiError({ message: "Not signed in", status: 401 });
        }
        if (path === "/api/v1/clubs/contacts") {
          if (server === "old") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
          return { items: [], total: 0, page: 1, page_size: 1, groups: [] };
        }
        if (path === "/api/v1/clubs/whatsapp/account") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
        if (path === "/api/v1/clubs/entitlements") return {};
        throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { SidebarNav } = await import("@/components/sidebar-nav");

beforeEach(() => {
  calls.length = 0;
  server = "new";
  me = null;
});

const contactsLink = () => screen.queryByRole("link", { name: "Contacts" });

describe("Contacts in the rail", () => {
  it("shows once the backend has the contact book", async () => {
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Contacts" })).toHaveAttribute("href", "/contacts");
  });

  it("stays out on a backend without it", async () => {
    server = "old";
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Events" })).toBeInTheDocument();
    await waitFor(() => expect(calls).toContain("/api/v1/clubs/contacts"));
    await new Promise((r) => setTimeout(r, 20));
    expect(contactsLink()).toBeNull();
  });

  it("is never shown to door staff", async () => {
    me = caps("door");
    render(<SidebarNav />);
    await waitFor(() => expect(calls).toContain("/api/v1/clubs/access/me"));
    await new Promise((r) => setTimeout(r, 20));
    expect(contactsLink()).toBeNull();
  });

  it("follows the server's own contacts permission when it sends one", async () => {
    me = caps("editor", { contacts: false });
    render(<SidebarNav />);
    await waitFor(() => expect(calls).toContain("/api/v1/clubs/access/me"));
    await new Promise((r) => setTimeout(r, 20));
    expect(contactsLink()).toBeNull();
  });
});
