import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];

const template = {
  id: "t3", clubId: 5, eventId: 42, stage: "REMINDER", name: "Reminder · doors open", subject: "Doors are open at {{event_name}}",
  design: {
    theme: {},
    blocks: [
      { id: "he-1", kind: "heading", text: "Hello {{first_name}}" },
      { id: "pa-1", kind: "paragraph", text: "The doors are open." },
    ],
  },
  attachments: {}, audience: { who: "NOT_CHECKED_IN", roles: [] }, trigger: { mode: "MANUAL" }, channels: ["email"], enabled: true,
  version: 2, sourceId: null, createdAt: "2026-10-01T00:00:00+00:00", updatedAt: "2026-10-01T00:00:00+00:00",
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: options?.query });
        if (path === "/api/v1/events/42/emails/t3" || path === "/api/v1/clubs/me/emails/t3") return template;
        if (path.endsWith("/emails/context")) return { tokens: [{ key: "first_name", group: "Guest", label: "First name", sample: "Asha" }], sampleValues: { first_name: "Asha" }, brandPrimary: "#0f8a73" };
        if (path === "/api/v1/events/registration/42/list")
          return { items: [{ id: "r1", full_name: "Meera Nair", email: "meera@example.com", ticket_id: "MOA-1" }], total: 1, offset: 0, limit: 8 };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/emails/preview")) return { subject: `Rendered: ${(body as { subject: string }).subject}`, html: "<p>Hello</p>", text: "Hello", problems: [] };
        if (path.endsWith("/emails/audience")) return { recipients: 40, withoutEmail: 0 };
        if (path.endsWith("/emails/test")) return { sent: true, to: (body as { to: string }).to, subject: "Doors" };
        if (path.endsWith("/save-to-library")) return { ...template, id: "lib-3", eventId: null };
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return { ...template, ...(body as object), version: 3 };
      }),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EmailEditor } = await import("./components/email-editor");

beforeEach(() => {
  calls.length = 0;
});

describe("the email editor", () => {
  it("edits a block, says it is unsaved, previews it and saves it", async () => {
    render(<EmailEditor scope={{ kind: "event", eventId: 42 }} templateId="t3" />);
    expect(await screen.findByRole("heading", { name: "Reminder · doors open" })).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(await screen.findByText("Rendered: Doors are open at {{event_name}}")).toBeInTheDocument();
    expect(screen.getByTitle("Email preview")).toHaveAttribute("srcdoc", "<p>Hello</p>");

    // The first block is open in the inspector; changing it marks the email unsaved.
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Doors are open, {{first_name}}" } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByText(/A send to the audience and the club's default use the last saved/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/v1/events/42/emails/t3")).toBe(true));
    const saved = calls.find((c) => c.method === "PUT")!.body as { design: { blocks: { text?: string }[] } };
    expect(saved.design.blocks[0]!.text).toBe("Doors are open, {{first_name}}");
  });

  it("moves blocks, switches the inspector between block, theme and sending, and counts the audience", async () => {
    render(<EmailEditor scope={{ kind: "event", eventId: 42 }} templateId="t3" />);
    await screen.findByRole("heading", { name: "Reminder · doors open" });

    fireEvent.click(screen.getByRole("button", { name: "Move paragraph up" }));
    expect(within(screen.getAllByRole("listitem")[0]!).getByText("The doors are open.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Theme" }));
    expect(screen.getByLabelText("Font")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Sending" }));
    const who = screen.getByRole("radiogroup", { name: "Who gets it" });
    expect(within(who).getByRole("radio", { name: /Not yet inside/ })).toHaveAttribute("aria-checked", "true");
    expect(await within(who).findAllByText("40 guests")).toHaveLength(3);
  });

  it("sends a test as a real guest would get it", async () => {
    render(<EmailEditor scope={{ kind: "event", eventId: 42 }} templateId="t3" />);
    await screen.findByRole("heading", { name: "Reminder · doors open" });

    fireEvent.click(screen.getByRole("button", { name: "Preview as a guest" }));
    fireEvent.click(await screen.findByRole("option", { name: /Meera Nair/ }));
    expect(screen.getByRole("button", { name: /Previewing as Meera Nair/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Send test/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/as Meera Nair would get it/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Send to"), { target: { value: "me@example.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Send test/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/events/42/emails/test")).toBe(true));
    expect(calls.find((c) => c.path === "/api/v1/events/42/emails/test")?.body).toMatchObject({ to: "me@example.com", registrationId: "r1" });
  });

  it("keeps the rest in one menu: the club's default, the club's version, duplicate", async () => {
    render(<EmailEditor scope={{ kind: "event", eventId: 42 }} templateId="t3" />);
    await screen.findByRole("heading", { name: "Reminder · doors open" });

    fireEvent.keyDown(screen.getByRole("button", { name: "More for this email" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /Back to the club's version/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Send to the audience now/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Duplicate/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Make this the club's default/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/events/42/emails/t3/save-to-library")).toBe(true));
  });

  it("in the library, has no guest to preview as and no test to send", async () => {
    render(<EmailEditor scope={{ kind: "library" }} templateId="t3" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Reminder · doors open" })).toBeInTheDocument();
    expect(screen.getByText("Shown with a sample guest.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send test/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Email library/ })).toHaveAttribute("href", "/emails");
  });
});
