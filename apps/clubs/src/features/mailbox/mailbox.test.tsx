import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toApiError } from "@moa/api";

/**
 * The club's mailbox, against the backend's contract (app/api/club_mailbox):
 * GET /clubs/mailbox the status (never a mail); /handle-check; PUT /address;
 * PATCH /settings; PUT /signature; GET /summary the unread counts; GET
 * /threads a folder's page; GET /threads/{id} the thread, its mail and the
 * club's own addresses; POST /threads/{id}/read|unread; PATCH /threads/{id}
 * a move; DELETE /threads/{id}; POST /messages (multipart) the mail as kept,
 * sent or failed; POST /messages/{id}/retry; DELETE /mail?confirm=DELETE.
 */

const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const MAILBOX = {
  available: true,
  domain: "mail.myotherapp.in",
  plan_allows: true,
  upgrade: null,
  set_up: true,
  address: "robotics@mail.myotherapp.in",
  handle: "robotics",
  previous: [],
  display_name: null,
  signature: "The Robotics Club",
  retention_months: 12,
  next_change_at: null,
  state: "open",
  lapsed_at: null,
  readable_until: null,
  can_manage: true,
  can_mail: true,
  is_owner: true,
  impersonated: false,
  credits_left: 940,
  limits: { per_hour: 60, per_day: 300, recipients: 50, attachments_mb: 10 },
};

const UPGRADE = { feature: "mailbox", label: "A club mailbox", required_plan: "pro", required_plan_name: "Pro", upgrade_url: "https://club-dashboard.myotherapp.in/billing" };

const PARKING = {
  id: 21,
  folder: "inbox",
  subject: "Parking at the fest?",
  participants: ["ananya@example.com", "bala@example.com"],
  message_count: 2,
  unread_count: 1,
  last_message_at: ago(10 * MIN),
  last_inbound_at: ago(10 * MIN),
  last_outbound_at: ago(DAY),
  last_from: "Ananya Iyer",
  snippet: "Is there parking near Hall B?",
  has_attachments: true,
};
const SPONSOR = { ...PARKING, id: 22, subject: "Sponsorship deck", unread_count: 0, last_from: "You", snippet: "Attached is our deck", folder: "sent", last_inbound_at: null, participants: ["partners@acme.in"] };

function file(over: Record<string, unknown> = {}) {
  return { id: 301, filename: "map.pdf", content_type: "application/pdf", size_bytes: 52_000, content_id: null, inline: false, url: "/api/v1/clubs/mailbox/attachments/301", ...over };
}

const INBOUND = {
  id: 501,
  thread_id: 21,
  direction: "in",
  status: "received",
  from_address: "ananya@example.com",
  from_name: "Ananya Iyer",
  to: ["robotics@mail.myotherapp.in"],
  cc: ["bala@example.com"],
  bcc: [],
  reply_to: null,
  subject: "Parking at the fest?",
  text: "Is there parking near Hall B?\n> earlier words",
  html: '<p>Is there <b>parking</b>?</p><img src="https://tracker.example/p.gif"><img src="cid:logo1">',
  has_remote_images: true,
  snippet: "Is there parking near Hall B?",
  unread: true,
  spam: false,
  delivered_to: "robotics@mail.myotherapp.in",
  sent_at: ago(10 * MIN),
  created_at: ago(10 * MIN),
  sent_by: null,
  error: null,
  attachments: [file({ id: 300, filename: "logo.png", content_type: "image/png", size_bytes: 900, content_id: "logo1", inline: true, url: "/api/v1/clubs/mailbox/attachments/300" }), file()],
};
const FAILED = {
  ...INBOUND,
  id: 502,
  direction: "out",
  status: "failed",
  from_address: "robotics@mail.myotherapp.in",
  from_name: "Robotics",
  to: ["ananya@example.com"],
  cc: [],
  html: null,
  text: "Yes, behind Hall B.",
  has_remote_images: false,
  unread: false,
  sent_by: "Priya",
  error: "The mail service didn't take it just now. Send it again in a minute.",
  attachments: [],
};

const state: {
  mailbox: unknown;
  summary: unknown;
  threads: unknown;
  thread: Record<number, unknown>;
  send: (body: unknown) => unknown;
  handle: (h: string) => unknown;
  members: unknown[];
} = { mailbox: MAILBOX, summary: null, threads: null, thread: {}, send: () => null, handle: () => null, members: [] };
const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];

function answer(value: unknown) {
  if (value instanceof Error) throw value;
  return value;
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: options?.query });
        if (path === "/api/v1/clubs/mailbox") return answer(state.mailbox);
        if (path === "/api/v1/clubs/mailbox/summary") return answer(state.summary);
        if (path === "/api/v1/clubs/mailbox/threads") {
          const t = state.threads;
          return answer(typeof t === "function" ? (t as (q?: Record<string, unknown>) => unknown)(options?.query) : t);
        }
        if (path === "/api/v1/clubs/mailbox/handle-check") return answer(state.handle(String(options?.query?.handle ?? "")));
        const m = /^\/api\/v1\/clubs\/mailbox\/threads\/(\d+)$/.exec(path);
        if (m) return answer(state.thread[Number(m[1])]);
        if (path === "/api/v1/clubs/access/me") throw new Error("no session in tests");
        if (path === "/api/v1/clubs/access") {
          return { owner_email: "robotics@example.com", members: state.members, roles: [{ key: "editor", label: "Editor", description: "Events." }], can_manage: true };
        }
        if (path === "/api/v1/clubs/entitlements") return {};
        if (path.startsWith("/api/v1/clubs/whatsapp")) throw await toApiError(new Response(JSON.stringify({ detail: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (path === "/api/v1/clubs/mailbox/address") return { ...MAILBOX, set_up: true, handle: (body as { handle: string }).handle, address: `${(body as { handle: string }).handle}@mail.myotherapp.in` };
        if (path === "/api/v1/clubs/mailbox/signature") return { ...MAILBOX, signature: (body as { signature: string }).signature };
        const w = /^\/api\/v1\/clubs\/access\/(\d+)\/mail$/.exec(path);
        if (w) return { ...(state.members[0] as object), mail: (body as { allowed: boolean }).allowed };
        throw new Error(`unstubbed PUT ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        const r = /\/threads\/(\d+)\/(read|unread)$/.exec(path);
        if (r) return { ...((state.thread[Number(r[1])] as { thread?: object } | undefined)?.thread ?? PARKING), unread_count: r[2] === "read" ? 0 : 1 };
        if (path === "/api/v1/clubs/mailbox/messages") return answer(state.send(body));
        const retry = /\/messages\/(\d+)\/retry$/.exec(path);
        if (retry) return { ...FAILED, status: "sent", error: null };
        throw new Error(`unstubbed POST ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        if (path === "/api/v1/clubs/mailbox/settings") return { ...MAILBOX, ...(body as object) };
        if (/\/threads\/\d+$/.test(path)) return { ...PARKING, folder: (body as { folder: string }).folder };
        throw new Error(`unstubbed PATCH ${path}`);
      }),
      del: vi.fn(async (path: string, _body?: unknown, options?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "DELETE", path, query: options?.query });
        if (path === "/api/v1/clubs/mailbox/mail") return { deleted_threads: 4 };
        if (/\/threads\/\d+$/.test(path)) return { deleted: 21 };
        throw new Error(`unstubbed DELETE ${path}`);
      }),
    },
  };
});

const { render } = await import("@/test/render");
const {
  MailboxPage,
  MailSettingsPage,
  MailHtml,
  Composer,
  composeProblems,
  defaultRecipients,
  mailboxSchema,
  messageSchema,
  threadSchema,
  srcdocFor,
  cidsIn,
  withInlineImages,
  splitAddresses,
  replySubject,
  handleProblem,
  textBlocks,
  outgoingForm,
  inlineImages,
  mailNotificationFor,
  CSP_BLOCKED,
  CSP_IMAGES,
  FRAME_SANDBOX,
} = await import("./index");
const { SidebarNav } = await import("@/components/sidebar-nav");
const { navItems } = await import("@/components/nav-items");
const { AccessPage, blockedBy } = await import("@/features/access");
const { meSchema } = await import("@/features/access/schemas");

const routeMissing = () => toApiError(new Response(JSON.stringify({ detail: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
const refused = (status: number, error_code: string, message: string) =>
  toApiError(new Response(JSON.stringify({ message, errors: null, error_code, track_id: null }), { status, headers: { "Content-Type": "application/json" } }));

const readFile = vi.fn(async () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }));

beforeEach(() => {
  calls.length = 0;
  readFile.mockClear();
  Object.assign(state, {
    mailbox: MAILBOX,
    summary: { unread_total: 3, unread_threads: 2, spam_unread: 1, archive_unread: 0 },
    threads: { items: [PARKING], total: 1, counts: { unread_total: 3, unread_threads: 2, spam_unread: 1, archive_unread: 0 } },
    thread: { 21: { thread: PARKING, messages: [INBOUND, FAILED], own_addresses: ["robotics@mail.myotherapp.in", "robo@mail.myotherapp.in"] } },
    send: (body: unknown) => ({ ...FAILED, id: 600, status: "sent", error: null, text: (body as FormData).get("text") }),
    handle: (h: string) => ({ handle: h, address: `${h}@mail.myotherapp.in`, available: h !== "taken", code: h === "taken" ? "HANDLE_TAKEN" : null, message: h === "taken" ? "That address is taken. Pick another." : null }),
    members: [],
  });
});

// ─── The shapes ──────────────────────────────────────────────────────────

describe("reading the server", () => {
  it("turns what it can't read into its empty form rather than failing the page", () => {
    const mb = mailboxSchema.parse({ available: "yes", state: "frozen", previous: "x", limits: null });
    expect(mb).toMatchObject({ on_server: true, available: false, state: "open", previous: [], plan_allows: true, retention_months: 12, credits_left: null });
    expect(mb.limits).toEqual({ per_hour: 60, per_day: 300, recipients: 50, attachments_mb: 10 });
    const t = threadSchema.parse({ id: 3, folder: "trash", participants: "a" });
    expect(t).toMatchObject({ folder: "inbox", participants: [], unread_count: 0, subject: "" });
    const m = messageSchema.parse({ id: 1, thread_id: 3, direction: "sideways", status: "teleported", attachments: "x" });
    expect(m).toMatchObject({ direction: "in", status: "received", attachments: [], html: null, has_remote_images: false });
  });

  it("reads addresses, subjects and handles as the server does", () => {
    expect(splitAddresses("Ananya <A@x.in>, b@y.in; a@x.in\n")).toEqual(["a@x.in", "b@y.in"]);
    expect(replySubject("Parking?", "reply")).toBe("Re: Parking?");
    expect(replySubject("RE: Parking?", "reply_all")).toBe("RE: Parking?");
    expect(replySubject("Deck", "forward")).toBe("Fwd: Deck");
    expect(replySubject("Fw: Deck", "forward")).toBe("Fw: Deck");
    expect(handleProblem("ab")).toMatch(/3 to 30/);
    expect(handleProblem("-robo")).toMatch(/starting and ending/);
    expect(handleProblem("ro..bo")).toMatch(/two dots/);
    expect(handleProblem("Robotics.Club")).toBeNull();
    expect(textBlocks("hi\n> one\n> two\nbye")).toEqual([
      { quoted: false, lines: ["hi"] },
      { quoted: true, lines: ["> one", "> two"] },
      { quoted: false, lines: ["bye"] },
    ]);
  });

  it("writes a frame document that loads nothing from the web until asked", () => {
    const blocked = srcdocFor("<p>Hi</p>", false);
    expect(blocked).toContain(`<meta http-equiv="Content-Security-Policy" content="${CSP_BLOCKED}">`);
    expect(blocked).toContain('<base target="_blank">');
    expect(CSP_BLOCKED).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    expect(srcdocFor("<p>Hi</p>", true)).toContain(CSP_IMAGES);
    expect(CSP_IMAGES).toContain("img-src data: https: http:");
    expect(FRAME_SANDBOX).toBe("allow-popups allow-popups-to-escape-sandbox");
    expect(FRAME_SANDBOX).not.toMatch(/allow-scripts|allow-same-origin/);
  });

  it("puts the mail's own pictures in place by Content-ID, and leaves the rest blocked", async () => {
    const html = '<img src="cid:logo1"><img src=\'cid:%3Csig%3E\'><img src="cid:missing">';
    expect(cidsIn(html)).toEqual(["logo1", "sig", "missing"]);
    expect(withInlineImages(html, { logo1: "data:image/png;base64,AAA" })).toBe('<img src="data:image/png;base64,AAA"><img src=\'cid:%3Csig%3E\'><img src="cid:missing">');
    const attachments = [
      { id: 1, filename: "a.png", content_type: "image/png", size_bytes: 10, content_id: "logo1", inline: true, url: "/api/v1/clubs/mailbox/attachments/1" },
      { id: 2, filename: "b.svg", content_type: "image/svg+xml", size_bytes: 10, content_id: "sig", inline: true, url: "/api/v1/clubs/mailbox/attachments/2" },
      { id: 3, filename: "c.png", content_type: "image/png", size_bytes: 3_000_000, content_id: "missing", inline: true, url: "/api/v1/clubs/mailbox/attachments/3" },
    ];
    const found = await inlineImages(["logo1", "sig", "missing"], attachments, readFile);
    // Only a plain picture, small enough: never SVG, never past 2 MB.
    expect(Object.keys(found)).toEqual(["logo1"]);
    expect(found.logo1).toMatch(/^data:image\/png;base64,/);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith("/api/gateway/api/v1/clubs/mailbox/attachments/1");
  });

  it("builds the multipart body with the server's field names", () => {
    const pdf = new File(["%PDF"], "deck.pdf", { type: "application/pdf" });
    const form = outgoingForm({ mode: "forward", messageId: 501, to: ["a@x.in", "b@y.in"], cc: ["c@z.in"], bcc: [], subject: "Fwd: Deck", text: "See below", includeSignature: false, forwardAttachments: [301, 302], files: [pdf] });
    expect([...form.keys()]).toEqual(["mode", "message_id", "to", "cc", "subject", "text", "include_signature", "forward_attachments", "files"]);
    expect(form.get("to")).toBe("a@x.in, b@y.in");
    expect(form.get("include_signature")).toBe("false");
    expect(form.get("forward_attachments")).toBe("301,302");
    expect((form.get("files") as File).name).toBe("deck.pdf");
  });

  it("tells a notification who wrote and how many, never what", () => {
    const n = mailNotificationFor({ ...threadSchema.parse(PARKING) }, 2);
    expect(n).toEqual({ title: "Ananya Iyer", body: "2 new emails", tag: "moa-mail-21" });
    expect(JSON.stringify(n)).not.toMatch(/parking/i);
  });
});

// ─── Hidden until the backend has it, and has it on ──────────────────────

describe("the rail", () => {
  it("is in the rail's list for the Mail people, with the plan's flag", () => {
    const item = navItems.find((i) => i.href === "/mail");
    expect(item).toMatchObject({ label: "Mail", needs: "mail", feature: "mailbox", server: "mailbox" });
  });

  it("shows Mail with its unread count once the server has mailboxes on", async () => {
    render(<SidebarNav />);
    const link = await screen.findByRole("link", { name: /^Mail/ });
    expect(link).toHaveAttribute("href", "/mail");
    expect(await within(link).findByTestId("mailbox-unread")).toHaveTextContent("3");
  });

  it("leaves Mail out against a backend without the routes (FastAPI's bare 404)", async () => {
    state.mailbox = await routeMissing();
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Events" })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/mailbox")).toBe(true));
    expect(screen.queryByRole("link", { name: /^Mail/ })).toBeNull();
    expect(calls.some((c) => c.path === "/api/v1/clubs/mailbox/summary")).toBe(false);
  });

  it("leaves Mail out while the server has mailboxes switched off", async () => {
    state.mailbox = { ...MAILBOX, available: false };
    render(<SidebarNav />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/mailbox")).toBe(true));
    await act(async () => {});
    expect(screen.queryByRole("link", { name: /^Mail/ })).toBeNull();
    expect(calls.some((c) => c.path === "/api/v1/clubs/mailbox/summary")).toBe(false);
  });

  it("refuses /mail to a role without Mail only on a server that has it", () => {
    const base = { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: true, delete_events: false, door: true };
    const old = meSchema.parse({ role: "editor", role_label: "Editor", role_description: "x", can: base, club_id: 1, club_name: "R", member: null }).can;
    expect(old).toMatchObject({ mail: false, mail_known: false });
    expect(blockedBy("/mail", old)).toBeNull();
    const now = meSchema.parse({ role: "editor", role_label: "Editor", role_description: "x", can: { ...base, mail_inbox: false, mailbox_manage: false }, club_id: 1, club_name: "R", member: null }).can;
    expect(blockedBy("/mail/settings", now)?.what).toBe("Mail");
    const given = meSchema.parse({ role: "editor", role_label: "Editor", role_description: "x", can: { ...base, mail_inbox: true, mailbox_manage: false }, club_id: 1, club_name: "R", member: null }).can;
    expect(given.mail).toBe(true);
    expect(blockedBy("/mail", given)).toBeNull();
  });
});

describe("the pages ahead of the backend", () => {
  it.each([
    ["Mail", () => <MailboxPage readFile={readFile} />],
    ["Mail settings", () => <MailSettingsPage />],
  ])("%s says calmly it isn't available yet, for a missing route or a switched-off server", async (_, Page) => {
    for (const answerWith of [await routeMissing(), { ...MAILBOX, available: false }]) {
      state.mailbox = answerWith;
      const view = render(<Page />);
      const panel = await screen.findByRole("region", { name: "Mail" });
      expect(within(panel).getByText("Not available yet")).toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Mail sections" })).toBeNull();
      view.unmount();
    }
  });
});

// ─── Reading mail ────────────────────────────────────────────────────────

async function openParking() {
  render(<MailboxPage readFile={readFile} />);
  const list = await screen.findByRole("list", { name: "Inbox" });
  fireEvent.click(within(list).getByRole("button", { name: /Ananya Iyer/ }));
  return await screen.findByRole("region", { name: "Conversation" });
}

describe("the mailbox", () => {
  it("lists the folders with what is unread, and the Inbox's threads", async () => {
    render(<MailboxPage readFile={readFile} />);
    const folders = await screen.findByRole("navigation", { name: "Folders" });
    expect(await within(folders).findByRole("button", { name: /Inbox 3 unread/ })).toHaveAttribute("aria-current", "true");
    expect(within(folders).getByRole("button", { name: /Spam 1 unread/ })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Inbox" });
    const row = within(list).getByRole("button", { name: /Ananya Iyer/ });
    expect(row).toHaveTextContent("Parking at the fest?");
    expect(row).toHaveTextContent("1 unread");
    expect(screen.getByText(/940 email credits left/)).toBeInTheDocument();
  });

  it("reads another folder, searches and keeps to unread when asked", async () => {
    state.threads = (q?: Record<string, unknown>) => ({ items: q?.folder === "sent" ? [SPONSOR] : [PARKING], total: 1, counts: { unread_total: 3, unread_threads: 2, spam_unread: 1, archive_unread: 0 } });
    render(<MailboxPage readFile={readFile} />);
    const folders = await screen.findByRole("navigation", { name: "Folders" });
    fireEvent.click(within(folders).getByRole("button", { name: /^Sent/ }));
    const sent = await screen.findByRole("list", { name: "Sent" });
    expect(within(sent).getByRole("button", { name: /To partners@acme.in/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search mail" }), { target: { value: "deck" } });
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/threads") && c.query?.q === "deck" && c.query?.folder === "sent")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Unread" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/threads") && c.query?.unread === true)).toBe(true));
  });

  it("opens a thread, marks it read, and shows its HTML only in a sandboxed frame", async () => {
    const region = await openParking();
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: "POST", path: "/api/v1/clubs/mailbox/threads/21/read" })));
    const frame = (await within(region).findByTitle("The mail")) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-popups allow-popups-to-escape-sandbox");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("srcdoc")).toContain(CSP_BLOCKED);
    // Its own picture, read through the gateway, put in as data:; the tracker stays as written, blocked by the CSP.
    await waitFor(() => expect(frame.getAttribute("srcdoc")).toContain('src="data:image/png;base64,'));
    expect(frame.getAttribute("srcdoc")).toContain('src="https://tracker.example/p.gif"');
    fireEvent.click(within(region).getByRole("button", { name: "Show images" }));
    await waitFor(() => expect(frame.getAttribute("srcdoc")).toContain(CSP_IMAGES));
    expect(within(region).queryByRole("button", { name: "Show images" })).toBeNull();
    // Files, through the gateway; the inline picture isn't listed twice.
    const files = within(region).getByRole("list", { name: "Attachments" });
    expect(within(files).getByRole("link", { name: /map.pdf/ })).toHaveAttribute("href", "/api/gateway/api/v1/clubs/mailbox/attachments/301");
    expect(within(files).queryByRole("link", { name: /logo.png/ })).toBeNull();
  });

  it("shows a text mail as text, its quote folded, and a failed send with its reason and Send again", async () => {
    state.thread[21] = { thread: PARKING, messages: [{ ...INBOUND, html: null, has_remote_images: false }, FAILED], own_addresses: [] };
    const region = await openParking();
    expect(await within(region).findByText("Is there parking near Hall B?")).toBeInTheDocument();
    expect(within(region).queryByText("> earlier words")).toBeNull();
    fireEvent.click(within(region).getByRole("button", { name: "Show the quoted text" }));
    expect(within(region).getByText("> earlier words")).toBeInTheDocument();
    expect(within(region).queryByTitle("The mail")).toBeNull();
    expect(within(region).getByText(/didn't take it just now/)).toBeInTheDocument();
    fireEvent.click(within(region).getByRole("button", { name: /Send again/ }));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: "POST", path: "/api/v1/clubs/mailbox/messages/502/retry" })));
  });

  it("archives, moves to spam, marks unread and deletes after asking", async () => {
    const region = await openParking();
    const actions = await within(region).findByRole("group", { name: "Conversation actions" });
    fireEvent.click(within(actions).getByRole("button", { name: /Mark unread/ }));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: "POST", path: "/api/v1/clubs/mailbox/threads/21/unread" })));
    fireEvent.click(within(actions).getByRole("button", { name: /Archive/ }));
    await waitFor(() => expect(calls).toContainEqual({ method: "PATCH", path: "/api/v1/clubs/mailbox/threads/21", body: { folder: "archive" } }));
    fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
    const again = await screen.findByRole("group", { name: "Conversation actions" });
    fireEvent.click(within(again).getByRole("button", { name: /^Spam/ }));
    await waitFor(() => expect(calls).toContainEqual({ method: "PATCH", path: "/api/v1/clubs/mailbox/threads/21", body: { folder: "spam" } }));
    fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
    fireEvent.click(within(await screen.findByRole("group", { name: "Conversation actions" })).getByRole("button", { name: /Delete/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/deleted for good/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: "DELETE", path: "/api/v1/clubs/mailbox/threads/21" })));
  });

  it("offers Not spam in Spam", async () => {
    state.thread[21] = { thread: { ...PARKING, folder: "spam" }, messages: [INBOUND], own_addresses: [] };
    const region = await openParking();
    expect(await within(region).findByText(/This looks like spam/)).toBeInTheDocument();
    fireEvent.click(within(region).getByRole("button", { name: /Not spam/ }));
    await waitFor(() => expect(calls).toContainEqual({ method: "PATCH", path: "/api/v1/clubs/mailbox/threads/21", body: { folder: "inbox" } }));
  });

  it("says why it's closed to an admin acting as the club, or a member without the permission, and asks for no mail", async () => {
    state.mailbox = { ...MAILBOX, impersonated: true, can_mail: false, can_manage: true, is_owner: false, signature: null };
    const view = render(<MailboxPage readFile={readFile} />);
    expect(await screen.findByText("Mail is for the club's own team")).toBeInTheDocument();
    view.unmount();
    state.mailbox = { ...MAILBOX, can_mail: false, can_manage: false, is_owner: false };
    render(<MailboxPage readFile={readFile} />);
    expect(await screen.findByText("Mail needs the Mail permission")).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/threads"))).toBe(false);
  });

  it("asks for the address first, and shows the plan's lock on other plans", async () => {
    state.mailbox = { ...MAILBOX, set_up: false, address: null, handle: null, plan_allows: false, upgrade: UPGRADE };
    render(<MailboxPage readFile={readFile} />);
    expect(await screen.findByText("Pick the club's address to start")).toBeInTheDocument();
    expect(screen.getByText(/A club mailbox is part of Pro and Enterprise/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/billing");
    expect(screen.queryByRole("button", { name: /New mail/ })).toBeNull();
  });

  it("explains a lapse: readable until a date, then export or delete", async () => {
    state.mailbox = { ...MAILBOX, plan_allows: false, state: "lapsed", lapsed_at: ago(DAY), readable_until: ahead(29 * DAY) };
    const view = render(<MailboxPage readFile={readFile} />);
    expect(await screen.findByText("Your plan no longer includes the mailbox.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New mail/ })).toBeNull();
    expect(await screen.findByRole("list", { name: "Inbox" })).toBeInTheDocument();
    view.unmount();
    state.mailbox = { ...MAILBOX, plan_allows: false, state: "expired" };
    render(<MailboxPage readFile={readFile} />);
    expect(await screen.findByText(/its 30 days are over/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mailbox" })).toBeNull();
  });
});

// ─── Writing mail ────────────────────────────────────────────────────────

describe("writing mail", () => {
  const inbound = messageSchema.parse(INBOUND);

  it("answers the sender, everyone but the club on reply-all, and nobody yet on a forward", () => {
    const own = ["robotics@mail.myotherapp.in"];
    expect(defaultRecipients({ mode: "reply", original: inbound, ownAddresses: own })).toEqual({ to: ["ananya@example.com"], cc: [] });
    expect(defaultRecipients({ mode: "reply_all", original: inbound, ownAddresses: own })).toEqual({ to: ["ananya@example.com"], cc: ["bala@example.com"] });
    expect(defaultRecipients({ mode: "reply", original: { ...inbound, reply_to: "desk@example.com" }, ownAddresses: own }).to).toEqual(["desk@example.com"]);
    expect(defaultRecipients({ mode: "forward", original: inbound, ownAddresses: own })).toEqual({ to: [], cc: [] });
    expect(composeProblems({ to: "", cc: "", bcc: "", text: "", mode: "new", bytes: 0 })).toEqual({ to: "Who is it to? Add an address.", text: "Write something first." });
    expect(composeProblems({ to: "not-an-address", cc: "", bcc: "", text: "x", mode: "new", bytes: 0 }).to).toMatch(/isn't an email address/);
    expect(composeProblems({ to: "a@x.in", cc: "", bcc: "", text: "", mode: "forward", bytes: 11 * 1024 * 1024 })).toEqual({ files: expect.stringMatching(/10 MB/) });
  });

  it("writes new mail as multipart, with the signature by default", async () => {
    render(<MailboxPage readFile={readFile} />);
    fireEvent.click(await screen.findByRole("button", { name: /New mail/ }));
    const form = await screen.findByRole("form", { name: "New mail" });
    fireEvent.click(within(form).getByRole("button", { name: /Send/ }));
    expect(await within(form).findByText("Who is it to? Add an address.")).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/api/v1/clubs/mailbox/messages")).toBe(false);
    fireEvent.change(within(form).getByLabelText("To"), { target: { value: "Partner <Partners@Acme.in>" } });
    fireEvent.change(within(form).getByLabelText("Subject"), { target: { value: "Sponsorship" } });
    fireEvent.change(within(form).getByLabelText("Message"), { target: { value: "Hello from the club" } });
    const pdf = new File(["%PDF-1.4"], "deck.pdf", { type: "application/pdf" });
    fireEvent.change(within(form).getByLabelText("Attach files"), { target: { files: [pdf] } });
    expect(within(form).getByRole("list", { name: "Files" })).toHaveTextContent("deck.pdf");
    fireEvent.click(within(form).getByRole("button", { name: /Send/ }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/mailbox/messages")).toBe(true));
    const body = calls.find((c) => c.path === "/api/v1/clubs/mailbox/messages")!.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("mode")).toBe("new");
    expect(body.get("to")).toBe("partners@acme.in");
    expect(body.get("subject")).toBe("Sponsorship");
    expect(body.get("text")).toBe("Hello from the club");
    expect(body.get("include_signature")).toBe("true");
    expect((body.get("files") as File).name).toBe("deck.pdf");
    await waitFor(() => expect(screen.queryByRole("form", { name: "New mail" })).toBeNull());
  });

  it("refuses files past 10 MB together before sending", async () => {
    render(<MailboxPage readFile={readFile} />);
    fireEvent.click(await screen.findByRole("button", { name: /New mail/ }));
    const form = await screen.findByRole("form", { name: "New mail" });
    const big = new File([new Uint8Array(1)], "video.mp4", { type: "video/mp4" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    fireEvent.change(within(form).getByLabelText("Attach files"), { target: { files: [big] } });
    expect(await within(form).findByText(/10 MB at most together/)).toBeInTheDocument();
  });

  it("replies to all with the right people and subject, quoting the mail", async () => {
    const region = await openParking();
    const card = (await within(region).findAllByRole("article"))[0]!;
    fireEvent.click(within(card).getByRole("button", { name: /Reply all/ }));
    const form = await screen.findByRole("form", { name: "Reply to all" });
    expect(within(form).getByLabelText("To")).toHaveValue("ananya@example.com");
    expect(within(form).getByLabelText("Cc")).toHaveValue("bala@example.com");
    expect(within(form).getByLabelText("Subject")).toHaveValue("Re: Parking at the fest?");
    fireEvent.change(within(form).getByLabelText("Message"), { target: { value: "Yes, behind Hall B." } });
    fireEvent.click(within(form).getByRole("button", { name: /Send/ }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/mailbox/messages")).toBe(true));
    const body = calls.find((c) => c.path === "/api/v1/clubs/mailbox/messages")!.body as FormData;
    expect(body.get("mode")).toBe("reply_all");
    expect(body.get("message_id")).toBe("501");
    expect(body.get("cc")).toBe("bala@example.com");
  });

  it("forwards with the original's files, any of which can stay behind", async () => {
    const region = await openParking();
    const card = (await within(region).findAllByRole("article"))[0]!;
    fireEvent.click(within(card).getByRole("button", { name: /Forward/ }));
    const form = await screen.findByRole("form", { name: "Forward" });
    expect(within(form).getByLabelText("Subject")).toHaveValue("Fwd: Parking at the fest?");
    fireEvent.click(within(form).getByRole("button", { name: "Don't send logo.png" }));
    fireEvent.change(within(form).getByLabelText("To"), { target: { value: "desk@example.com" } });
    fireEvent.click(within(form).getByRole("button", { name: /Send/ }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/mailbox/messages")).toBe(true));
    const body = calls.find((c) => c.path === "/api/v1/clubs/mailbox/messages")!.body as FormData;
    expect(body.get("mode")).toBe("forward");
    expect(body.get("forward_attachments")).toBe("301");
  });

  it.each([
    ["NO_EMAIL_CREDITS", 402, "You're out of email credits. Buy more email credits to send from the club's mailbox."],
    ["MAILBOX_RATE_LIMITED", 429, "The club's mailbox sends at most 60 an hour. Try again later."],
    ["RECIPIENT_SUPPRESSED", 422, "a@x.in can't be mailed: it bounced or marked our mail as spam before. Take it out to send."],
  ])("says %s in words", async (code, status, message) => {
    state.send = () => {
      throw new Error("replaced below");
    };
    const err = await refused(status, code, message);
    state.send = () => err;
    render(<MailboxPage readFile={readFile} />);
    fireEvent.click(await screen.findByRole("button", { name: /New mail/ }));
    const form = await screen.findByRole("form", { name: "New mail" });
    fireEvent.change(within(form).getByLabelText("To"), { target: { value: "a@x.in" } });
    fireEvent.change(within(form).getByLabelText("Message"), { target: { value: "Hi" } });
    fireEvent.click(within(form).getByRole("button", { name: /Send/ }));
    expect(await within(form).findByText(message)).toBeInTheDocument();
    if (code === "NO_EMAIL_CREDITS") expect(within(form).getByRole("link", { name: "Buy more email credits" })).toHaveAttribute("href", "/billing");
  });
});

// ─── Settings ────────────────────────────────────────────────────────────

describe("Mail settings", () => {
  it("sets the mailbox up at a free address, checked with the server as it is typed", async () => {
    state.mailbox = { ...MAILBOX, set_up: false, address: null, handle: null };
    render(<MailSettingsPage />);
    const form = await screen.findByRole("form", { name: "Pick the address" });
    const input = within(form).getByLabelText("The club's address");
    fireEvent.change(input, { target: { value: "ab" } });
    expect(within(form).getByText("An address is 3 to 30 characters.")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "taken" } });
    expect(await within(form).findByText("That address is taken. Pick another.")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: /Set up the mailbox/ })).toBeDisabled();
    fireEvent.change(input, { target: { value: "Robotics" } });
    expect(await within(form).findByText("robotics@mail.myotherapp.in is free.")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: /Set up the mailbox/ }));
    await waitFor(() => expect(calls).toContainEqual({ method: "PUT", path: "/api/v1/clubs/mailbox/address", body: { handle: "robotics" } }));
  });

  it("says when the address can change next, and where the old ones still forward", async () => {
    state.mailbox = { ...MAILBOX, next_change_at: ahead(20 * DAY), previous: [{ address: "robo@mail.myotherapp.in", forward_until: ahead(80 * DAY) }] };
    render(<MailSettingsPage />);
    const card = await screen.findByRole("region", { name: "The address" });
    expect(within(card).getByText("robotics@mail.myotherapp.in")).toBeInTheDocument();
    expect(within(card).getByText(/robo@mail.myotherapp.in still forwards here until/)).toBeInTheDocument();
    expect(within(card).getByText(/can change once a month. The next change can be made on/)).toBeInTheDocument();
    expect(within(card).queryByRole("form")).toBeNull();
  });

  it("warns that a changed address forwards 90 days", async () => {
    render(<MailSettingsPage />);
    const form = await screen.findByRole("form", { name: "Change the address" });
    expect(within(form).getByText(/keeps forwarding here for 90 days/)).toBeInTheDocument();
  });

  it("saves the name, retention and signature", async () => {
    render(<MailSettingsPage />);
    const sending = await screen.findByRole("form", { name: "Sending and keeping" });
    fireEvent.change(within(sending).getByLabelText("The name mail is sent as"), { target: { value: "Robotics Club" } });
    fireEvent.change(within(sending).getByLabelText("Keep mail for"), { target: { value: "24" } });
    fireEvent.click(within(sending).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls).toContainEqual({ method: "PATCH", path: "/api/v1/clubs/mailbox/settings", body: { display_name: "Robotics Club", retention_months: 24 } }));
    const sig = screen.getByRole("form", { name: "Signature" });
    fireEvent.change(within(sig).getByLabelText("Signature"), { target: { value: "Robotics, IIT" } });
    fireEvent.click(within(sig).getByRole("button", { name: "Save the signature" }));
    await waitFor(() => expect(calls).toContainEqual({ method: "PUT", path: "/api/v1/clubs/mailbox/signature", body: { signature: "Robotics, IIT" } }));
  });

  it("lets the club's own account export everything, or delete it after typing DELETE", async () => {
    render(<MailSettingsPage />);
    const all = await screen.findByRole("region", { name: "All of the mail" });
    expect(within(all).getByRole("link", { name: /Export all mail/ })).toHaveAttribute("href", "/api/gateway/api/v1/clubs/mailbox/export");
    fireEvent.click(within(all).getByRole("button", { name: /Delete all mail/ }));
    const dialog = await screen.findByRole("alertdialog");
    const go = within(dialog).getByRole("button", { name: "Delete all mail" });
    expect(go).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    fireEvent.click(go);
    await waitFor(() => expect(calls).toContainEqual({ method: "DELETE", path: "/api/v1/clubs/mailbox/mail", query: { confirm: "DELETE" } }));
  });

  it("keeps export and deletion from a member, and the address and settings from one who can't manage", async () => {
    state.mailbox = { ...MAILBOX, is_owner: false, can_manage: false };
    render(<MailSettingsPage />);
    expect(await screen.findByRole("form", { name: "Signature" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "All of the mail" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Sending and keeping" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Change the address" })).toBeNull();
  });

  it("shows the plan's lock, and the lapse's way out", async () => {
    state.mailbox = { ...MAILBOX, set_up: false, address: null, plan_allows: false, upgrade: UPGRADE };
    const view = render(<MailSettingsPage />);
    expect(await screen.findByText(/A club mailbox is part of Pro and Enterprise/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Pick the address" })).toBeNull();
    view.unmount();
    state.mailbox = { ...MAILBOX, plan_allows: false, state: "expired" };
    render(<MailSettingsPage />);
    expect(await screen.findByText(/its 30 days are over/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Export all mail/ })).toBeInTheDocument();
  });

  it("tells an admin acting as the club that mail is private", async () => {
    state.mailbox = { ...MAILBOX, impersonated: true, can_mail: false, is_owner: false, signature: null };
    render(<MailSettingsPage />);
    expect(await screen.findByText(/A club's mail is for its own team/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Signature" })).toBeNull();
  });
});

// ─── The Mail permission ─────────────────────────────────────────────────

describe("the Mail permission on Access", () => {
  const PRIYA = { id: 7, email: "priya@example.com", full_name: "Priya Nair", role: "editor", role_label: "Editor", status: "active", invite_expired: false, invited_at: null, accepted_at: null, last_seen_at: null, whatsapp: false, mail: false };

  it("is given person by person, once the server has mailboxes on", async () => {
    state.members = [PRIYA];
    render(<AccessPage />);
    const toggle = await screen.findByRole("switch", { name: "Mail permission for Priya Nair" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/reads, answers and sends the club's mail/)).toBeInTheDocument();
    fireEvent.click(toggle);
    await waitFor(() => expect(calls).toContainEqual({ method: "PUT", path: "/api/v1/clubs/access/7/mail", body: { allowed: true } }));
  });

  it("isn't offered against a server without mailboxes, or with them off", async () => {
    state.members = [PRIYA];
    state.mailbox = { ...MAILBOX, available: false };
    render(<AccessPage />);
    expect(await screen.findByRole("combobox", { name: "Role for Priya Nair" })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/mailbox")).toBe(true));
    await act(async () => {});
    expect(screen.queryByRole("switch", { name: /Mail permission/ })).toBeNull();
  });
});

// ─── The frame on its own ────────────────────────────────────────────────

describe("MailHtml", () => {
  it("shows no images bar when the mail has nothing from the web", async () => {
    render(<MailHtml html="<p>Plain</p>" attachments={[]} hasRemoteImages={false} readFile={readFile} />);
    const frame = screen.getByTitle("The mail");
    expect(frame.getAttribute("srcdoc")).toContain("<p>Plain</p>");
    expect(screen.queryByRole("button", { name: "Show images" })).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });
});

describe("the composer on its own", () => {
  it("leaves the signature off when asked", async () => {
    render(<Composer target={{ mode: "new" }} signature="The Robotics Club" open onOpenChange={() => {}} />);
    const form = await screen.findByRole("form", { name: "New mail" });
    fireEvent.click(within(form).getByRole("checkbox", { name: "Add the signature" }));
    fireEvent.change(within(form).getByLabelText("To"), { target: { value: "a@x.in" } });
    fireEvent.change(within(form).getByLabelText("Message"), { target: { value: "Hi" } });
    fireEvent.click(within(form).getByRole("button", { name: /Send/ }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/mailbox/messages")).toBe(true));
    expect((calls.find((c) => c.path === "/api/v1/clubs/mailbox/messages")!.body as FormData).get("include_signature")).toBe("false");
  });
});
