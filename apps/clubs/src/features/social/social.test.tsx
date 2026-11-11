import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import eventFixture from "../__fixtures__/event-detail.json";
import fixture from "../__fixtures__/social.json";

/**
 * Social auto-posting on the club dashboard
 * (feature-register/social-posting-contract.md, "Club dashboard"): the
 * Social accounts page and its states per platform and plan, the way back
 * from a platform's sign-in, the Promote tab with each platform's status
 * and what a failure offers, the post editor's counters and warnings, the
 * trigger picker, the publish step, what each role is shown, and nothing at
 * all on an API without social posting.
 */

type Role = "owner" | "admin" | "editor" | "door";
const CAN = { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: true, delete_events: false, door: true };
const me = (role: Role) => ({
  role,
  role_label: role.charAt(0).toUpperCase() + role.slice(1),
  role_description: "",
  can: role === "door" ? { ...CAN, edit_events: false } : role === "editor" ? CAN : { ...CAN, manage_access: true, see_access: true, money: true, club_profile: true, delete_events: true },
  club_id: 5,
  club_name: "GDG Trivandrum",
  member: null,
});

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const state = {
  role: "owner" as Role,
  platformsRoute: "ok" as "ok" | "old404" | "old405",
  accounts: [] as unknown[],
  posts: { attribution: {}, posts: [] } as { attribution: Record<string, number>; posts: unknown[] },
  drafts: [] as unknown[],
  settings: { approval_required: false },
  ai: false,
  eventStatus: "published",
  search: "",
};

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
let pathname = "/social";
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(state.search),
}));

const notFound = () => new ApiError({ status: 404, message: "Not Found", routeMissing: true });

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/access/me") return me(state.role);
        if (path === "/api/v1/clubs/social/platforms") {
          if (state.platformsRoute === "old404") throw notFound();
          if (state.platformsRoute === "old405") throw new ApiError({ status: 405, message: "Method Not Allowed" });
          return fixture.platforms;
        }
        if (path === "/api/v1/clubs/social/accounts") return state.accounts;
        if (path === "/api/v1/clubs/social/settings") return state.settings;
        if (path === "/api/v1/clubs/social/events/42/posts") return state.posts;
        if (path === "/api/v1/clubs/social/events/42/drafts") return state.drafts;
        if (path === "/api/v1/clubs/social/events/42/posters") return fixture.posters;
        if (path === "/api/v1/social/share-kit/42") return fixture.share_kit;
        if (path.startsWith("/api/v1/clubs/social/accounts/pending/")) return fixture.pending;
        if (path === "/api/v1/events/info/42") return { ...eventFixture, id: 42, name: "DevFest Trivandrum 2026", slug: "devfest-trivandrum-2026", status: state.eventStatus, event_datetime: "2099-11-22T10:00:00+05:30", reg_enddate: "2099-11-21T18:00:00+05:30" };
        if (path === "/api/v1/clubs/info") return { id: 5, name: "GDG Trivandrum", logo: null };
        if (path === "/api/v1/clubs/ai/status") {
          if (!state.ai) throw notFound();
          return { enabled: true, plan_allows: true, used: 0, limit: null, resets_at: null, byok: false, provider: null };
        }
        // The plan: nothing enforced (an older API), so nothing is locked by the entitlements.
        throw notFound();
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (/\/accounts\/\w+\/connect$/.test(path)) return { authorize_url: "https://www.facebook.com/v21.0/dialog/oauth?state=abc" };
        if (path.startsWith("/api/v1/clubs/social/accounts/pending/")) return { ok: true };
        if (path === "/api/v1/clubs/social/events/42/preview") {
          const b = body as { text: string };
          return { text_rendered: b.text.replace(/\{event_name\}/g, "DevFest Trivandrum 2026"), warnings: [], counts: {} };
        }
        if (path === "/api/v1/clubs/social/events/42/drafts/rewrite") return { text: "A brighter caption for DevFest #DevFest" };
        if (path === "/api/v1/clubs/social/events/42/posts") return { id: 777, name: (body as { name: string }).name, trigger: (body as { trigger: unknown }).trigger, status: (body as { draft: boolean }).draft ? "draft" : "scheduled", targets: [] };
        if (path === "/api/v1/clubs/social/events/42/posts/campaign") return { posts: [] };
        if (/\/posts\/\d+\/(approve|cancel|schedule)$/.test(path)) return null;
        if (/\/targets\/\d+\/retry$/.test(path)) return { ok: true };
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (path === "/api/v1/clubs/social/settings") return body;
        throw new Error(`unstubbed PUT ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        throw new Error(`unstubbed PATCH ${path}`);
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return undefined;
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { SocialAccountsPage, PromotePage, AnnouncePrompt } = await import("./index");
const { TriggerPicker } = await import("./components/trigger-picker");
const { browser } = await import("./queries");
const { blockedBy } = await import("@/features/access");

const writeText = vi.fn(async () => {});
beforeEach(() => {
  calls.length = 0;
  Object.assign(state, {
    role: "owner",
    platformsRoute: "ok",
    accounts: fixture.accounts,
    posts: fixture.posts,
    drafts: fixture.drafts,
    settings: { approval_required: false },
    ai: false,
    eventStatus: "published",
    search: "",
  });
  pathname = "/social";
  Object.values(router).forEach((f) => f.mockClear());
  browser.go = vi.fn();
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["x"], { type: "image/jpeg" }), { status: 200 })));
});

const card = (name: string) => screen.getByRole("region", { name });
const sent = (method: string, re: RegExp) => calls.filter((c) => c.method === method && re.test(c.path));

// ─── Social accounts ─────────────────────────────────────────────────────

describe("Settings → Social accounts", () => {
  it("shows each platform: connected, needs attention, reconnect by, coming soon, not on the plan", async () => {
    render(<SocialAccountsPage />);
    const ig = await screen.findByRole("region", { name: "Instagram" });
    expect(within(ig).getByText("Connected")).toBeInTheDocument();
    expect(within(ig).getByText("@gdgtvm")).toBeInTheDocument();
    expect(within(ig).getByText(/Connected by Ananya/)).toBeInTheDocument();

    const fb = card("Facebook");
    expect(within(fb).getByText("Needs attention")).toBeInTheDocument();
    expect(within(fb).getByText(/Reconnect — 2 posts waiting\./)).toBeInTheDocument();
    expect(within(fb).getByRole("button", { name: "Reconnect" })).toBeInTheDocument();

    expect(within(card("LinkedIn")).getByText(/Reconnect by 7 Jan/)).toBeInTheDocument();
    expect(within(card("LinkedIn Page")).getByText("Coming soon")).toBeInTheDocument();
    expect(within(card("LinkedIn Page")).getByText(/must be an admin of the LinkedIn Page/)).toBeInTheDocument();
    const x = card("X");
    expect(within(x).getByText("Not on your plan")).toBeInTheDocument();
    expect(within(x).getByRole("button", { name: "See plans" })).toBeInTheDocument();
    expect(within(x).queryByRole("button", { name: /Connect/ })).toBeNull();
  });

  it("connects through the platform's sign-in, coming back to this page", async () => {
    state.accounts = [];
    render(<SocialAccountsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Connect Instagram" }));
    await waitFor(() => expect(browser.go).toHaveBeenCalledWith("https://www.facebook.com/v21.0/dialog/oauth?state=abc"));
    const [c] = sent("POST", /\/accounts\/instagram\/connect$/);
    expect((c!.body as { return_to: string }).return_to).toMatch(/\/social$/);
  });

  it("disconnects only after asking", async () => {
    render(<SocialAccountsPage />);
    const ig = await screen.findByRole("region", { name: "Instagram" });
    fireEvent.click(within(ig).getByRole("button", { name: /Disconnect/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/We delete our access to it at once/)).toBeInTheDocument();
    expect(sent("DELETE", /accounts/)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(sent("DELETE", /\/accounts\/11$/)).toHaveLength(1));
  });

  it("an editor reads it: no connect, reconnect or disconnect, and the approval switch is the owner's", async () => {
    state.role = "editor";
    state.accounts = [fixture.accounts[1]];
    render(<SocialAccountsPage />);
    expect(await screen.findByText(/Only the club's owner or an admin can connect or disconnect/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Connect|Reconnect|Disconnect/ })).toBeNull();
    expect(within(card("Facebook")).getByText(/Ask the club's owner or an admin to reconnect it/)).toBeInTheDocument();
    expect(await screen.findByRole("switch", { name: "Editors' posts need approval" })).toBeDisabled();
  });

  it("the owner turns the approval step on", async () => {
    render(<SocialAccountsPage />);
    const sw = await screen.findByRole("switch", { name: "Editors' posts need approval" });
    fireEvent.click(sw);
    await waitFor(() => expect(sent("PUT", /\/settings$/)[0]?.body).toEqual({ approval_required: true }));
  });

  it("says why a sign-in didn't connect, and takes ?social off the address", async () => {
    state.search = "social=error&reason=not_admin&platform=linkedin_page";
    render(<SocialAccountsPage />);
    expect(await screen.findByText("Only a Page admin can post as the Page. Ask the Page's admin to connect it.")).toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith("/social");
  });

  it("Facebook with several Pages: the club picks which one to post as", async () => {
    state.search = "social=pick&pending=st_1&platform=facebook";
    render(<SocialAccountsPage />);
    const dialog = await screen.findByRole("dialog", { name: "Which Page should the club post as?" });
    fireEvent.click(await within(dialog).findByRole("radio", { name: /Women Techmakers TVM/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(sent("POST", /\/accounts\/pending\/st_1$/)[0]?.body).toEqual({ external_id: "1002" }));
  });

  it("on an API without social posting, says it isn't available yet and asks nothing more", async () => {
    state.platformsRoute = "old404";
    render(<SocialAccountsPage />);
    expect(await screen.findByText(/Connecting social accounts isn't available yet/)).toBeInTheDocument();
    expect(sent("GET", /\/social\/accounts$/)).toHaveLength(0);
  });
});

// ─── Promote ─────────────────────────────────────────────────────────────

describe("Event → Promote", () => {
  beforeEach(() => {
    pathname = "/events/42/promote";
  });

  it("registrations per platform, and each platform's status with what can be done", async () => {
    render(<PromotePage eventId={42} />);
    const by = await screen.findByRole("region", { name: "Registrations by platform" });
    expect(within(by).getByText("42")).toBeInTheDocument();
    expect(within(by).getByText("18")).toBeInTheDocument();
    expect(within(by).getByText("63 in all")).toBeInTheDocument();

    // The event changed under the reminder.
    const reminder = screen.getByTestId("post-501");
    expect(within(reminder).getByText(/The event changed — review this post/)).toBeInTheDocument();
    expect(within(reminder).getByRole("button", { name: /Review/ })).toBeInTheDocument();

    const posted = screen.getByTestId("target-9001");
    expect(within(posted).getByText("Posted")).toBeInTheDocument();
    expect(within(posted).getByRole("link", { name: /View post/ })).toHaveAttribute("href", "https://www.instagram.com/p/C0abc123/");

    const held = screen.getByTestId("target-9002");
    expect(within(held).getByText("Reconnect Facebook to send")).toBeInTheDocument();
    expect(within(held).getByRole("link", { name: "Reconnect Facebook" })).toHaveAttribute("href", "/social");
    expect(within(held).getByRole("button", { name: "Share manually" })).toBeInTheDocument();

    const failed = screen.getByTestId("target-9003");
    expect(within(failed).getByText("Failed")).toBeInTheDocument();
    expect(within(failed).getByText("LinkedIn didn't answer (after 6 tries)")).toBeInTheDocument();
    fireEvent.click(within(failed).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(sent("POST", /\/targets\/9003\/retry$/)).toHaveLength(1));
  });

  it("Share manually copies the post's text as it would go out and downloads its poster", async () => {
    render(<PromotePage eventId={42} />);
    const held = await screen.findByTestId("target-9002");
    await act(async () => {
      fireEvent.click(within(held).getByRole("button", { name: "Share manually" }));
    });
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("DevFest Trivandrum 2026 — {date}, {time}, {venue}. Register: {link}"));
    expect(fetch).toHaveBeenCalledWith("https://media.myotherapp.in/social/42/facebook.jpg", { mode: "cors" });
  });

  it("an editor's post waits for approval: owners and admins approve it, editors don't see the button", async () => {
    state.posts = { attribution: {}, posts: [{ ...fixture.posts.posts[1], id: 600, status: "needs_approval", targets: [{ ...fixture.posts.posts[1]!.targets[0], id: 9501, status: "scheduled" }] }] };
    const view = render(<PromotePage eventId={42} />);
    const post = await screen.findByTestId("post-600");
    expect(within(post).getAllByText("Needs approval").length).toBeGreaterThan(0);
    fireEvent.click(within(post).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(sent("POST", /\/posts\/600\/approve$/)).toHaveLength(1));
    view.unmount();

    state.role = "editor";
    render(<PromotePage eventId={42} />);
    const again = await screen.findByTestId("post-600");
    await screen.findByText("Waiting for an owner or admin to approve it.");
    expect(within(again).queryByRole("button", { name: "Approve" })).toBeNull();
    // An editor still can't reconnect: told whom to ask.
    expect(screen.queryByRole("link", { name: /Reconnect/ })).toBeNull();
  });

  it("the share kit has each platform's text and poster, on any plan", async () => {
    render(<PromotePage eventId={42} />);
    const kit = await screen.findByRole("region", { name: "Share kit" });
    const copy = await within(kit).findAllByRole("button", { name: /Copy text/ });
    fireEvent.click(copy[0]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("DevFest Trivandrum 2026 is coming! Link in bio. #DevFest"));
  });

  it("hides on an API without social posting", async () => {
    state.platformsRoute = "old405";
    render(<PromotePage eventId={42} />);
    expect(await screen.findByText(/Posting to social media isn't available yet/)).toBeInTheDocument();
    expect(sent("GET", /\/events\/42\/posts$/)).toHaveLength(0);
  });

  it("door staff can't open the tab or the accounts page; editors can", () => {
    const door = me("door").can;
    expect(blockedBy("/events/42/promote", door)?.what).toBe("social posting");
    expect(blockedBy("/social", door)?.what).toBe("social posting");
    expect(blockedBy("/events/42/promote", me("editor").can)).toBeNull();
  });
});

// ─── The post editor ─────────────────────────────────────────────────────

describe("the post editor", () => {
  beforeEach(() => {
    pathname = "/events/42/promote";
    state.posts = { attribution: {}, posts: [] };
    state.accounts = [fixture.accounts[0], fixture.accounts[2]];
  });

  async function openAnnouncement() {
    render(<PromotePage eventId={42} />);
    fireEvent.click(await screen.findByRole("button", { name: /Announcement/ }));
    return (await screen.findByLabelText("Text")) as HTMLTextAreaElement;
  }

  it("drafts a post per account from the event, with live counters", async () => {
    const box = await openAnnouncement();
    expect(box.value).toMatch(/^\{event_name\} is coming to \{venue\}/);
    expect(screen.getByRole("tab", { name: /Instagram/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /LinkedIn/ })).toBeInTheDocument();
    expect(screen.getByTestId("hashtag-count")).toHaveTextContent("2 / 30 hashtags");
    expect(screen.getByTestId("char-count")).toHaveTextContent(/\/ 2,200 characters/);
  });

  it("warns over 30 hashtags and won't schedule; a link in a caption offers “link in bio”", async () => {
    const box = await openAnnouncement();
    fireEvent.change(box, { target: { value: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ") } });
    expect(screen.getByTestId("hashtag-count")).toHaveTextContent("31 / 30 hashtags");
    expect(screen.getByText("31 hashtags: Instagram allows at most 30.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeDisabled();

    fireEvent.change(box, { target: { value: "Register at {link}" } });
    expect(screen.getByText(/Links in Instagram captions can't be tapped/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use “link in bio”" }));
    expect(box.value).toBe("Register at link in bio");
    expect(screen.getByRole("button", { name: "Schedule" })).toBeEnabled();
  });

  it("X counts a link as 23 and stops at 280", async () => {
    state.accounts = [{ ...fixture.accounts[0], id: 14, platform: "x", handle: "gdgtvm" }];
    state.drafts = [{ platform: "x", text: "DevFest! https://myotherapp.in/events/devfest-trivandrum-2026-and-a-very-long-slug", hashtags: [] }];
    const box = await openAnnouncement();
    expect(screen.getByTestId("char-count")).toHaveTextContent("32 / 280 characters");
    fireEvent.change(box, { target: { value: "a".repeat(281) } });
    expect(screen.getByText(/^1 over X's 280 characters/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeDisabled();
  });

  it("fill-in words go in at the cursor; Copy to all puts this text on every platform", async () => {
    const box = await openAnnouncement();
    fireEvent.change(box, { target: { value: "See you at " } });
    box.setSelectionRange(11, 11);
    fireEvent.click(screen.getByRole("button", { name: "Venue" }));
    expect(box.value).toBe("See you at {venue}");
    fireEvent.click(screen.getByRole("button", { name: /Copy to all/ }));
    fireEvent.click(screen.getByRole("tab", { name: /LinkedIn/ }));
    expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("See you at {venue}");
  });

  it("AI rewrites for the platform, and can be undone", async () => {
    state.ai = true;
    const box = await openAnnouncement();
    const before = box.value;
    fireEvent.click(await screen.findByRole("button", { name: /Rewrite for Instagram/ }));
    await waitFor(() => expect(box.value).toBe("A brighter caption for DevFest #DevFest"));
    expect(sent("POST", /\/drafts\/rewrite$/)[0]?.body).toEqual({ platform: "instagram", text: before });
    fireEvent.click(screen.getByRole("button", { name: /Undo rewrite/ }));
    expect(box.value).toBe(before);
  });

  it("saves a draft, or schedules it for a time relative to the event", async () => {
    await openAnnouncement();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(sent("POST", /\/events\/42\/posts$/)).toHaveLength(1));
    const draft = sent("POST", /\/events\/42\/posts$/)[0]!.body as { draft: boolean; name: string; trigger: unknown; targets: Array<{ platform: string; account_id: number; variant_id?: number }> };
    expect(draft).toMatchObject({ draft: true, name: "Announcement", trigger: { mode: "on_publish" } });
    expect(draft.targets.map((t) => [t.platform, t.account_id, t.variant_id])).toEqual([
      ["instagram", 11, 71],
      ["linkedin", 13, 74],
    ]);
  });

  it("schedules for two days before the event", async () => {
    await openAnnouncement();
    fireEvent.change(screen.getByRole("combobox", { name: "When it goes out" }), { target: { value: "before_start" } });
    expect(screen.getByRole("combobox", { name: "How long" })).toHaveValue("2880");
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(sent("POST", /\/events\/42\/posts$/)).toHaveLength(1));
    expect(sent("POST", /\/events\/42\/posts$/)[0]!.body).toMatchObject({ draft: false, trigger: { mode: "before_start", minutes: 2880 } });
  });

  it("“when published” on a live event asks before posting now", async () => {
    await openAnnouncement();
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Post it now?" });
    expect(sent("POST", /\/events\/42\/posts$/)).toHaveLength(0);
    fireEvent.click(within(confirm).getByRole("button", { name: "Post now" }));
    await waitFor(() => expect(sent("POST", /\/events\/42\/posts$/)).toHaveLength(1));
  });

  it("with approval on, an editor sends for approval", async () => {
    state.role = "editor";
    state.settings = { approval_required: true };
    await openAnnouncement();
    expect(await screen.findByRole("button", { name: "Send for approval" })).toBeInTheDocument();
  });
});

// ─── The trigger picker ──────────────────────────────────────────────────

describe("the trigger picker", () => {
  it("offers “before registrations close” only when the event has a closing date, and says the quiet-hours move", () => {
    const onChange = vi.fn();
    const view = render(<TriggerPicker value={{ mode: "on_publish" }} onChange={onChange} clock={{ start: "2099-11-22T10:00:00+05:30", regClose: null, status: "draft" }} />);
    expect(screen.getByRole("option", { name: /Before registrations close \(no closing date\)/ })).toBeDisabled();
    expect(screen.getByText("Goes out the moment you publish the event.")).toBeInTheDocument();
    view.unmount();

    render(<TriggerPicker value={{ mode: "before_reg_close", minutes: 1440 }} onChange={onChange} clock={{ start: "2099-11-22T10:00:00+05:30", regClose: "2099-11-21T23:59:00+05:30", status: "published" }} />);
    expect(screen.getByRole("option", { name: "Before registrations close" })).toBeEnabled();
    expect(screen.getByText(/Moved to 7 AM: nothing goes out between 11 PM and 7 AM/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "How long" }), { target: { value: "120" } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: "before_reg_close", minutes: 120 });
  });

  it("a set time is India's time; after the event and “already live” read as such", () => {
    const onChange = vi.fn();
    const view = render(<TriggerPicker value={{ mode: "at", at: "2099-11-15T04:30:00.000Z" }} onChange={onChange} clock={{ status: "published" }} />);
    const input = screen.getByLabelText("Date and time (India)") as HTMLInputElement;
    expect(input.value).toBe("2099-11-15T10:00");
    fireEvent.change(input, { target: { value: "2099-11-16T18:30" } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: "at", at: "2099-11-16T13:00:00.000Z" });
    view.unmount();

    render(<TriggerPicker value={{ mode: "on_publish" }} onChange={onChange} clock={{ status: "live" }} />);
    expect(screen.getByText(/already live, so this goes out as soon as you schedule it/)).toBeInTheDocument();
  });
});

// ─── The publish step ────────────────────────────────────────────────────

describe("the publish step: “Announce it?”", () => {
  beforeEach(() => {
    pathname = "/events/42";
    state.search = "announce=1";
    state.posts = { attribution: {}, posts: [] };
  });

  it("offers the connected accounts, ticked, and announces on one click", async () => {
    render(<AnnouncePrompt eventId={42} />);
    const dialog = await screen.findByRole("dialog", { name: "Announce it?" });
    // Facebook needs reconnecting: not offered.
    expect(within(dialog).getByRole("checkbox", { name: "Instagram @gdgtvm" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "LinkedIn @ananya-menon" })).toBeChecked();
    expect(within(dialog).queryByRole("checkbox", { name: /Facebook/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "LinkedIn @ananya-menon" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Announce it" }));
    await waitFor(() => expect(sent("POST", /\/posts\/campaign$/)[0]?.body).toEqual({ platforms: ["instagram"], account_ids: [11] }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/events/42/promote"));
  });

  it("Edit posts opens the editor on the Promote tab; Not now leaves it", async () => {
    const view = render(<AnnouncePrompt eventId={42} />);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Edit posts" }));
    expect(router.replace).toHaveBeenCalledWith("/events/42/promote?compose=announcement");
    view.unmount();
    router.replace.mockClear();

    render(<AnnouncePrompt eventId={42} />);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Not now" }));
    expect(router.replace).toHaveBeenCalledWith("/events/42");
    expect(sent("POST", /campaign/)).toHaveLength(0);
  });

  it("asks nothing when the event already has posts, for door staff, or on an older API", async () => {
    state.posts = fixture.posts;
    const a = render(<AnnouncePrompt eventId={42} />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/events/42"));
    expect(screen.queryByRole("dialog")).toBeNull();
    a.unmount();

    router.replace.mockClear();
    state.posts = { attribution: {}, posts: [] };
    state.platformsRoute = "old404";
    const b = render(<AnnouncePrompt eventId={42} />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/events/42"));
    expect(screen.queryByRole("dialog")).toBeNull();
    b.unmount();

    router.replace.mockClear();
    calls.length = 0;
    state.platformsRoute = "ok";
    state.role = "door";
    render(<AnnouncePrompt eventId={42} />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/events/42"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sent("GET", /\/social\/platforms$/)).toHaveLength(0);
  });
});
