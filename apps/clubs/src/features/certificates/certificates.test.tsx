import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown; query?: unknown }> = [];

const email = { channel: "email", sent: 40, failed: 2, skipped: 1, pending: 0, unsent: 5 };
const summary = { issued: 48, revoked: 2, attended: 52, registrations: 64, outdated: 3, design_version: 2, channels: [email] };
const delivery = { kind: "certificate", registrations: 48, revoked: 2, providers: [{ channel: "email", name: "SES", configured: true, note: "" }], channels: [email] };
const rows = [
  {
    registration_id: "r1",
    ticket_id: "T1",
    number: "HN04-C-0001",
    name: "Ananya Rao",
    email: "ananya@example.com",
    role: "attendee",
    status: "issued",
    issued_at: "2026-10-12T10:00:00Z",
    revoked_at: null,
    design_version: 1,
    deliveries: [{ channel: "email", status: "sent", outcome: "delivered", attempts: 1, sent_at: "2026-10-12T10:05:00Z" }],
  },
  {
    registration_id: "r2",
    ticket_id: "T2",
    number: "HN04-C-0002",
    name: "Rohan Patil",
    email: null,
    role: "speaker",
    status: "revoked",
    issued_at: "2026-10-12T10:00:00Z",
    revoked_at: "2026-10-13T10:00:00Z",
    design_version: 2,
    deliveries: [],
  },
];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: unknown }) => {
        calls.push({ method: "GET", path, query: options?.query });
        if (path.endsWith("/certificates/summary")) return summary;
        if (path.endsWith("/deliveries/summary")) return delivery;
        if (path.endsWith("/certificates")) return { items: rows, total: rows.length, page: 1, page_size: 25 };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/issue-preview")) {
          const b = body as { audience: string; roles: string[] };
          return b.audience === "roles" ? { eligible: 12, already_issued: 10, to_issue: 2, outdated: 0 } : { eligible: 52, already_issued: 48, to_issue: 4, outdated: 3 };
        }
        if (path.endsWith("/issue")) return { issued: 4, refreshed: 3, already_issued: 48 };
        if (path.endsWith("/send")) return { queued: 3, already_sent: 0, revoked: 0, channels: ["email"] };
        if (path.endsWith("/revoke")) return { registration_id: "r1", number: "HN04-C-0001", revoked_at: "2026-10-14T00:00:00Z" };
        return {};
      }),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { CertificatesPage } = await import("./components/certificates-page");

beforeEach(() => {
  calls.length = 0;
});

describe("certificates", () => {
  it("leads with what is issued, sent and still to send, and the design", async () => {
    render(<CertificatesPage eventId={37} />);
    expect(await screen.findByText("48 issued · 40 sent by email · 52 of 64 attended")).toBeInTheDocument();
    expect(screen.getByText("52 of 64 attended · 2 revoked")).toBeInTheDocument();
    expect(screen.getByText("5 not sent · 2 failed · 1 no address")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Design: v2\. Open the designer/ })).toHaveAttribute("href", "/events/37/design?kind=certificate");
  });

  it("says once that some failed, and retries only those", async () => {
    render(<CertificatesPage eventId={37} />);
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("2 certificates could not be sent.");
    fireEvent.click(within(notice).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/certificates/send"))).toMatchObject({ body: { only: "failed" } }));
  });

  it("issues to the rule chosen, as the page's one primary action", async () => {
    render(<CertificatesPage eventId={37} />);
    const issue = await screen.findByRole("button", { name: "Issue 4 certificates" });
    expect(issue).toHaveClass("btn-primary");
    // Sending is not the next thing while some are still to issue.
    expect(await screen.findByRole("button", { name: "Send 8 certificates" })).toHaveClass("btn-secondary");
    fireEvent.click(issue);
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/certificates/issue"))).toMatchObject({ body: { audience: "checked_in", roles: [] } }));

    fireEvent.click(screen.getByRole("radio", { name: /^Certain roles/ }));
    expect(await screen.findByText("Pick at least one role to see who that is.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Speakers" }));
    expect(await screen.findByRole("button", { name: "Issue 2 certificates" })).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/issue-preview") && JSON.stringify(c.body) === JSON.stringify({ audience: "roles", roles: ["speaker"] }))).toBe(true);
  });

  it("shows the email bar with every PDF in one ZIP and the delivery log", async () => {
    render(<CertificatesPage eventId={37} />);
    expect(await screen.findByText(/of 48 sent/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Sent 40, Failed 2, No address 1, Not sent yet 5" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All PDFs \(ZIP\)/ })).toHaveAttribute("href", "/api/gateway/api/v1/events/37/certificates/bundle.zip");
    expect(screen.getByRole("link", { name: "Delivery log →" })).toHaveAttribute("href", "/events/37/deliveries");
  });

  it("lists each certificate with its number, where it landed, and its PDF", async () => {
    render(<CertificatesPage eventId={37} />);
    expect(await screen.findByText("Ananya Rao")).toBeInTheDocument();
    expect(screen.getAllByText("HN04-C-0001").length).toBeGreaterThan(0);
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.getByText("Design v1")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Ananya Rao's certificate" })).toHaveAttribute("href", "/api/gateway/api/v1/events/certificates/T1/pdf");
    // A revoked certificate's download is refused, so its button is off.
    expect(screen.getByRole("button", { name: "Rohan Patil's certificate is revoked" })).toBeDisabled();
    expect(screen.getByText("1–2 of 2 certificates")).toBeInTheDocument();
  });

  it("filters to the revoked ones", async () => {
    render(<CertificatesPage eventId={37} />);
    await screen.findByText("Ananya Rao");
    fireEvent.click(screen.getByRole("button", { name: "Revoked 2" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/certificates") && (c.query as { status?: string })?.status === "revoked")).toBe(true));
  });

  it("revokes one after asking", async () => {
    render(<CertificatesPage eventId={37} />);
    const trigger = await screen.findByRole("button", { name: "Actions for Ananya Rao" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Revoke/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("HN04-C-0001 stops verifying");
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke certificate" }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/r1/revoke"))).toBeTruthy());
  });
});
