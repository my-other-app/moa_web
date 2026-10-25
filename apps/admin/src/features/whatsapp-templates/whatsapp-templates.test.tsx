import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/** The templates on MyOtherApp's own WhatsApp number, and Meta's verdict on each. */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: state.role } }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, callsOf } = await import("@/test/fake-api");
const { TemplatesPage, statusTone } = await import("./index");

const EXPECTED = [
  { name: "ticket_confirmed", purpose: "The ticket, after registering or paying" },
  { name: "event_reminder", purpose: "The day-before reminder" },
];

beforeEach(() => {
  freshState(state);
  state.handlers["GET /api/v1/admin/whatsapp/templates"] = ({ query }) => ({
    configured: true,
    waba_id: "1234",
    templates: [
      { id: "1", name: "ticket_confirmed", language: "en", status: "approved", category: "utility", rejected_reason: null, quality: "GREEN", body: "Hi {{1}}", expected: true },
      { id: "2", name: "certificate_ready", language: "en", status: query?.refresh ? "approved" : "rejected", category: "utility", rejected_reason: query?.refresh ? null : "INVALID_FORMAT", quality: null, body: null, expected: true },
    ],
    missing: [EXPECTED[1]],
    expected: EXPECTED,
    checked_at: "2026-10-24T10:00:00Z",
    cached: false,
    error: null,
  });
});

describe("the platform's WhatsApp templates", () => {
  it("shows each with Meta's status, the reason for a rejection, and the ones missing", async () => {
    render(<TemplatesPage />);
    const rejected = (await screen.findByText("certificate_ready")).closest("tr")!;
    expect(within(rejected).getByText("rejected")).toBeInTheDocument();
    expect(within(rejected).getByText("invalid format")).toBeInTheDocument();
    expect(screen.getByText(/no template named event_reminder/)).toBeInTheDocument();
    expect(statusTone("approved")).toBe("success");
    expect(statusTone("paused")).toBe("destructive");
  });

  it("asks Meta again on request", async () => {
    render(<TemplatesPage />);
    await screen.findByText("certificate_ready");
    fireEvent.click(screen.getByRole("button", { name: /Ask Meta again/ }));
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/whatsapp/templates").at(-1)!.query).toEqual({ refresh: true }));
    await waitFor(() => expect(within(screen.getByText("certificate_ready").closest("tr")!).getByText("approved")).toBeInTheDocument());
  });

  it("says the number is not set up on a server without its keys", async () => {
    state.handlers["GET /api/v1/admin/whatsapp/templates"] = () => ({ configured: false, waba_id: null, templates: [], missing: EXPECTED, expected: EXPECTED, checked_at: null, cached: false, error: null });
    render(<TemplatesPage />);
    expect(await screen.findByText(/not set up on this server/)).toBeInTheDocument();
  });
});
