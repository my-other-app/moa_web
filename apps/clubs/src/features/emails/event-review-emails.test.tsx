import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import eventFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/registrations.json";

/**
 * An event's own registration review emails (event-review-emails-contract.md,
 * section 4): the Emails page lists the six with whose words each sends, a
 * reset to the club's after asking, a send-again after asking with one key
 * per press (kept on a retry), refusals in plain words, and nothing at all on
 * an API without them. The editor saves the event's own copy and then offers
 * to send the new version to the people who got the old one.
 */

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
/** How GET /review answers: the list, or an older API (its 422 for "review" read as an id, or a bare 404). */
let reviewRoute: "ok" | "old422" | "old404" = "ok";
let requiresApproval = true;
/** What the next send-again presses meet, in order: an error, or the answer. */
let resendAnswers: Array<Error | "ok"> = [];

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const tpl = (id: string, stage: string, name: string, eventId: number | null, over: Record<string, unknown> = {}) => ({
  id, clubId: 5, eventId, stage, name, subject: `${name} · {{event_name}}`,
  design: { theme: {}, blocks: [{ id: "he-1", kind: "heading", text: `${name}, {{first_name}}` }] },
  attachments: {}, audience: { who: "ALL", roles: [] }, trigger: { mode: "MANUAL" }, channels: ["email"], enabled: true,
  version: 1, sourceId: null, createdAt: "2026-10-01T00:00:00+00:00", updatedAt: "2026-10-01T00:00:00+00:00", ...over,
});
const item = (stage: string, name: string, over: Record<string, unknown> = {}) => ({
  stage, label: name, source: "club", template: tpl(`lib-${stage}`, stage, name, null), clubTemplateId: `lib-${stage}`,
  resendable: true, eligible: 0, lastResend: null, ...over,
});

let REVIEW: ReturnType<typeof item>[] = [];
const freshReview = () => [
  item("REQUEST_RECEIVED", "Thanks for registering", {
    source: "event",
    template: tpl("ev-rcv", "REQUEST_RECEIVED", "Thanks for registering", 42, { version: 3 }),
    eligible: 12,
    lastResend: { id: "rs1", stage: "REQUEST_RECEIVED", createdAt: ago(2 * HOUR), createdBy: { id: 1, name: "Ananya" }, recipients: 437, sent: 431, failed: 3, skipped: 3, status: "done" },
  }),
  item("REQUEST_APPROVED", "Confirmed · ticket"),
  item("REQUEST_APPROVED_PAY", "Confirmed · pay for the ticket", { eligible: 3 }),
  item("REQUEST_DECLINED", "Not confirmed", { source: "default" }),
  item("REQUEST_LAPSED", "Expired · not paid in time"),
  item("REQUEST_UNANSWERED", "Closed before review", { resendable: false, eligible: 5 }),
];

const resent = (stage: string, recipients: number) => ({
  id: "rs9", stage, createdAt: new Date().toISOString(), createdBy: { id: 1, name: "Ananya" }, recipients, sent: 0, failed: 0, skipped: 0, status: "sending",
});

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, usePathname: () => "/events/42/emails", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/events/42/emails/review") {
          if (reviewRoute === "old422")
            throw new ApiError({ status: 422, message: "Some of the submitted values were not valid.", fieldErrors: { "path.template_id": ["Input should be a valid UUID"] } });
          if (reviewRoute === "old404") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
          return REVIEW;
        }
        if (path === "/api/v1/events/info/42") return { ...eventFixture, id: 42, requires_approval: requiresApproval };
        if (path === "/api/v1/events/42/emails/context") return { tokens: [], sampleValues: {}, brandPrimary: "#0f8a73" };
        if (path.includes("/registration/") && path.includes("/list")) return registrationsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/emails/preview")) return { subject: `Rendered: ${(body as { subject: string }).subject}`, html: "<p>Hi</p>", text: "Hi", problems: [] };
        const count = /\/review\/([A-Z_]+)\/resend\/count$/.exec(path);
        if (count) return { eligible: count[1] === "REQUEST_RECEIVED" ? 11 : 3, withoutEmail: count[1] === "REQUEST_RECEIVED" ? 1 : 0 };
        const send = /\/review\/([A-Z_]+)\/resend$/.exec(path);
        if (send) {
          const next = resendAnswers.shift() ?? "ok";
          if (next !== "ok") throw next;
          return resent(send[1]!, 11);
        }
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        const stage = path.split("/").pop()!;
        const at = REVIEW.findIndex((r) => r.stage === stage);
        const saved = tpl(`ev-${stage}`, stage, (body as { name: string }).name, 42, { ...(body as object), version: 2, updatedAt: new Date().toISOString() });
        REVIEW[at] = { ...REVIEW[at]!, source: "event", template: saved };
        return saved;
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        const stage = path.split("/").pop()!;
        const at = REVIEW.findIndex((r) => r.stage === stage);
        const club = tpl(`lib-${stage}`, stage, REVIEW[at]!.label, null);
        REVIEW[at] = { ...REVIEW[at]!, source: "club", template: club };
        return club;
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { ReviewSection } = await import("./components/review-section");
const { EventReviewEditor } = await import("./components/email-editor");
const { resendErrorText } = await import("./components/resend-dialog");

beforeEach(() => {
  calls.length = 0;
  reviewRoute = "ok";
  requiresApproval = true;
  resendAnswers = [];
  REVIEW = freshReview();
});

const card = (label: string) => screen.getByText(label, { selector: "p" }).closest("[data-slot=figure-panel]") as HTMLElement;
const resends = () => calls.filter((c) => c.method === "POST" && /\/review\/[A-Z_]+\/resend$/.test(c.path));
const refOf = (i: number) => (resends()[i]?.body as { clientRef?: string } | undefined)?.clientRef;

describe("an event's registration review emails", () => {
  it("lists the six with whose words each sends, the last send-again, and what can be done", async () => {
    render(<ReviewSection eventId={42} />);
    expect(await screen.findByText("Thanks for registering", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registration review" })).toBeInTheDocument();

    expect(screen.getAllByText("This event's own")).toHaveLength(1);
    expect(screen.getAllByText("Club's default")).toHaveLength(5);

    const received = card("Thanks for registering");
    expect(within(received).getByText("This event's own")).toBeInTheDocument();
    expect(within(received).getByText("Sent again: Sent to 431 of 437 · 2 h ago · 3 failed")).toBeInTheDocument();
    expect(within(received).getByRole("link", { name: /Edit/ })).toHaveAttribute("href", "/events/42/emails/review/request_received");
    expect(within(received).getByRole("button", { name: "Use club's default" })).toBeInTheDocument();
    expect(within(received).getByRole("button", { name: /Send to 12 people…/ })).toBeInTheDocument();

    // The club's words: no reset. Nobody to reach: no send-again.
    const approved = card("Confirmed · ticket");
    expect(within(approved).getByText("Club's default")).toBeInTheDocument();
    expect(within(approved).queryByRole("button", { name: "Use club's default" })).toBeNull();
    expect(within(approved).queryByRole("button", { name: /Send to/ })).toBeNull();
    // A timed nudge is never sent again, whoever it reached.
    expect(within(card("Closed before review")).queryByRole("button", { name: /Send to/ })).toBeNull();
    expect(within(card("Confirmed · pay for the ticket")).getByRole("button", { name: /Send to 3 people…/ })).toBeInTheDocument();

    // Previewed in place, as a guest would see it.
    fireEvent.click(within(approved).getByRole("button", { name: "Preview Confirmed · ticket" }));
    expect(await screen.findByTitle("Preview of Confirmed · ticket")).toHaveAttribute("srcdoc", "<p>Hi</p>");
  });

  it("goes back to the club's words only after asking", async () => {
    render(<ReviewSection eventId={42} />);
    fireEvent.click(within(await waitFor(() => card("Thanks for registering"))).getByRole("button", { name: "Use club's default" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Use the club's default?")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Use the club's" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/v1/events/42/emails/review/REQUEST_RECEIVED")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(screen.getAllByText("Club's default")).toHaveLength(6));
  });

  it("sends again only after asking, with one key per press kept on a retry", async () => {
    resendAnswers = [new TypeError("Failed to fetch"), "ok"];
    render(<ReviewSection eventId={42} />);
    fireEvent.click(within(await waitFor(() => card("Thanks for registering"))).getByRole("button", { name: /Send to 12 people…/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Send “Thanks for registering” again?")).toBeInTheDocument();
    // Counted again as it opens: 11 now, one of them without an address.
    expect(await within(dialog).findByText(/It goes to 11 people: everyone still waiting for review\. 1 person without an email address is skipped\./)).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/api/v1/events/42/emails/review/REQUEST_RECEIVED/resend/count")).toBe(true);
    expect(resends()).toHaveLength(0);

    const send = within(dialog).getByRole("button", { name: "Send to 11" });
    fireEvent.click(send);
    await waitFor(() => expect(resends()).toHaveLength(1));
    expect(await within(dialog).findByText("Failed to fetch")).toBeInTheDocument();
    await waitFor(() => expect(send).not.toBeDisabled());
    // The retry of that press is the same send.
    fireEvent.click(send);
    await waitFor(() => expect(resends()).toHaveLength(2));
    expect(refOf(0)).toMatch(/^[0-9a-f-]{36}$/);
    expect(refOf(1)).toBe(refOf(0));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    // A later send is a new one.
    fireEvent.click(within(card("Thanks for registering")).getByRole("button", { name: /Send to/ }));
    fireEvent.click(await within(await screen.findByRole("alertdialog")).findByRole("button", { name: "Send to 11" }));
    await waitFor(() => expect(resends()).toHaveLength(3));
    expect(refOf(2)).not.toBe(refOf(0));
  });

  it("says a refused send-again in plain words", async () => {
    resendAnswers = [new ApiError({ status: 422, message: "nobody_eligible", errorCode: "NOBODY" })];
    render(<ReviewSection eventId={42} />);
    fireEvent.click(within(await waitFor(() => card("Confirmed · pay for the ticket"))).getByRole("button", { name: /Send to 3 people…/ }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: "Send to 3" }));
    expect(await within(dialog).findByText("Nobody would get it right now: no one is at this step any more.")).toBeInTheDocument();

    const words = (errorCode: string, status = 422) => resendErrorText(new ApiError({ status, message: "x", errorCode }));
    expect(words("NOT_RESENDABLE")).toBe("This email can't be sent again. It goes out once, by itself, at its moment.");
    expect(words("NOT_REVIEWED")).toBe("This event doesn't review registrations, so its review emails don't go out.");
    expect(words("MESSAGE_QUOTA_REACHED", 429)).toMatch(/emails for this month are used up/);
    // A plan refusal opens the upgrade dialog instead of a sentence here.
    expect(words("PLAN_LIMIT_REACHED", 403)).toBeNull();
  });

  it("folds away with one line on an event that doesn't review registrations", async () => {
    requiresApproval = false;
    render(<ReviewSection eventId={42} />);
    expect(await screen.findByText("These only go out for events that review registrations. This event doesn't.")).toBeInTheDocument();
    expect(screen.queryByText("Thanks for registering", { selector: "p" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show them/ }));
    expect(await screen.findByText("Thanks for registering", { selector: "p" })).toBeInTheDocument();
  });

  it.each(["old422", "old404"] as const)("hides on an API without them per event (%s)", async (route) => {
    reviewRoute = route;
    const { container } = render(<ReviewSection eventId={42} />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/42/emails/review")).toBe(true));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText("Registration review")).toBeNull();
  });
});

describe("an event's own words for a review email, in the editor", () => {
  it("saves the event's copy, then offers to send the new version to who got the old one", async () => {
    render(<EventReviewEditor eventId={42} stage="request_approved_pay" />);
    expect(await screen.findByRole("heading", { level: 2, name: "Confirmed · pay for the ticket" })).toBeInTheDocument();
    expect(screen.getByText(/This event's own words — other events keep the club's\. Until you save, this event sends the club's\./)).toBeInTheDocument();
    // Review mode: Block, Theme, Subject.
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Block", "Theme", "Subject"]);

    fireEvent.click(screen.getByRole("tab", { name: "Subject" }));
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Your seat at {{event_name}} is held" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/v1/events/42/emails/review/REQUEST_APPROVED_PAY")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({ subject: "Your seat at {{event_name}} is held" });

    const offer = await screen.findByText("Send this new version to the 3 people who already got the old one?");
    // Now the event's own: its menu offers the club's default back.
    expect(await screen.findByRole("button", { name: "More for this email" })).toBeInTheDocument();

    fireEvent.click(within(offer.closest("[role=note]") as HTMLElement).getByRole("button", { name: /Send it…/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(await within(dialog).findByText(/It goes to 3 people: everyone confirmed who hasn't paid yet\./)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send to 3" }));
    await waitFor(() => expect(resends().map((c) => c.path)).toEqual(["/api/v1/events/42/emails/review/REQUEST_APPROVED_PAY/resend"]));
    await waitFor(() => expect(screen.queryByText("Send this new version to the 3 people who already got the old one?")).toBeNull());
  });

  it("offers no send-again for a stage that can't be sent again", async () => {
    render(<EventReviewEditor eventId={42} stage="REQUEST_UNANSWERED" />);
    await screen.findByRole("heading", { level: 2, name: "Closed before review" });
    fireEvent.click(screen.getByRole("tab", { name: "Subject" }));
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Closed" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/v1/events/42/emails/review/REQUEST_UNANSWERED")).toBe(true));
    // Now the event's own copy.
    await waitFor(() => expect(screen.queryByText(/Until you save/)).toBeNull());
    expect(screen.queryByText(/Send this new version/)).toBeNull();
  });
});
