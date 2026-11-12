import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/**
 * The platform's inbox (admin@, developer@, developers@, info@) against the
 * contract's API (feature-register/mail-and-slugs-contract.md, Part M3):
 * GET /admin/mail the addresses and unread counts; GET /admin/mail/threads
 * a folder's page (mailbox=, page/page_size); GET /admin/mail/threads/{id};
 * POST …/read|unread; PATCH a move; DELETE (owner); POST /admin/mail/messages
 * multipart with from_mailbox. Owner and support only; viewer 403.
 */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "a", email: "a@x.in", full_name: "Asha", user_type: "admin", admin_role: state.role }, isPending: false }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, callsOf, routeMissing, refusal } = await import("@/test/fake-api");
const { SidebarNav } = await import("@/components/sidebar-nav");
const { navItems, isActive, visibleNavItems } = await import("@/components/nav-items");
const { PlatformMailPage, defaultFrom, mailOverviewSchema, platformListQuery } = await import("./index");
const { CSP_BLOCKED } = await import("@moa/mail-ui");

const OVERVIEW = {
  addresses: [
    { address: "admin@myotherapp.in", mailbox: "admin", unread: 0 },
    { address: "developer@myotherapp.in", mailbox: "developer", unread: 2 },
    { address: "developers@myotherapp.in", mailbox: "developers", unread: 0 },
    { address: "info@myotherapp.in", mailbox: "info", unread: 3 },
  ],
  unread_total: 5,
};

const KEYS = {
  id: 7,
  folder: "inbox",
  subject: "API keys for our app",
  participants: ["dev@partner.io"],
  message_count: 1,
  unread_count: 1,
  last_message_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  last_inbound_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  last_outbound_at: null,
  last_from: "Ravi Menon",
  snippet: "How do we get a key for the partner API?",
  has_attachments: false,
  mailbox: "developer",
};
const PRESS = { ...KEYS, id: 8, subject: "Press kit", last_from: "Meera", unread_count: 0, mailbox: "info", snippet: "Could you send the press kit?" };

const INBOUND = {
  id: 70,
  thread_id: 7,
  direction: "in",
  status: "received",
  from_address: "dev@partner.io",
  from_name: "Ravi Menon",
  to: ["developer@myotherapp.in"],
  cc: ["cto@partner.io"],
  bcc: [],
  reply_to: null,
  subject: "API keys for our app",
  text: "How do we get a key for the partner API?",
  html: '<p>How do we get a <b>key</b>?</p><img src="https://tracker.example/p.gif">',
  has_remote_images: true,
  snippet: "How do we get a key",
  unread: true,
  spam: false,
  delivered_to: "developer@myotherapp.in",
  sent_at: KEYS.last_message_at,
  created_at: KEYS.last_message_at,
  sent_by: null,
  error: null,
  attachments: [],
  mailbox: "developer",
};

const LIST = "/api/v1/admin/mail/threads";
const SEND = "/api/v1/admin/mail/messages";

beforeEach(() => {
  freshState(state);
  state.handlers["GET /api/v1/admin/mail"] = () => OVERVIEW;
  state.handlers[`GET ${LIST}`] = (c) => {
    const items = [KEYS, PRESS].filter((t) => !c.query?.mailbox || t.mailbox === c.query.mailbox);
    return { items, total: items.length, counts: { unread_total: 5, unread_threads: 2, spam_unread: 1, archive_unread: 0 } };
  };
  state.handlers[`GET ${LIST}/7`] = () => ({ thread: KEYS, messages: [INBOUND], own_addresses: OVERVIEW.addresses.map((a) => a.address) });
  state.handlers[`POST ${LIST}/7/read`] = () => ({ ...KEYS, unread_count: 0 });
  state.handlers[`POST ${LIST}/7/unread`] = () => ({ ...KEYS, unread_count: 1 });
  state.handlers[`PATCH ${LIST}/7`] = (c) => ({ ...KEYS, folder: (c.body as { folder: string }).folder });
  state.handlers[`DELETE ${LIST}/7`] = () => ({ deleted: 7 });
  state.handlers[`POST ${SEND}`] = (c) => ({ ...INBOUND, id: 90, direction: "out", status: "sent", sent_by: "Asha", text: (c.body as FormData).get("text") });
});

const posted = () => callsOf(state, "POST", SEND)[0]?.body as FormData | undefined;

// ─── The shapes ──────────────────────────────────────────────────────────

describe("reading the API", () => {
  it("reads each address's local part, from the address when the API leaves it out, and drops what it can't read", () => {
    const o = mailOverviewSchema.parse({ addresses: [{ address: "Info@MyOtherApp.in", unread: "3" }, { mailbox: "x" }, "junk"], unread_total: "3" });
    expect(o).toEqual({ addresses: [{ address: "info@myotherapp.in", mailbox: "info", unread: 3 }], unread_total: 3, can_delete: null });
    expect(mailOverviewSchema.parse({})).toEqual({ addresses: [], unread_total: 0, can_delete: null });
    expect(mailOverviewSchema.parse({ can_delete: true }).can_delete).toBe(true);
  });

  it("asks a folder's page by page and page size (and the window), for one mailbox or all", () => {
    expect(platformListQuery({ folder: "inbox", mailbox: "info", q: " keys ", offset: 50, limit: 25 })).toEqual({ mailbox: "info", folder: "inbox", q: "keys", page: 3, page_size: 25, offset: 50, limit: 25 });
    expect(platformListQuery({ folder: "sent" })).toMatchObject({ mailbox: undefined, q: undefined, page: 1, page_size: 25 });
  });

  it("answers from the address the mail came to, else the tab's, else info@", () => {
    const addresses = mailOverviewSchema.parse(OVERVIEW).addresses;
    expect(defaultFrom(addresses, "developer", "admin", "info")).toBe("developer");
    expect(defaultFrom(addresses, null, undefined, "admin")).toBe("admin");
    expect(defaultFrom(addresses, null, "nobody")).toBe("info");
    expect(defaultFrom(addresses.filter((a) => a.mailbox !== "info"))).toBe("admin");
    expect(defaultFrom([])).toBeNull();
  });
});

// ─── The side menu ───────────────────────────────────────────────────────

describe("Mail in the side menu", () => {
  it("is offered to owners and support with what is unread", async () => {
    for (const role of ["owner", "support"]) {
      state.role = role;
      const view = render(<SidebarNav />);
      const link = await screen.findByRole("link", { name: "Mail, 5 unread" });
      expect(link).toHaveAttribute("href", "/mail");
      view.unmount();
    }
  });

  it("stays out against an API without the inbox (a bare 404), and for a viewer, who isn't asked", async () => {
    state.handlers["GET /api/v1/admin/mail"] = () => {
      throw routeMissing();
    };
    const view = render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/mail")).toHaveLength(1));
    expect(screen.queryByRole("link", { name: /^Mail(,|$)/ })).toBeNull();
    view.unmount();

    freshState(state, { role: "viewer" });
    state.handlers["GET /api/v1/admin/mail"] = () => OVERVIEW;
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Mail(,|$)/ })).toBeNull();
    expect(callsOf(state, "GET", "/api/v1/admin/mail")).toHaveLength(0);
  });

  it("waits for its probe, and lights only its own pages (never Mail suppressions)", () => {
    expect(visibleNavItems(null).some((i) => i.href === "/mail")).toBe(false);
    expect(visibleNavItems(null, { mail: true }).some((i) => i.href === "/mail")).toBe(true);
    const mail = navItems.find((i) => i.href === "/mail")!;
    const suppressions = navItems.find((i) => i.href === "/mail-suppressions")!;
    expect(isActive("/mail", mail)).toBe(true);
    expect(isActive("/mail/anything", mail)).toBe(true);
    expect(isActive("/mail-suppressions", mail)).toBe(false);
    expect(isActive("/mail-suppressions", suppressions)).toBe(true);
  });
});

// ─── The page ────────────────────────────────────────────────────────────

describe("the page, before it's theirs or the API's", () => {
  it("tells a viewer it's for owners and support, and asks for nothing", async () => {
    state.role = "viewer";
    render(<PlatformMailPage />);
    expect(await screen.findByText("Mail is for owners and support")).toBeInTheDocument();
    expect(callsOf(state, "GET").some((c) => c.path.startsWith("/api/v1/admin/mail"))).toBe(false);
  });

  it("says so too when the API refuses the role", async () => {
    state.handlers["GET /api/v1/admin/mail"] = () => {
      throw refusal(403, "Your admin role cannot do this", "INSUFFICIENT_ADMIN_ROLE");
    };
    render(<PlatformMailPage />);
    expect(await screen.findByText("Mail is for owners and support")).toBeInTheDocument();
  });

  it("says calmly it isn't available yet against an API without it", async () => {
    state.handlers["GET /api/v1/admin/mail"] = () => {
      throw routeMissing();
    };
    render(<PlatformMailPage />);
    expect(await screen.findByText("Mail isn't available yet")).toBeInTheDocument();
    expect(callsOf(state, "GET", LIST)).toHaveLength(0);
  });
});

async function openKeys() {
  render(<PlatformMailPage readFile={async () => null} />);
  const list = await screen.findByRole("list", { name: "Inbox" });
  fireEvent.click(within(list).getByRole("button", { name: /Ravi Menon/ }));
  return await screen.findByRole("region", { name: "Conversation" });
}

describe("the inbox", () => {
  it("has a tab for all and each address with what is unread, and lists all of them with their mailbox", async () => {
    render(<PlatformMailPage />);
    const tabs = await screen.findByRole("group", { name: "Mailboxes" });
    expect(within(tabs).getByRole("button", { name: /All 5 unread/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(tabs).getByRole("button", { name: /developer@ 2 unread/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("button", { name: /^admin@$/ })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Inbox" });
    expect(within(list).getByRole("button", { name: /Ravi Menon/ })).toHaveTextContent("developer@");
    expect(within(list).getByRole("button", { name: /Meera/ })).toHaveTextContent("info@");
    expect(callsOf(state, "GET", LIST)[0]!.query).toMatchObject({ folder: "inbox", page: 1, page_size: 25 });
    expect(callsOf(state, "GET", LIST)[0]!.query?.mailbox).toBeUndefined();
    const folders = screen.getByRole("navigation", { name: "Folders" });
    expect(within(folders).getByRole("button", { name: /Spam 1 unread/ })).toBeInTheDocument();
  });

  it("reads one mailbox, another folder, and searches", async () => {
    render(<PlatformMailPage />);
    fireEvent.click(within(await screen.findByRole("group", { name: "Mailboxes" })).getByRole("button", { name: /^info@/ }));
    await waitFor(() => expect(callsOf(state, "GET", LIST).some((c) => c.query?.mailbox === "info")).toBe(true));
    const list = await screen.findByRole("list", { name: "Inbox" });
    await waitFor(() => expect(within(list).queryByRole("button", { name: /Ravi Menon/ })).toBeNull());
    // One mailbox: no tag on each row.
    expect(within(list).getByRole("button", { name: /Meera/ })).not.toHaveTextContent("info@");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Folders" })).getByRole("button", { name: /^Archive/ }));
    await waitFor(() => expect(callsOf(state, "GET", LIST).some((c) => c.query?.folder === "archive" && c.query?.mailbox === "info")).toBe(true));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search mail" }), { target: { value: "press" } });
    await waitFor(() => expect(callsOf(state, "GET", LIST).some((c) => c.query?.q === "press")).toBe(true));
  });

  it("opens a conversation, marks it read, shows its HTML only in the sandboxed frame and the address it came to", async () => {
    const region = await openKeys();
    await waitFor(() => expect(callsOf(state, "POST", `${LIST}/7/read`)).toHaveLength(1));
    const frame = (await within(region).findByTitle("The mail")) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-popups allow-popups-to-escape-sandbox");
    expect(frame.getAttribute("srcdoc")).toContain(`content="${CSP_BLOCKED}"`);
    expect(within(region).getByRole("button", { name: "Show images" })).toBeInTheDocument();
    expect(within(region).getByText("developer@myotherapp.in", { selector: "span" })).toBeInTheDocument();
  });

  it("archives and marks unread; deletes only for an owner, after asking", async () => {
    const region = await openKeys();
    const actions = await within(region).findByRole("group", { name: "Conversation actions" });
    fireEvent.click(within(actions).getByRole("button", { name: /Mark unread/ }));
    await waitFor(() => expect(callsOf(state, "POST", `${LIST}/7/unread`)).toHaveLength(1));
    fireEvent.click(within(actions).getByRole("button", { name: /Archive/ }));
    await waitFor(() => expect(callsOf(state, "PATCH", `${LIST}/7`)[0]?.body).toEqual({ folder: "archive" }));
    fireEvent.click(await screen.findByRole("button", { name: /Ravi Menon/ }));
    fireEvent.click(within(await screen.findByRole("group", { name: "Conversation actions" })).getByRole("button", { name: /Delete/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(callsOf(state, "DELETE", `${LIST}/7`)).toHaveLength(1));
  });

  it("keeps Delete from support, as the API says (or the role, where it doesn't)", async () => {
    state.role = "support";
    const region = await openKeys();
    const actions = await within(region).findByRole("group", { name: "Conversation actions" });
    expect(within(actions).getByRole("button", { name: /Archive/ })).toBeInTheDocument();
    expect(within(actions).queryByRole("button", { name: /Delete/ })).toBeNull();
  });

  it("follows the API's can_delete over the role", async () => {
    state.handlers["GET /api/v1/admin/mail"] = () => ({ ...OVERVIEW, can_delete: false });
    const region = await openKeys();
    const actions = await within(region).findByRole("group", { name: "Conversation actions" });
    expect(within(actions).getByRole("button", { name: /Archive/ })).toBeInTheDocument();
    expect(within(actions).queryByRole("button", { name: /Delete/ })).toBeNull();
  });
});

describe("writing", () => {
  it("answers from the address the mail came to, to the sender, as multipart with from_mailbox", async () => {
    const region = await openKeys();
    fireEvent.click(within((await within(region).findAllByRole("article"))[0]!).getByRole("button", { name: /Reply all/ }));
    const form = await screen.findByRole("form", { name: "Reply to all" });
    expect(within(form).getByLabelText("From")).toHaveValue("developer");
    expect(within(form).getByLabelText("To")).toHaveValue("dev@partner.io");
    // The platform's own addresses are never copied in.
    expect(within(form).getByLabelText("Cc")).toHaveValue("cto@partner.io");
    expect(within(form).getByLabelText("Subject")).toHaveValue("Re: API keys for our app");
    expect(within(form).queryByRole("checkbox", { name: "Add the signature" })).toBeNull();
    fireEvent.change(within(form).getByLabelText("Message"), { target: { value: "Here is how." } });
    fireEvent.click(within(form).getByRole("button", { name: /Send/ }));
    await waitFor(() => expect(posted()).toBeInstanceOf(FormData));
    const body = posted()!;
    expect(body.get("mode")).toBe("reply_all");
    expect(body.get("message_id")).toBe("70");
    expect(body.get("thread_id")).toBe("7");
    expect(body.get("from_mailbox")).toBe("developer");
    expect(body.get("cc")).toBe("cto@partner.io");
    expect(body.has("include_signature")).toBe(false);
  });

  it("writes new mail from the open tab's address, and From can be changed", async () => {
    render(<PlatformMailPage />);
    fireEvent.click(within(await screen.findByRole("group", { name: "Mailboxes" })).getByRole("button", { name: /^admin@/ }));
    fireEvent.click(screen.getByRole("button", { name: /New mail/ }));
    const form = await screen.findByRole("form", { name: "New mail" });
    const from = within(form).getByLabelText("From");
    expect(from).toHaveValue("admin");
    expect(within(from).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "MyOtherApp <admin@myotherapp.in>",
      "MyOtherApp <developer@myotherapp.in>",
      "MyOtherApp <developers@myotherapp.in>",
      "MyOtherApp <info@myotherapp.in>",
    ]);
    fireEvent.change(from, { target: { value: "info" } });
    fireEvent.change(within(form).getByLabelText("To"), { target: { value: "press@paper.in" } });
    fireEvent.change(within(form).getByLabelText("Subject"), { target: { value: "Our press kit" } });
    fireEvent.change(within(form).getByLabelText("Message"), { target: { value: "Attached." } });
    fireEvent.click(within(form).getByRole("button", { name: /Send/ }));
    await waitFor(() => expect(posted()?.get("from_mailbox")).toBe("info"));
    expect(posted()!.get("mode")).toBe("new");
    expect(posted()!.get("to")).toBe("press@paper.in");
    await waitFor(() => expect(screen.queryByRole("form", { name: "New mail" })).toBeNull());
  });

  it.each([
    ["RECIPIENT_SUPPRESSED", 422, /bounced or marked mail as spam before/],
    ["PLATFORM_MAIL_RATE_LIMITED", 429, /have sent as much as they may for now/],
    ["PLATFORM_MAIL_OFF", 404, /switched off on this server/],
  ])("says %s in words", async (code, status, words) => {
    state.handlers[`POST ${SEND}`] = () => {
      throw refusal(status, "", code);
    };
    render(<PlatformMailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New mail/ }));
    const form = await screen.findByRole("form", { name: "New mail" });
    fireEvent.change(within(form).getByLabelText("To"), { target: { value: "gone@x.in" } });
    fireEvent.change(within(form).getByLabelText("Message"), { target: { value: "Hi" } });
    fireEvent.click(within(form).getByRole("button", { name: /Send/ }));
    expect(await within(form).findByText(words)).toBeInTheDocument();
  });
});
