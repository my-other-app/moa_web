import { describe, expect, it } from "vitest";
import { ApiError } from "@moa/api";

import fixture from "../__fixtures__/social.json";
import { isSocialMissing } from "./api";
import { socialAttention, socialAttentionHref } from "./attention";
import {
  accountsSchema,
  cardState,
  connectErrorText,
  countChars,
  cropWindow,
  draftsSchema,
  eventPostsSchema,
  fillIn,
  imageProblem,
  localWarnings,
  mergeWarnings,
  outOfQuietHours,
  pendingChoicesSchema,
  platformsSchema,
  readConnectReturn,
  targetChip,
  textStats,
  triggerLabel,
  triggerTime,
  truncateFor,
  variantsSchema,
  type PostTarget,
} from "./schemas";

/**
 * Social auto-posting, the rules without a screen
 * (feature-register/social-posting-contract.md): reading the API's shapes
 * leniently, each platform card's state, the way back from a platform's
 * sign-in, the counters and warnings, triggers and quiet hours, each
 * platform's status and what can be done about it, the poster crop, and
 * the overview's attention items.
 */

const platforms = platformsSchema.parse(fixture.platforms);
const accounts = accountsSchema.parse(fixture.accounts);
const posts = eventPostsSchema.parse(fixture.posts);

describe("the API's shapes", () => {
  it("reads the contract's platforms, accounts, posts, drafts and posters", () => {
    expect(platforms.map((p) => p.platform)).toEqual(["facebook", "instagram", "linkedin", "linkedin_page", "x"]);
    expect(accounts[1]).toMatchObject({ platform: "facebook", status: "needs_reconnect", waiting_posts: 2, connected_by: { id: 3, name: "Ananya" } });
    expect(posts.attribution).toEqual({ instagram: 42, linkedin: 18, x: 3 });
    expect(posts.posts[1]!.targets[2]!.error).toEqual({ code: "platform_down", message: "LinkedIn didn't answer", action: "retry" });
    expect(draftsSchema.parse(fixture.drafts)[0]).toMatchObject({ platform: "instagram", variantId: 71, link: "https://myotherapp.in/l/ig42", hashtags: ["DevFest", "GDGTrivandrum", "Trivandrum", "Kerala"] });
    expect(variantsSchema.parse(fixture.posters)).toHaveLength(6);
  });

  it("drops a row it doesn't know (a new platform) instead of failing the page", () => {
    const rows = platformsSchema.parse([...fixture.platforms, { platform: "threads", available: true }]);
    expect(rows).toHaveLength(5);
    expect(accountsSchema.parse([{ id: 1, platform: "mastodon" }, fixture.accounts[0]])).toHaveLength(1);
  });

  it("reads drafts keyed by platform, under `drafts`, or as a list; hashtags with or without #", () => {
    const keyed = draftsSchema.parse({ instagram: { text: "Hi", suggested_hashtags: ["#gdg"], variant: fixture.posters[0], tracking_link: { url: "https://x.y/1" } } });
    expect(keyed[0]).toMatchObject({ platform: "instagram", hashtags: ["gdg"], variantId: 71, link: "https://x.y/1" });
    expect(draftsSchema.parse({ drafts: fixture.drafts })).toHaveLength(3);
  });

  it("reads a pending choice's list bare or wrapped", () => {
    expect(pendingChoicesSchema.parse(fixture.pending).map((c) => c.name)).toEqual(["GDG Trivandrum", "Women Techmakers TVM"]);
    expect(pendingChoicesSchema.parse({ choices: [{ external_id: 9, picture_url: "p" }] })[0]).toEqual({ external_id: "9", name: "9", picture: "p" });
  });
});

describe("an older API", () => {
  it("is a bare 404, a 405, or a code-less 422 from a /clubs/{id} route", () => {
    expect(isSocialMissing(new ApiError({ status: 404, message: "Not Found", routeMissing: true }))).toBe(true);
    expect(isSocialMissing(new ApiError({ status: 405, message: "Method Not Allowed" }))).toBe(true);
    expect(isSocialMissing(new ApiError({ status: 422, message: "x", fieldErrors: { "path.club_id": ["int"] } }))).toBe(true);
    // The backend's own answers are not "missing".
    expect(isSocialMissing(new ApiError({ status: 404, message: "No such account", errorCode: "NOT_FOUND" }))).toBe(false);
    expect(isSocialMissing(new ApiError({ status: 403, message: "No" }))).toBe(false);
    expect(isSocialMissing(new ApiError({ status: 500, message: "Boom" }))).toBe(false);
  });
});

describe("a platform's card", () => {
  const row = (p: string) => platforms.find((r) => r.platform === p)!;
  it("connected, connect, coming soon, not on the plan, not available yet", () => {
    expect(cardState(row("instagram"), accounts)).toMatchObject({ kind: "connected" });
    expect(cardState(row("facebook"), accounts)).toMatchObject({ kind: "connected" });
    expect(cardState(row("linkedin"), [])).toEqual({ kind: "connect" });
    expect(cardState(row("linkedin_page"), accounts)).toEqual({ kind: "review_pending" });
    expect(cardState(row("x"), accounts)).toEqual({ kind: "plan", feature: "social_x" });
    expect(cardState({ platform: "x", available: false, reason: "not_configured", plan_feature: null }, [])).toEqual({ kind: "not_configured" });
  });
  it("keeps an account already connected in sight after the plan changed, and drops a disconnected one", () => {
    const x = accountsSchema.parse([{ ...fixture.accounts[0], id: 20, platform: "x" }]);
    expect(cardState(row("x"), x)).toMatchObject({ kind: "connected" });
    expect(cardState(row("linkedin"), accountsSchema.parse([{ ...fixture.accounts[2], status: "disconnected" }]))).toEqual({ kind: "connect" });
  });
});

describe("coming back from a platform", () => {
  const read = (q: string) => readConnectReturn(new URLSearchParams(q));
  it("connected, refused with a reason, or a Page to pick", () => {
    expect(read("social=connected&platform=instagram")).toEqual({ kind: "connected", platform: "instagram" });
    expect(read("social=error&reason=not_admin&platform=linkedin_page")).toEqual({ kind: "error", reason: "not_admin", platform: "linkedin_page" });
    expect(read("social=pick&pending=st_1&platform=facebook")).toEqual({ kind: "pick", stateId: "st_1", platform: "facebook" });
    // The contract doesn't name the parameter: the likely spellings, and `connected` carrying one.
    expect(read("social=connected&state_id=st_2")).toMatchObject({ kind: "pick", stateId: "st_2" });
    expect(read("tab=1")).toBeNull();
    expect(read("social=weird")).toBeNull();
  });
  it("says each refusal in words", () => {
    expect(connectErrorText("not_admin", "linkedin_page")).toBe("Only a Page admin can post as the Page. Ask the Page's admin to connect it.");
    expect(connectErrorText("access_denied", "instagram")).toContain("You didn't allow MyOtherApp on Instagram");
    expect(connectErrorText("personal_account", "instagram")).toContain("Business or Creator");
    expect(connectErrorText("something_new", "x")).toBe("X didn't connect: something new.");
    expect(connectErrorText(null, null)).toBe("The account didn't connect. Try again.");
  });
});

describe("counters and warnings", () => {
  it("X counts a link as 23 characters, whatever its length", () => {
    const link = `https://myotherapp.in/events/${"a".repeat(80)}`;
    expect(countChars("x", `Hi ${link}`)).toBe(3 + 23);
    expect(countChars("linkedin", `Hi ${link}`)).toBe(3 + link.length);
    expect(countChars("instagram", "🎉 ok")).toBe(4);
  });

  it("X over 280, Instagram over 30 hashtags, and a link in an Instagram caption", () => {
    expect(localWarnings("x", "a".repeat(281), "a".repeat(281)).map((w) => w.code)).toEqual(["x_over_280"]);
    expect(localWarnings("x", "a".repeat(281), "a".repeat(281))[0]!.message).toMatch(/^1 over X's 280/);
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(textStats("instagram", tags).hashtags).toBe(31);
    expect(localWarnings("instagram", tags, tags).map((w) => w.code)).toEqual(["ig_hashtags_over_30"]);
    const ig = localWarnings("instagram", "Register at {link}", "Register at https://myotherapp.in/l/1");
    expect(ig.map((w) => w.code)).toEqual(["ig_link_not_clickable"]);
    expect(ig[0]!.fix!.apply("Register at {link} or https://a.b/c")).toBe("Register at link in bio or link in bio");
    expect(localWarnings("instagram", " ", " ").map((w) => w.code)).toEqual(["empty_text"]);
    // A link is fine anywhere else.
    expect(localWarnings("facebook", "Register at {link}", "Register at https://a.b")).toEqual([]);
  });

  it("adds the server's warnings it doesn't already show, in words", () => {
    const merged = mergeWarnings(localWarnings("x", "a".repeat(300), "a".repeat(300)), [{ code: "x_over_280", message: null }, { code: "image_shape", message: null }, { code: "new_one", message: "Something new" }]);
    expect(merged.map((w) => w.code)).toEqual(["x_over_280", "image_shape", "new_one"]);
    expect(merged[2]!.message).toBe("Something new");
  });

  it("fills the words the dashboard knows and leaves the rest for the server", () => {
    expect(fillIn("{event_name} · {seats_left} left · {nope}", { event_name: "DevFest" })).toBe("DevFest · {seats_left} left · {nope}");
  });

  it("cuts where the app cuts, on a space", () => {
    const text = `${"word ".repeat(40)}end`;
    const ig = truncateFor("instagram", text);
    expect(ig.cut).toBe(true);
    expect(ig.shown.length).toBeLessThanOrEqual(125);
    expect(ig.shown.endsWith("word")).toBe(true);
    expect(truncateFor("x", "short")).toEqual({ shown: "short", cut: false });
  });
});

describe("when a post goes out", () => {
  const clock = { start: "2026-11-22T10:00:00+05:30", duration: 480, regClose: "2026-11-21T23:59:00+05:30", status: "published" };
  const ist = (d: Date | null) => (d ? new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16) : null);

  it("relative to the start, to registrations closing, and to the end", () => {
    expect(ist(triggerTime({ mode: "before_start", minutes: 2880 }, clock).at)).toBe("2026-11-20T10:00");
    expect(ist(triggerTime({ mode: "after_end", minutes: 1440 }, clock).at)).toBe("2026-11-23T18:00");
    // 24 hours before 23:59 lands at 23:59: quiet hours move it to 07:00 the next morning.
    const close = triggerTime({ mode: "before_reg_close", minutes: 1440 }, clock);
    expect(ist(close.at)).toBe("2026-11-21T07:00");
    expect(close.moved).toBe(true);
  });

  it("quiet hours: 23:00–07:00 IST moves to 07:00; a set time is never moved", () => {
    expect(ist(outOfQuietHours(new Date("2026-11-20T02:30:00+05:30")))).toBe("2026-11-20T07:00");
    expect(ist(outOfQuietHours(new Date("2026-11-20T23:15:00+05:30")))).toBe("2026-11-21T07:00");
    expect(ist(outOfQuietHours(new Date("2026-11-20T07:00:00+05:30")))).toBe("2026-11-20T07:00");
    expect(triggerTime({ mode: "at", at: "2026-11-20T02:30:00+05:30" }, clock).moved).toBe(false);
  });

  it("on publish is now on a live event, and waits on a draft; nothing to count from is unknown", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    expect(triggerTime({ mode: "on_publish" }, clock, now).at).toEqual(now);
    expect(triggerTime({ mode: "on_publish" }, { ...clock, status: "draft" }, now).at).toBeNull();
    expect(triggerTime({ mode: "before_reg_close", minutes: 60 }, { ...clock, regClose: null }).at).toBeNull();
  });

  it("says each trigger in a few words", () => {
    expect(triggerLabel({ mode: "on_publish" })).toBe("On publish");
    expect(triggerLabel({ mode: "before_start", minutes: 2880 })).toBe("2 days before");
    expect(triggerLabel({ mode: "before_reg_close", minutes: 1440 })).toBe("1 day before registrations close");
    expect(triggerLabel({ mode: "after_end", minutes: 120 })).toBe("2 hours after the event");
    expect(triggerLabel({ mode: "at", at: "2026-11-15T10:00:00+05:30" })).toMatch(/^Sun, 15 Nov · 10:00/);
  });
});

describe("each platform's status on a post", () => {
  const t = (over: Partial<PostTarget>): PostTarget => ({ ...posts.posts[1]!.targets[0]!, ...over });
  it("a post not sending yet speaks for its platforms", () => {
    expect(targetChip({ status: "draft" }, t({ status: "scheduled" })).label).toBe("Draft");
    expect(targetChip({ status: "needs_approval" }, t({ status: "scheduled" })).label).toBe("Needs approval");
    expect(targetChip({ status: "paused" }, t({ status: "scheduled" }))).toMatchObject({ label: "Paused", actions: ["share_manually"] });
    expect(targetChip({ status: "cancelled" }, t({ status: "scheduled" })).label).toBe("Cancelled");
    // What already went out stays posted.
    expect(targetChip({ status: "cancelled" }, t({ status: "posted" })).label).toBe("Posted");
  });
  it("posted, held, waiting, failed with the reason and what to do", () => {
    expect(targetChip({ status: "done" }, t({ status: "posted" })).tone).toBe("success");
    expect(targetChip({ status: "scheduled" }, t({ status: "held", platform: "facebook" }))).toMatchObject({ label: "Held", detail: "Reconnect Facebook to send", actions: ["reconnect", "share_manually"] });
    expect(targetChip({ status: "scheduled" }, t({ status: "waiting_limit" })).detail).toMatch(/Instagram's daily limit/);
    const failed = targetChip({ status: "done" }, posts.posts[1]!.targets[2]!);
    expect(failed).toMatchObject({ label: "Failed", tone: "destructive", detail: "LinkedIn didn't answer (after 6 tries)", actions: ["retry", "share_manually"] });
    expect(targetChip({ status: "done" }, t({ status: "failed", error: { code: "bad_image", message: "Instagram needs a 4:5 or square image", action: "fix_image" } })).actions).toEqual(["fix_image", "share_manually"]);
    expect(targetChip({ status: "done" }, t({ status: "failed", error: { code: "x", message: null, action: "share_manually" } })).actions).toEqual(["share_manually"]);
  });
});

describe("posters", () => {
  it("a crop keeps the part around the focus point, inside the poster", () => {
    // A 4:5 poster to 16:9: the full width, a band of the height.
    const w = cropWindow(0.8, 16 / 9, { x: 0.5, y: 0.1 });
    expect(w.width).toBe(1);
    expect(w.height).toBeCloseTo(0.45, 2);
    expect(w.top).toBe(0);
    expect(w.position.y).toBe(0);
    const low = cropWindow(0.8, 16 / 9, { x: 0.5, y: 1 });
    expect(low.top + low.height).toBeCloseTo(1, 5);
    expect(low.position.y).toBeCloseTo(1, 5);
    // A landscape poster to 4:5: the full height, part of the width.
    const side = cropWindow(16 / 9, 0.8, { x: 0.75, y: 0.5 });
    expect(side.height).toBe(1);
    expect(side.left + side.width / 2).toBeCloseTo(0.75, 5);
  });
  it("an own image is checked against the platform's rules first", () => {
    expect(imageProblem("instagram", { type: "image/jpeg", width: 1080, height: 1920 })).toMatch(/Instagram needs a 4:5/);
    expect(imageProblem("instagram", { type: "image/jpeg", width: 1080, height: 1350 })).toBeNull();
    expect(imageProblem("facebook", { type: "image/gif", width: 1200, height: 630 })).toBe("Use a JPG, PNG or WebP image.");
    expect(imageProblem("x", { type: "image/png", width: 320, height: 200 })).toMatch(/too small/);
  });
});

describe("the overview's attention items", () => {
  const now = new Date("2027-01-03T12:00:00+05:30");
  const alerts = [
    { id: 1, kind: "social_failed", title: "Instagram post failed", body: "Share it manually", link: "/events/42/promote", data: { event_id: 42 }, created_at: "2027-01-03T10:00:00Z", read: false },
    { id: 2, kind: "social_failed", title: "Old", body: "", link: null, data: {}, created_at: "2027-01-01T10:00:00Z", read: true },
    { id: 3, kind: "message_quota_80", title: "80%", body: "", link: null, data: {}, created_at: "2027-01-01T10:00:00Z", read: false },
  ];
  it("disconnected with posts waiting, access ending within a week, and an unread failed post", () => {
    const items = socialAttention(accounts, alerts, true, now);
    expect(items.map((i) => [i.kind, i.tone, i.title])).toEqual([
      ["SOCIAL_DISCONNECTED", "red", "Facebook disconnected — 2 posts waiting"],
      ["SOCIAL_EXPIRING", "amber", "LinkedIn access ends in 5 days"],
      ["SOCIAL_FAILED", "red", "Instagram post failed"],
    ]);
    expect(items[2]!.event_id).toBe(42);
    expect(socialAttention(accounts, [], false, now)[0]!.body).toMatch(/Ask the club's owner or an admin/);
  });
  it("leads to Social accounts, or to the event's Promote tab", () => {
    expect(socialAttentionHref({ kind: "SOCIAL_DISCONNECTED", event_id: null })).toBe("/social");
    expect(socialAttentionHref({ kind: "SOCIAL_FAILED", event_id: 42 })).toBe("/events/42/promote");
    expect(socialAttentionHref({ kind: "TICKETS_MISSING", event_id: 42 })).toBeNull();
  });
});
