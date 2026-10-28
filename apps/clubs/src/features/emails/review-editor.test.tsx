import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

/**
 * A registration review email in the editor (review-wording-contract.md,
 * sections 2 and 5): its words, theme and subject, but no Sending tab
 * (trigger, audience, switch), no attachments, no Duplicate and no "club's
 * default"; "Reset to default…" asks first and calls the library's reset,
 * and an older backend's bare 404 is said as "not available yet". The token
 * menu offers the "Registration review" tokens of its own stage.
 */

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
/** How the reset route answers: the template back, or an older backend's bare 404. */
let resetRoute: "ok" | "missing" = "ok";

const received = {
  id: "rv1", clubId: 5, eventId: null, stage: "REQUEST_RECEIVED", name: "Thanks for registering", subject: "Thanks for registering for {{event_name}}",
  design: {
    theme: {},
    blocks: [
      { id: "he-1", kind: "heading", text: "Thanks for registering, {{first_name}}." },
      { id: "pa-1", kind: "paragraph", text: "{{org_name}} reviews every registration and will get back to you soon." },
      { id: "bu-1", kind: "button", label: "See your registration", href: "{{status_url}}" },
    ],
  },
  attachments: {}, audience: { who: "ALL", roles: [] }, trigger: { mode: "MANUAL" }, channels: ["email"], enabled: true,
  version: 1, sourceId: null, createdAt: "2026-10-28T00:00:00+00:00", updatedAt: "2026-10-28T00:00:00+00:00",
};
const reminder = { ...received, id: "lib-3", stage: "REMINDER", name: "Reminder · doors open", subject: "Doors are open at {{event_name}}" };

const REVIEW_STAGES = ["REQUEST_RECEIVED", "REQUEST_APPROVED_PAY", "REQUEST_DECLINED", "REQUEST_LAPSED", "REQUEST_UNANSWERED"];
const context = {
  tokens: [
    { key: "first_name", group: "Guest", label: "First name", sample: "Asha" },
    { key: "event_name", group: "Event", label: "Event name", sample: "Hack Night" },
    { key: "status_url", group: "Registration review", label: "Link to their registration", sample: "https://myotherapp.in/requests/abc", stages: REVIEW_STAGES },
    { key: "cancel_url", group: "Registration review", label: "Link to cancel their registration", sample: "https://myotherapp.in/requests/abc?withdraw=1", stages: ["REQUEST_RECEIVED", "REQUEST_APPROVED_PAY"] },
    { key: "pay_url", group: "Registration review", label: "Link to pay", sample: "https://myotherapp.in/claim/xyz", stages: ["REQUEST_APPROVED_PAY"] },
    { key: "decline_note", group: "Registration review", label: "Your note", sample: "We had many more registrations than seats this time.", stages: ["REQUEST_DECLINED"] },
    { key: "event_url", group: "Registration review", label: "Event page link", sample: "https://myotherapp.in/events/hack-night", stages: REVIEW_STAGES },
  ],
  sampleValues: { first_name: "Asha", event_name: "Hack Night", status_url: "https://myotherapp.in/requests/abc" },
  brandPrimary: "#0f8a73",
};

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, usePathname: () => "/emails/rv1", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/me/emails/rv1") return received;
        if (path === "/api/v1/clubs/me/emails/lib-3") return reminder;
        if (path === "/api/v1/clubs/me/emails/context") return context;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/emails/preview")) return { subject: `Rendered: ${(body as { subject: string }).subject}`, html: "<p>Thanks</p>", text: "Thanks", problems: [] };
        if (path === "/api/v1/clubs/me/emails/rv1/reset") {
          if (resetRoute === "missing") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
          return { ...received, subject: "Thanks for registering for {{event_name}}", version: 2 };
        }
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return { ...received, ...(body as object), version: 2 };
      }),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EmailEditor } = await import("./components/email-editor");

const openMore = async () => {
  fireEvent.keyDown(screen.getByRole("button", { name: "More for this email" }), { key: "Enter" });
  return screen.findByRole("menu");
};

beforeEach(() => {
  calls.length = 0;
  resetRoute = "ok";
});

describe("a registration review email in the editor", () => {
  it("edits its words, theme and subject, with no Sending, attachments, Duplicate or club's default", async () => {
    render(<EmailEditor scope={{ kind: "library" }} templateId="rv1" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Thanks for registering" })).toBeInTheDocument();
    expect(screen.getByText(/Goes out as soon as someone registers for an event that reviews registrations\. Always on\./)).toBeInTheDocument();
    expect(await screen.findByText("Rendered: Thanks for registering for {{event_name}}")).toBeInTheDocument();
    expect(screen.getByTitle("Email preview")).toHaveAttribute("srcdoc", "<p>Thanks</p>");

    // Block, Theme and Subject: no Sending.
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Block", "Theme", "Subject"]);
    expect(screen.queryByRole("tab", { name: "Sending" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Subject" }));
    expect(screen.getByLabelText("Name (only you see it)")).toHaveValue("Thanks for registering");
    const subject = screen.getByLabelText("Subject");
    expect(subject).toHaveValue("Thanks for registering for {{event_name}}");
    expect(screen.getByText("Sent by itself")).toBeInTheDocument();
    // No audience, timer, attachments or switch.
    expect(screen.queryByRole("radiogroup", { name: "Who gets it" })).toBeNull();
    expect(screen.queryByLabelText("The guest's ticket PDF")).toBeNull();
    expect(screen.queryByLabelText("The guest's certificate PDF")).toBeNull();
    expect(screen.queryByLabelText("Switched on")).toBeNull();
    expect(screen.queryByText("Timing")).toBeNull();

    // The subject is saved as any email is.
    fireEvent.change(subject, { target: { value: "You're registered for {{event_name}}" } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/v1/clubs/me/emails/rv1")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({ subject: "You're registered for {{event_name}}", enabled: true });

    // The menu has Reset only: no Duplicate, no club's default, no Delete.
    const menu = await openMore();
    expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Reset to default…Back to MyOtherApp's words for this email."]);
    expect(within(menu).queryByRole("menuitem", { name: /Duplicate/ })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: /club's default/ })).toBeNull();
  });

  it("offers the Registration review tokens of its own stage, and the check takes them", async () => {
    render(<EmailEditor scope={{ kind: "library" }} templateId="rv1" />);
    await screen.findByRole("heading", { level: 1, name: "Thanks for registering" });
    // The first block (the heading) is open in the inspector.
    fireEvent.keyDown(screen.getByRole("button", { name: /Insert token/ }), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Registration review")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Link to their registration/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Link to cancel their registration/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Event page link/ })).toBeInTheDocument();
    // Another stage's tokens stay out.
    expect(within(menu).queryByRole("menuitem", { name: /Link to pay/ })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: /^Your note/ })).toBeNull();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Link to their registration/ }));
    const text = screen.getByLabelText("Text") as HTMLTextAreaElement;
    await waitFor(() => expect(text.value).toContain("{{status_url}}"));
    // No "unknown token" under the field.
    expect(screen.queryByText(/status_url/, { selector: "p.text-refuse" })).toBeNull();
    expect(document.querySelector("p.text-refuse")).toBeNull();
  });

  it("resets to MyOtherApp's default words after asking", async () => {
    const success = vi.spyOn(toast, "success");
    render(<EmailEditor scope={{ kind: "library" }} templateId="rv1" />);
    await screen.findByRole("heading", { level: 1, name: "Thanks for registering" });
    fireEvent.click(within(await openMore()).getByRole("menuitem", { name: /Reset to default…/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Reset to the default words?")).toBeInTheDocument();
    expect(within(dialog).getByText("Your changes to this email are replaced by MyOtherApp's default.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/clubs/me/emails/rv1/reset")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(success).toHaveBeenCalledWith("Back to the default words", { description: "Version 2." });
    // The editor starts again from the version the server answered.
    expect(await screen.findByText(/· v2$/)).toBeInTheDocument();
    success.mockRestore();
  });

  it("says reset isn't available yet on a backend without it", async () => {
    resetRoute = "missing";
    const warn = vi.spyOn(toast, "warning");
    const error = vi.spyOn(toast, "error");
    render(<EmailEditor scope={{ kind: "library" }} templateId="rv1" />);
    await screen.findByRole("heading", { level: 1, name: "Thanks for registering" });
    fireEvent.click(within(await openMore()).getByRole("menuitem", { name: /Reset to default…/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(warn).toHaveBeenCalledWith("Reset isn't available yet."));
    expect(error).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    warn.mockRestore();
    error.mockRestore();
  });

  it("leaves a journey email in the library as it was: Sending, Duplicate, no Reset, no review tokens", async () => {
    render(<EmailEditor scope={{ kind: "library" }} templateId="lib-3" />);
    await screen.findByRole("heading", { level: 1, name: "Reminder · doors open" });
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Block", "Theme", "Sending"]);
    const menu = await openMore();
    expect(within(menu).getByRole("menuitem", { name: /Duplicate/ })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /Reset to default/ })).toBeNull();
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    fireEvent.keyDown(screen.getByRole("button", { name: /Insert token/ }), { key: "Enter" });
    const tokens = await screen.findByRole("menu");
    expect(within(tokens).queryByText("Registration review")).toBeNull();
    expect(within(tokens).queryByRole("menuitem", { name: /Link to their registration/ })).toBeNull();
    expect(within(tokens).getByRole("menuitem", { name: /First name/ })).toBeInTheDocument();
  });
});
