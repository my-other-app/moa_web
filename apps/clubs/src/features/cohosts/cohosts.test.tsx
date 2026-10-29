import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import eventFixture from "../__fixtures__/event-detail.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Co-hosted events in the club dashboard (feature-register/cohosts-contract.md):
 * the event's Co-hosts tab for the host and for a co-host, the Invitations
 * page and its card on the home page, the host-only actions a co-host sees
 * reasons for instead of buttons, and a server from before co-hosts, where
 * none of it shows.
 */
type Call = { method: string; path: string; body?: unknown; query?: Record<string, unknown> };
const calls: Call[] = [];

const LOGO = { thumbnail: "https://media.test/clubs/9.thumbnail.png", medium: "https://media.test/clubs/9.medium.png", original: "https://media.test/clubs/9.png" };
const HOST = { club_id: 1, name: "Design Society", slug: "design-society", logo: null };
const ROBOTICS = { club_id: 9, name: "Robotics Club", slug: "robotics-club", logo: LOGO };
const QUIZ = { club_id: 10, name: "Quiz Club", slug: "quiz-club", logo: "https://media.test/clubs/10.png" };
const CHESS = { club_id: 11, name: "Chess Circle", slug: "chess-circle" };

const invite = (over: Record<string, unknown> = {}) => ({
  id: 7,
  event_id: 37,
  club: ROBOTICS,
  status: "accepted",
  note: null,
  invited_at: "2026-10-20T10:00:00+00:00",
  expires_at: "2026-11-03T10:00:00+00:00",
  responded_at: "2026-10-21T10:00:00+00:00",
  ended_at: null,
  invited_by: "Asha (admin)",
  ...over,
});
const listing = (over: Record<string, unknown> = {}) => ({
  event_id: 37,
  host: HOST,
  viewer_role: "host",
  can_manage: true,
  limit: 5,
  slots_left: 3,
  items: [
    invite(),
    invite({ id: 8, club: QUIZ, status: "invited", note: "Want to run this together?", responded_at: null }),
    invite({ id: 6, club: CHESS, status: "declined", responded_at: "2026-10-22T10:00:00+00:00" }),
  ],
  ...over,
});
const invitation = (over: Record<string, unknown> = {}) => ({
  id: 21,
  status: "invited",
  note: "Want to run this together?",
  invited_at: "2026-10-28T10:00:00+00:00",
  expires_at: "2099-11-11T10:00:00+00:00",
  responded_at: null,
  ended_at: null,
  invited_by: "Asha (admin)",
  host: HOST,
  event: { id: 42, name: "Hack the Campus", slug: "hack-the-campus-x1y2", poster: null, event_datetime: "2099-11-14T12:30:00+00:00", ends_at: "2099-11-14T18:30:00+00:00", location_name: "Main hall", is_online: false, status: "published", cohosts: [] },
  ...over,
});

const OWNER_CAPS = { manage_access: true, see_access: true, money: true, club_profile: true, edit_events: true, delete_events: true, door: true };
const meAs = (role: "owner" | "admin" | "editor" | "door") => ({
  role,
  role_label: role[0]!.toUpperCase() + role.slice(1),
  role_description: "",
  club_id: 9,
  club_name: "Robotics Club",
  member: null,
  can: role === "owner" || role === "admin" ? OWNER_CAPS : { ...OWNER_CAPS, manage_access: false, see_access: false, money: false, club_profile: false, delete_events: false },
});

let server: "old" | "new" = "new";
let me: unknown = null;
let detail: Record<string, unknown> = {};
let current: Record<string, unknown> = listing();
let invitations: { pending: number; items: unknown[] } = { pending: 0, items: [] };
const missing = () => new ApiError({ status: 404, message: "Not Found", routeMissing: true });
const replace = vi.fn();

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => "/events/37/cohosts",
    useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: init?.query });
        if (path === "/api/v1/clubs/access/me") {
          if (me) return me;
          throw new ApiError({ status: 401, message: "Not signed in" });
        }
        if (path === "/api/v1/events/info/37") return detail;
        if (path === "/api/v1/events/37/summary") return summaryFixture;
        if (path === "/api/v1/events/37/cohosts") {
          if (server === "old") throw missing();
          return current;
        }
        if (path === "/api/v1/events/37/cohosts/search") {
          return { items: [{ ...ROBOTICS, state: "cohosting" }, { club_id: 12, name: "Robo Ladies", slug: "robo-ladies", logo: null, state: "invitable" }, { ...HOST, state: "host" }] };
        }
        if (path === "/api/v1/clubs/cohosts/invitations") {
          if (server === "old") throw missing();
          return invitations;
        }
        if (path === "/api/v1/events/37/payments") {
          return {
            items: [{ id: "pl-asha", registration_id: "r-asha", ticket_id: "MOA-1", guest_name: "Asha Menon", guest_email: "asha@example.com", amount: 500, refunded: 0, refundable: 500, method: "upi", status: "captured", paid_at: "2026-10-18T09:30:00+00:00", gateway: "club", refunds: [] }],
            totals: { payments: 1, captured: 500, refunded: 0 },
          };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/events/37/cohosts") return invite({ id: 30, club: { club_id: 12, name: "Robo Ladies", slug: "robo-ladies", logo: null }, status: "invited", note: (body as { note?: string }).note ?? null, responded_at: null });
        if (path === "/api/v1/events/37/cohosts/leave") return invite({ status: "left", ended_at: "2026-10-29T10:00:00+00:00" });
        const answer = path.match(/^\/api\/v1\/clubs\/cohosts\/invitations\/(\d+)\/(accept|decline)$/);
        if (answer) return invitation({ id: Number(answer[1]), status: answer[2] === "accept" ? "accepted" : "declined", responded_at: "2026-10-29T10:00:00+00:00" });
        throw new Error(`unstubbed POST ${path}`);
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        const id = Number(path.split("/").pop());
        const row = (current.items as Array<Record<string, unknown>>).find((r) => r.id === id)!;
        return { ...row, status: row.status === "invited" ? "cancelled" : "removed", ended_at: "2026-10-29T10:00:00+00:00" };
      }),
      put: vi.fn(),
      patch: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const cohosts = await import("./index");
const { CohostsPanel, InvitationsPage, InvitationsCard, cohostsSupported, hostOnlyReason, inviteHistory, invitationsSchema, slotsText, splitInvitations, searchTerm, expiresText, canAnswerInvites } = cohosts;
const kit = await import("@moa/app-kit");
const { eventDetailSchema, clubEventSchema, eventsFiguresSchema, EventRowMenu } = await import("@/features/events");
const { EventConsole } = await import("@/features/console");
const { EventPaymentsPage } = await import("@/features/event-payments/components/event-payments-page");
const { EventRow } = await import("@/features/events/components/events-list");

const CLUB = { id: 1, name: "Design Society", slug: "design-society", logo: null };
const hostDetail = () => ({ ...eventFixture, club: CLUB, cohosts: [ROBOTICS], viewer_role: "host" });
const cohostDetail = () => ({ ...eventFixture, club: CLUB, cohosts: [ROBOTICS], viewer_role: "cohost" });

beforeEach(() => {
  calls.length = 0;
  server = "new";
  me = null;
  detail = hostDetail();
  current = listing();
  invitations = { pending: 0, items: [] };
  vi.restoreAllMocks();
});

const of = (method: string) => calls.filter((c) => c.method === method);

// ─── Parsing and words ──────────────────────────────────────────────────

describe("what the dashboards read", () => {
  it("parses the listing, reading a logo of sizes or a plain URL, and a status it doesn't know as over", () => {
    const l = kit.cohostListingSchema.parse(listing({ items: [invite(), invite({ id: 8, club: QUIZ }), invite({ id: 9, club: CHESS, status: "postponed" })] }));
    expect(l.host.logo).toBeNull();
    expect(kit.pickImage(l.items[0]!.club.logo, ["medium"])).toBe(LOGO.medium);
    expect(kit.pickImage(l.items[1]!.club.logo, ["thumbnail"])).toBe("https://media.test/clubs/10.png");
    expect(l.items[2]!.club.logo).toBeNull();
    expect(l.items[2]!.status).toBe("expired");
    expect(kit.isLiveCohost(l.items[2]!.status)).toBe(false);
    expect(kit.COHOST_STATUS_LABEL.accepted).toBe("Co-hosting");
    expect(kit.COHOST_STATUSES.map((s) => kit.COHOST_STATUS_LABEL[s])).toEqual(["Invited", "Co-hosting", "Declined", "Left", "Removed", "Cancelled", "Expired"]);
  });

  it("parses invitations, and puts the waiting ones first, soonest to expire first", () => {
    const parsed = invitationsSchema.parse({
      pending: 2,
      items: [
        invitation({ id: 1, status: "declined", responded_at: "2026-10-01T00:00:00+00:00" }),
        invitation({ id: 2, expires_at: "2099-12-01T00:00:00+00:00" }),
        invitation({ id: 3, expires_at: "2099-11-01T00:00:00+00:00" }),
      ],
    });
    const { pending, past } = splitInvitations(parsed.items);
    expect(pending.map((i) => i.id)).toEqual([3, 2]);
    expect(past.map((i) => i.id)).toEqual([1]);
    expect(parsed.items[0]!.event.cohosts).toEqual([]);
  });

  it("reads the event's co-hosts and who is looking, and knows an older server by their absence", () => {
    const parsed = eventDetailSchema.parse(cohostDetail());
    expect(parsed.viewer_role).toBe("cohost");
    expect(parsed.cohosts?.map((c) => c.name)).toEqual(["Robotics Club"]);
    expect(cohostsSupported(parsed)).toBe(true);
    expect(cohostsSupported({ ...eventFixture, cohosts: [] })).toBe(true);

    const old = eventDetailSchema.parse(eventFixture);
    expect(old.cohosts).toBeNull();
    expect(old.viewer_role).toBeNull();
    expect(cohostsSupported(old)).toBe(false);
    expect(cohostsSupported(eventFixture)).toBe(false);
    // Something odd from the server is not co-hosting either.
    expect(eventDetailSchema.parse({ ...eventFixture, viewer_role: "owner", cohosts: "x" }).viewer_role).toBeNull();
  });

  it("reads a list row's host and role, and a row from an older server as the club's own", () => {
    const row = { id: 3, name: "Hack the Campus", poster: null, category: null, status: "published" };
    const cohosted = clubEventSchema.parse({ ...row, club: CLUB, cohosts: [ROBOTICS], viewer_role: "cohost" });
    expect(cohosted.viewer_role).toBe("cohost");
    expect(cohosted.club?.name).toBe("Design Society");
    const old = clubEventSchema.parse(row);
    expect([old.viewer_role, old.club ?? null, old.cohosts]).toEqual([null, null, null]);
    const figures = { upcoming: 3, registered: 0, collected: 0, outstanding: 0, attention: {}, past: 0, drafts: 0, generated_at: "2026-10-29T00:00:00Z" };
    expect(eventsFiguresSchema.parse(figures).cohosted_upcoming).toBeNull();
    expect(eventsFiguresSchema.parse({ ...figures, cohosted_upcoming: 1 }).cohosted_upcoming).toBe(1);
  });

  it("says who hosts in the contract's words", () => {
    expect(kit.joinNames([])).toBe("");
    expect(kit.joinNames(["A"])).toBe("A");
    expect(kit.joinNames(["A", "B"])).toBe("A and B");
    expect(kit.joinNames(["A", "B", "C"])).toBe("A, B and C");
    expect(kit.hostedByText({ name: "Design Society" }, [])).toBe("Hosted by Design Society");
    expect(kit.hostedByText({ name: "Design Society" }, [{ name: "Robotics Club" }])).toBe("Hosted by Design Society and Robotics Club");
    expect(kit.hostedByText({ name: "A" }, [{ name: "B" }, { name: "C" }])).toBe("Hosted by A, B and C");
    expect(kit.hostedByText(null, null)).toBe("");
  });

  it("words the reasons, the places, the history and the search", () => {
    expect(hostOnlyReason("refund", "Design Society")).toBe("Only Design Society can refund — they host this event.");
    expect(hostOnlyReason("menu", null)).toBe("Only the host club can duplicate, cancel or delete it — they host this event.");
    expect(slotsText(3, 5)).toBe("3 of 5 places left");
    expect(slotsText(0, 5)).toBe("All 5 places taken");
    const now = new Date("2026-10-29T10:00:00+00:00");
    expect(expiresText("2026-11-03T10:00:00+00:00", now)).toBe("expires in 5 days");
    expect(expiresText("2026-10-29T15:00:00+00:00", now)).toBe("expires in 5 hours");
    const when = (iso: string) => iso.slice(5, 10);
    expect(inviteHistory(kit.cohostInviteSchema.parse(invite()), now, when)).toBe("Invited 10-20 by Asha (admin) · accepted 10-21");
    expect(inviteHistory(kit.cohostInviteSchema.parse(invite({ status: "invited", responded_at: null })), now, when)).toBe("Invited 10-20 by Asha (admin) · expires in 5 days");
    expect(inviteHistory(kit.cohostInviteSchema.parse(invite({ status: "removed", ended_at: "2026-10-25T00:00:00Z" })), now, when)).toBe("Invited 10-20 by Asha (admin) · removed 10-25");
    expect(searchTerm("  @@robo ")).toBe("robo");
    expect(canAnswerInvites("admin")).toBe(true);
    expect(canAnswerInvites("editor")).toBe(false);
    expect(canAnswerInvites("door")).toBe(false);
  });
});

// ─── The Co-hosts tab ───────────────────────────────────────────────────

describe("the Co-hosts tab, for the host", () => {
  it("lists the host, the live invites and the earlier ones, each with its status and the places left", async () => {
    render(<CohostsPanel eventId={37} />);
    const list = await screen.findByRole("list", { name: "Host and co-hosts" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Design Society"),
      expect.stringContaining("Robotics ClubCo-hosting"),
      expect.stringContaining("Quiz ClubInvited"),
    ]);
    expect(rows[0]).toHaveTextContent("Host");
    expect(within(rows[2]!).getByText("“Want to run this together?”")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Earlier invites" })).getByText("Declined")).toBeInTheDocument();
    expect(screen.getByTestId("cohost-slots")).toHaveTextContent("3 of 5 places left");
    // The owner may cancel the pending invite and remove the co-host; an answered one has nothing.
    expect(within(rows[1]!).getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(within(rows[2]!).getByRole("button", { name: "Cancel invite" })).toBeInTheDocument();
    expect(within(screen.getByTestId("cohost-6")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("finds clubs by name or handle and invites one with a note", async () => {
    const success = vi.spyOn(toast, "success");
    render(<CohostsPanel eventId={37} />);
    const box = await screen.findByRole("searchbox", { name: "Search clubs by name or handle" });
    fireEvent.change(box, { target: { value: "r" } });
    expect(screen.getByText(/Type two letters or more/)).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "@ro" } });
    const found = await screen.findByRole("list", { name: "Clubs found" });
    expect(calls.find((c) => c.path.endsWith("/cohosts/search"))?.query).toEqual({ q: "ro" });
    // Only an invitable club has the button; the others say why not.
    expect(within(found).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Invite Robo Ladies"]);
    expect(within(found).getByText("Co-hosting")).toBeInTheDocument();
    expect(within(found).getByText("Host")).toBeInTheDocument();

    fireEvent.click(within(found).getByRole("button", { name: "Invite Robo Ladies" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite Robo Ladies to co-host" });
    fireEvent.change(within(dialog).getByLabelText(/A note with the invite/), { target: { value: "  Run the robotics track with us?  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Send invite/ }));
    await waitFor(() => expect(of("POST")).toEqual([{ method: "POST", path: "/api/v1/events/37/cohosts", body: { club_id: 12, note: "Run the robotics track with us?" } }]));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Invite sent to Robo Ladies", expect.anything()));
  });

  it("asks before removing a co-host or cancelling an invite, then sends the one request", async () => {
    render(<CohostsPanel eventId={37} />);
    fireEvent.click(within(await screen.findByTestId("cohost-7")).getByRole("button", { name: "Remove" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Remove Robotics Club as a co-host?");
    expect(of("DELETE")).toEqual([]);
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove co-host" }));
    await waitFor(() => expect(of("DELETE").map((c) => c.path)).toEqual(["/api/v1/events/37/cohosts/7"]));

    fireEvent.click(within(screen.getByTestId("cohost-8")).getByRole("button", { name: "Cancel invite" }));
    const again = await screen.findByRole("alertdialog");
    expect(again).toHaveTextContent("Cancel the invite to Quiz Club?");
    fireEvent.click(within(again).getByRole("button", { name: "Cancel invite" }));
    await waitFor(() => expect(of("DELETE").map((c) => c.path)).toEqual(["/api/v1/events/37/cohosts/7", "/api/v1/events/37/cohosts/8"]));
  });

  it("says when all five places are taken, instead of offering the search", async () => {
    current = listing({ slots_left: 0 });
    render(<CohostsPanel eventId={37} />);
    expect(await screen.findByText(/All 5 places are taken/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Search clubs by name or handle")).not.toBeInTheDocument();
  });

  it("is read-only for the host's editors and door staff", async () => {
    me = meAs("editor");
    current = listing({ can_manage: false });
    render(<CohostsPanel eventId={37} />);
    await screen.findByRole("list", { name: "Host and co-hosts" });
    expect(screen.getByText(/Only your club's owner or an admin can invite or remove co-hosts/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Search clubs by name or handle")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel invite" })).not.toBeInTheDocument();
  });
});

describe("the Co-hosts tab, for a co-host", () => {
  beforeEach(() => {
    detail = cohostDetail();
    current = listing({ viewer_role: "cohost", can_manage: false });
  });

  it("reads the list, and lets the owner or an admin leave after a yes", async () => {
    me = meAs("admin");
    render(<CohostsPanel eventId={37} />);
    expect(await screen.findByText("You co-host this event")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Search clubs by name or handle")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Leave this event/ }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Design Society is told, and can invite you again.");
    fireEvent.click(within(confirm).getByRole("button", { name: "Leave event" }));
    await waitFor(() => expect(of("POST").map((c) => c.path)).toEqual(["/api/v1/events/37/cohosts/leave"]));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/events"));
  });

  it("doesn't offer leaving to the co-host's editors", async () => {
    me = meAs("editor");
    render(<CohostsPanel eventId={37} />);
    expect(await screen.findByText("Only your club's owner or an admin can leave this event.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Leave this event/ })).not.toBeInTheDocument();
  });
});

// ─── Invitations ────────────────────────────────────────────────────────

describe("the club's invitations", () => {
  it("lists the waiting ones with Accept and Decline, and accepts after a yes", async () => {
    invitations = { pending: 1, items: [invitation()] };
    render(<InvitationsPage />);
    const card = await screen.findByTestId("invitation-21");
    expect(card).toHaveTextContent("Design Society invited you to co-host");
    expect(card).toHaveTextContent("Hack the Campus");
    expect(card).toHaveTextContent("“Want to run this together?”");
    fireEvent.click(within(card).getByRole("button", { name: /Accept/ }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("Co-host Hack the Campus?");
    fireEvent.click(within(confirm).getByRole("button", { name: "Accept and co-host" }));
    await waitFor(() => expect(of("POST").map((c) => c.path)).toEqual(["/api/v1/clubs/cohosts/invitations/21/accept"]));
  });

  it("declines after a yes", async () => {
    invitations = { pending: 1, items: [invitation()] };
    render(<InvitationsPage />);
    fireEvent.click(within(await screen.findByTestId("invitation-21")).getByRole("button", { name: /Decline/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(of("POST").map((c) => c.path)).toEqual(["/api/v1/clubs/cohosts/invitations/21/decline"]));
  });

  it("is read-only for editors and door staff, with the reason", async () => {
    me = meAs("editor");
    invitations = { pending: 1, items: [invitation()] };
    render(<InvitationsPage />);
    const card = await screen.findByTestId("invitation-21");
    expect(await screen.findByText(/Only your club's owner or an admin can accept or decline invitations/)).toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    expect(card).toHaveTextContent("Your owner or an admin answers this.");
  });

  it("asks for every invitation once past ones are wanted", async () => {
    invitations = { pending: 0, items: [] };
    render(<InvitationsPage />);
    expect(await screen.findByText("No invitations waiting")).toBeInTheDocument();
    invitations = { pending: 0, items: [invitation({ status: "declined", responded_at: "2026-10-29T10:00:00+00:00" })] };
    fireEvent.click(screen.getByRole("button", { name: "Show past" }));
    expect(await screen.findByTestId("invitation-21")).toHaveTextContent("Declined");
    expect(calls.filter((c) => c.path === "/api/v1/clubs/cohosts/invitations").map((c) => c.query)).toEqual([{ status: "pending" }, { status: "all" }]);
  });

  it("puts a card on the home page while one waits, and nothing otherwise", async () => {
    invitations = { pending: 2, items: [invitation(), invitation({ id: 22, host: { ...HOST, name: "Film Club" }, event: { ...invitation().event, name: "Reel Night" } })] };
    const { unmount } = render(<InvitationsCard />);
    const card = await screen.findByRole("region", { name: "Co-host invitations" });
    expect(card).toHaveTextContent("2 clubs invited you to co-host");
    expect(card).toHaveTextContent("Film Club · Reel Night");
    expect(within(card).getByRole("link", { name: "Review invitations" })).toHaveAttribute("href", "/invitations");
    unmount();

    invitations = { pending: 0, items: [] };
    const { container } = render(<InvitationsCard />);
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/v1/clubs/cohosts/invitations").length).toBeGreaterThan(0));
    expect(container).toBeEmptyDOMElement();
  });
});

// ─── Host-only actions on a co-hosted event ─────────────────────────────

describe("host-only actions", () => {
  const openMenu = async (name: string) => {
    fireEvent.keyDown(await screen.findByRole("button", { name: `More for ${name}` }), { key: "Enter" });
    return screen.findByRole("menu");
  };

  it("leaves duplicating, cancelling and deleting out of a co-host's menu, and says whose they are", async () => {
    render(<EventRowMenu event={{ id: 37, name: "Hack the Campus", slug: null, registration_count: 0, viewer_role: "cohost", club: { name: "Design Society" } }} onCancel={() => undefined} />);
    const menu = await openMenu("Hack the Campus");
    expect(within(menu).queryByRole("menuitem", { name: /Duplicate/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /Delete event/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /Cancel event/ })).not.toBeInTheDocument();
    expect(within(menu).getByTestId("host-only-reason")).toHaveTextContent("Only Design Society can duplicate, cancel or delete it — they host this event.");
    expect(within(menu).getByRole("menuitem", { name: /Edit details/ })).toBeInTheDocument();
  });

  it("keeps them for the host", async () => {
    render(<EventRowMenu event={{ id: 37, name: "Hack the Campus", slug: null, registration_count: 0, viewer_role: "host" }} />);
    const menu = await openMenu("Hack the Campus");
    expect(within(menu).getByRole("menuitem", { name: /Duplicate/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Delete event/ })).toBeInTheDocument();
    expect(within(menu).queryByTestId("host-only-reason")).not.toBeInTheDocument();
  });

  it("shows a co-host's owner the payments without Refund, and says why", async () => {
    detail = cohostDetail();
    render(<EventPaymentsPage eventId={37} />);
    expect(await screen.findByText(/Only Design Society can refund — they host this event\./)).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("Asha Menon");
    expect(screen.getByRole("table")).toHaveTextContent("Design Society's Razorpay");
    expect(screen.queryByRole("button", { name: /Refund Asha Menon/ })).not.toBeInTheDocument();
  });

  it("keeps Refund for the host's owner", async () => {
    render(<EventPaymentsPage eventId={37} />);
    expect(await screen.findByRole("button", { name: /Refund Asha Menon/ })).toBeInTheDocument();
    expect(screen.queryByText(/they host this event/)).not.toBeInTheDocument();
  });

  it("marks a co-hosted event in its header, names every host and adds the Co-hosts tab", async () => {
    detail = cohostDetail();
    render(
      <EventConsole eventId={37}>
        <p>the panel</p>
      </EventConsole>,
    );
    expect(await screen.findByText("Co-hosting with Design Society")).toBeInTheDocument();
    expect(screen.getByTestId("hosted-by")).toHaveTextContent("Hosted by Design Society and Robotics Club");
    const rail = screen.getByRole("navigation", { name: "Event sections" });
    expect(within(rail).getByRole("link", { name: "Co-hosts" })).toHaveAttribute("href", "/events/37/cohosts");
  });

  it("names the co-host and the host on a list row", () => {
    const row = clubEventSchema.parse({ id: 3, name: "Hack the Campus", poster: null, category: null, status: "published", club: CLUB, cohosts: [ROBOTICS], viewer_role: "cohost" });
    render(
      <ul>
        <EventRow event={row} now={Date.now()} />
      </ul>,
    );
    expect(screen.getByText("Co-host")).toHaveAttribute("title", "Design Society hosts this event; your club co-hosts it");
    expect(screen.getByTestId("hosted-by")).toHaveTextContent("Hosted by Design Society and Robotics Club");
  });
});

// ─── An older server ────────────────────────────────────────────────────

describe("on a server from before co-hosts", () => {
  beforeEach(() => {
    server = "old";
    detail = { ...eventFixture, club: { id: 1, name: "Design Society" } };
  });

  it("has no Co-hosts tab, marker or 'Hosted by' on the event", async () => {
    render(
      <EventConsole eventId={37}>
        <p>the panel</p>
      </EventConsole>,
    );
    const rail = await screen.findByRole("navigation", { name: "Event sections" });
    await screen.findByText("Design Society");
    expect(within(rail).queryByRole("link", { name: "Co-hosts" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Co-hosting with/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("hosted-by")).not.toBeInTheDocument();
  });

  it("says the tab isn't available, with no error toast", async () => {
    const error = vi.spyOn(toast, "error");
    render(<CohostsPanel eventId={37} />);
    expect(await screen.findByText("Co-hosting isn't available here yet.")).toBeInTheDocument();
    expect(error).not.toHaveBeenCalled();
  });

  it("shows no home card and says the page isn't available", async () => {
    const { container } = render(<InvitationsCard />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/cohosts/invitations")).toBe(true));
    expect(container).toBeEmptyDOMElement();
    render(<InvitationsPage />);
    expect(await screen.findByText("Co-hosting isn't available here yet.")).toBeInTheDocument();
  });

  it("keeps every host action for the club, as before", async () => {
    render(<EventPaymentsPage eventId={37} />);
    expect(await screen.findByRole("button", { name: /Refund Asha Menon/ })).toBeInTheDocument();
  });
});

// ─── The rail ───────────────────────────────────────────────────────────

describe("Invitations in the rail", () => {
  it("shows once the server has co-hosts, with how many wait", async () => {
    const { SidebarNav } = await import("@/components/sidebar-nav");
    invitations = { pending: 2, items: [invitation(), invitation({ id: 22 })] };
    render(<SidebarNav />);
    const link = await screen.findByRole("link", { name: /Invitations/ });
    expect(link).toHaveAttribute("href", "/invitations");
    expect(link).toHaveAttribute("title", "Invitations · 2 waiting");
    expect(within(link).getByTestId("cohosts-unread")).toHaveTextContent("2 waiting");
  });

  it("isn't there on a server without co-hosts", async () => {
    const { SidebarNav } = await import("@/components/sidebar-nav");
    server = "old";
    render(<SidebarNav />);
    await screen.findByRole("link", { name: "Events" });
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/cohosts/invitations")).toBe(true));
    expect(screen.queryByRole("link", { name: /Invitations/ })).not.toBeInTheDocument();
  });
});
