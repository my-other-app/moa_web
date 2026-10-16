import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const state: { me: unknown; search: string } = { me: null, search: "" };

const editor = {
  id: 7, email: "priya@example.com", full_name: "Priya Nair", role: "editor", role_label: "Editor", status: "active",
  invite_expired: false, invited_at: "2026-10-10T09:00:00Z", accepted_at: "2026-10-11T09:00:00Z", last_seen_at: "2026-10-16T09:00:00Z",
};
const invited = {
  id: 8, email: "door@example.com", full_name: null, role: "door", role_label: "Door", status: "invited",
  invite_expired: true, invited_at: "2026-10-01T09:00:00Z", accepted_at: null, last_seen_at: null,
};
const roles = [
  { key: "admin", label: "Admin", description: "Everything except changing who can sign in." },
  { key: "editor", label: "Editor", description: "Events, attendees, messages, designs and the website. No money and no club profile." },
  { key: "door", label: "Door", description: "Check-ins, the gate and hand-overs on the day." },
];
const can = (over: Record<string, boolean> = {}) => ({
  manage_access: true, see_access: true, money: true, club_profile: true, edit_events: true, delete_events: true, door: true, ...over,
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/finance",
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/clubs/access/me")) {
          if (!state.me) throw new Error("Not Found");
          return state.me;
        }
        if (path.endsWith("/clubs/access")) return { owner_email: "circuit@example.com", members: [editor, invited], roles, can_manage: true };
        if (path.includes("/clubs/access/invite/good")) {
          return { club_name: "Circuit Society", club_logo: null, email: "new@example.com", full_name: "Asha", role: "door", role_label: "Door", role_description: "Check-ins, the gate and hand-overs on the day.", expired: false };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/clubs/access/invite")) {
          const b = body as { email: string; role: string };
          return { member: { ...invited, id: 9, email: b.email, role: b.role, role_label: "Admin", invite_expired: false }, invite_url: "https://clubs-next.myotherapp.in/join?token=abc" };
        }
        if (path.endsWith("/resend")) return { member: invited, invite_url: "https://clubs-next.myotherapp.in/join?token=fresh" };
        if (path.endsWith("/accept")) return { email: "new@example.com", club_name: "Circuit Society" };
        throw new Error(`unstubbed POST ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return { ...editor, role: (body as { role: string }).role, role_label: "Door" };
      }),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { AccessPage, JoinPage, RouteGate, blockedBy } = await import("./index");
const { SidebarNav } = await import("@/components/sidebar-nav");

beforeEach(() => {
  calls.length = 0;
  state.me = null;
  state.search = "";
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
});

describe("the access page", () => {
  it("lists the club account first, then each person with their role, last seen and an expired invite", async () => {
    render(<AccessPage />);
    expect(await screen.findByText("The club account")).toBeInTheDocument();
    expect(screen.getByText("circuit@example.com")).toBeInTheDocument();
    expect(screen.getByText("Priya Nair")).toBeInTheDocument();
    expect(screen.getByText(/Invite expired/)).toBeInTheDocument();
    expect(screen.getByLabelText("Role for Priya Nair")).toHaveValue("editor");
    expect(screen.getByText("Resend to try again")).toBeInTheDocument();
  });

  it("invites someone with a role and shows the link to send another way", async () => {
    render(<AccessPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Invite someone/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("name@college.edu"), { target: { value: "lead@example.com" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Admin/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send invite" }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/clubs/access/invite"))).toMatchObject({ body: { email: "lead@example.com", role: "admin" } }));
    expect(await within(dialog).findByText("https://clubs-next.myotherapp.in/join?token=abc")).toBeInTheDocument();
  });

  it("changes a role, resends an invite, and asks before taking access away", async () => {
    render(<AccessPage />);
    fireEvent.change(await screen.findByLabelText("Role for Priya Nair"), { target: { value: "door" } });
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/v1/clubs/access/7", body: { role: "door" } }));

    fireEvent.click(screen.getByRole("button", { name: /Resend/ }));
    expect(await screen.findByText("https://clubs-next.myotherapp.in/join?token=fresh")).toBeInTheDocument();

    const remove = screen.getAllByRole("button", { name: /Remove/ })[0]!;
    fireEvent.click(remove);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Remove access\?/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "DELETE")).toMatchObject({ path: "/api/v1/clubs/access/7" }));
  });
});

describe("what a role may open", () => {
  it("blocks pages by role and lets the club account everywhere", () => {
    const editorCan = can({ money: false, club_profile: false, manage_access: false, see_access: false, delete_events: false });
    expect(blockedBy("/finance", editorCan)?.what).toBe("Finance");
    expect(blockedBy("/events/12/finance", editorCan)?.what).toBe("Finance");
    expect(blockedBy("/events/12/attendees", editorCan)).toBeNull();
    expect(blockedBy("/profile", editorCan)).not.toBeNull();
    expect(blockedBy("/access", editorCan)).not.toBeNull();
    const doorCan = can({ money: false, club_profile: false, manage_access: false, see_access: false, delete_events: false, edit_events: false });
    expect(blockedBy("/threads", doorCan)).not.toBeNull();
    expect(blockedBy("/events", doorCan)).toBeNull();
    for (const p of ["/finance", "/access", "/profile", "/threads"]) expect(blockedBy(p, can())).toBeNull();
  });

  it("says so on a page the role cannot open, and shows the page to the club account", async () => {
    state.me = { role: "editor", role_label: "Editor", role_description: "", can: can({ money: false }), club_id: 1, club_name: "Circuit Society", member: editor };
    const { unmount } = render(<RouteGate><p>Money figures</p></RouteGate>);
    expect(await screen.findByText(/Your role can't open Finance/)).toBeInTheDocument();
    expect(screen.queryByText("Money figures")).not.toBeInTheDocument();
    unmount();

    // A server without team access yet answers 404: the page stays the club account's.
    state.me = null;
    render(<RouteGate><p>Money figures</p></RouteGate>);
    expect(await screen.findByText("Money figures")).toBeInTheDocument();
  });

  it("shows door staff only what they can open in the rail", async () => {
    state.me = { role: "door", role_label: "Door", role_description: "", can: can({ money: false, club_profile: false, manage_access: false, see_access: false, delete_events: false, edit_events: false }), club_id: 1, club_name: "Circuit Society", member: { ...editor, role: "door", role_label: "Door" } };
    render(<SidebarNav />);
    await waitFor(() => expect(screen.queryByRole("link", { name: "Finance" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Events" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Security" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Threads" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Access" })).not.toBeInTheDocument();
  });
});

describe("joining from an invite link", () => {
  it("shows the club and role, checks the password and joins", async () => {
    state.search = "token=good";
    render(<JoinPage />);
    expect(await screen.findByText("Join Circuit Society on MyOtherApp")).toBeInTheDocument();
    expect(screen.getByDisplayValue("new@example.com")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-enough-1" } });
    fireEvent.change(screen.getByLabelText("Password again"), { target: { value: "different-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Join Circuit Society" }));
    expect(await screen.findByText(/don't match/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Password again"), { target: { value: "long-enough-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Join Circuit Society" }));
    expect(await screen.findByText("You're in")).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith("/accept"))).toMatchObject({ body: { full_name: "Asha", password: "long-enough-1" } });
  });

  it("explains a link that is missing or no longer valid", async () => {
    render(<JoinPage />);
    expect(await screen.findByText("This link is incomplete")).toBeInTheDocument();
  });
});
