import { beforeEach, describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { Form } from "@moa/ui";

import eventDetail from "../__fixtures__/event-detail.json";

/**
 * Payments: the club's own Razorpay, against the backend's contract:
 * GET /clubs/payments/gateway → {available, connected, status, mode, key_id,
 * webhook_url, webhook_secret, webhook_events, verified_at, last_webhook_at,
 * last_error, can_manage}; PUT {key_id, key_secret}, POST /verify and DELETE
 * answer the same shape; PUT refuses with 422 INVALID_KEYS (Razorpay's reason
 * in the message) or TEST_KEYS_NOT_ALLOWED. The event detail carries
 * `payments_to`.
 */

const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

const NOT_CONNECTED = {
  available: true,
  connected: false,
  status: null,
  mode: null,
  key_id: null,
  webhook_url: null,
  webhook_secret: null,
  webhook_events: [],
  verified_at: null,
  last_webhook_at: null,
  last_error: null,
  can_manage: true,
};

const CONNECTED = {
  ...NOT_CONNECTED,
  connected: true,
  status: "active",
  mode: "keys",
  key_id: "rzp_live_AbC123xyz",
  webhook_url: "https://api.myotherapp.in/api/v1/payments/razorpay/webhook/club/5",
  webhook_secret: "whsec_9f8e7d6c",
  webhook_events: ["payment.captured", "payment.failed", "refund.processed"],
  verified_at: ago(10 * MIN),
};

const RECEIVING = { ...CONNECTED, last_webhook_at: ago(5 * MIN) };
const FAILED = { ...CONNECTED, status: "failed", last_error: "Authentication failed." };
const DISABLED = { ...CONNECTED, connected: false, status: "disabled", last_error: null };

type Answer = () => unknown;
const state = {
  gateway: NOT_CONNECTED as unknown,
  put: (() => CONNECTED) as Answer,
  verify: (() => CONNECTED) as Answer,
  del: (() => ({ ...NOT_CONNECTED, status: "disconnected" })) as Answer,
  details: {} as Record<string, unknown>,
};
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

function answer(value: unknown) {
  if (value instanceof Error) throw value;
  return value;
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/payments/gateway") return answer(state.gateway);
        if (path === "/api/v1/clubs/entitlements") return {};
        const detail = /^\/api\/v1\/events\/info\/(\d+)$/.exec(path);
        if (detail && state.details[detail[1]!]) return state.details[detail[1]!];
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (path === "/api/v1/clubs/payments/gateway") return answer(state.put());
        throw new Error(`unstubbed PUT ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/clubs/payments/gateway/verify") return answer(state.verify());
        throw new Error(`unstubbed POST ${path}`);
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        if (path === "/api/v1/clubs/payments/gateway") return answer(state.del());
        throw new Error(`unstubbed DELETE ${path}`);
      }),
      patch: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { PaymentsPage, gatewaySchema, hasAccount, paymentsToOf } = await import("./index");
const { EntryStep } = await import("@/features/event-form/components/steps/entry-step");
const { emptyEventForm } = await import("@/features/event-form/components/event-form");
const { navItems } = await import("@/components/nav-items");

const writeText = vi.fn(async () => {});

beforeEach(() => {
  calls.length = 0;
  writeText.mockClear();
  Object.assign(state, {
    gateway: NOT_CONNECTED,
    put: () => CONNECTED,
    verify: () => CONNECTED,
    del: () => ({ ...NOT_CONNECTED, status: "disconnected" }),
    details: {},
  });
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

const writes = () => calls.filter((c) => c.method !== "GET");
const account = () => screen.findByRole("region", { name: "Your Razorpay" });
const stepTwo = () => screen.findByRole("region", { name: "Step 2: payment notices" });

function fillKeys(id: string, secret: string) {
  fireEvent.change(screen.getByLabelText("Key ID"), { target: { value: id } });
  fireEvent.change(screen.getByLabelText("Key secret"), { target: { value: secret } });
}

describe("the shape", () => {
  it("parses the gateway, and an unknown status as none rather than a broken page", () => {
    expect(gatewaySchema.parse(CONNECTED)).toMatchObject({ connected: true, status: "active", key_id: "rzp_live_AbC123xyz", webhook_events: ["payment.captured", "payment.failed", "refund.processed"] });
    expect(gatewaySchema.parse({ ...CONNECTED, status: "on_fire" }).status).toBeNull();
  });

  it("counts a failed or disabled account as there, and sends payments to the club only while it is active", () => {
    const g = (over: Record<string, unknown>) => gatewaySchema.parse({ ...CONNECTED, ...over });
    expect(hasAccount(g({}))).toBe(true);
    expect(hasAccount(g({ connected: false, status: "failed" }))).toBe(true);
    expect(hasAccount(g({ connected: false, status: "disabled" }))).toBe(true);
    expect(hasAccount(g({ connected: false, status: "disconnected" }))).toBe(false);
    expect(hasAccount(gatewaySchema.parse(NOT_CONNECTED))).toBe(false);
    expect(paymentsToOf(g({}))).toBe("club");
    expect(paymentsToOf(g({ status: "failed" }))).toBe("platform");
    expect(paymentsToOf(g({ available: false }))).toBe("platform");
    expect(paymentsToOf(gatewaySchema.parse(NOT_CONNECTED))).toBe("platform");
  });
});

describe("the Payments page", () => {
  it("says so when the server is not set up for it, and offers nothing", async () => {
    state.gateway = { ...NOT_CONNECTED, available: false };
    render(<PaymentsPage />);
    expect(await screen.findByText("Own Razorpay isn't available yet — your ticket payments go through MyOtherApp.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Key ID")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Help" })).not.toBeInTheDocument();
  });

  it("reads a server without the route as not set up for it", async () => {
    state.gateway = new ApiError({ message: "Not Found", status: 404 });
    render(<PaymentsPage />);
    expect(await screen.findByText(/Own Razorpay isn't available yet/)).toBeInTheDocument();
  });

  it("explains, lists what is needed and asks for the live keys, the secret as a password", async () => {
    render(<PaymentsPage />);
    const panel = await account();
    expect(within(panel).getByText("Not connected")).toBeInTheDocument();
    expect(within(panel).getByText(/currently go through MyOtherApp's Razorpay account\. Connect your own to receive them directly in your bank account\./)).toBeInTheDocument();
    expect(within(panel).getByText("What you need")).toBeInTheDocument();
    expect(within(panel).getByText(/KYC done/)).toBeInTheDocument();
    expect(within(panel).getByText(/Live mode API keys/)).toBeInTheDocument();
    expect(screen.getByLabelText("Key ID")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Key secret")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: /Connect Razorpay/ })).toBeInTheDocument();
    // Help: where the live keys are, and who handles refunds.
    const help = screen.getByRole("region", { name: "Help" });
    expect(within(help).getByText(/Accounts & Settings → API Keys/)).toBeInTheDocument();
    expect(within(help).getByText(/Click Generate Key/)).toBeInTheDocument();
    expect(within(help).getByText(/switch to Live mode/)).toBeInTheDocument();
    expect(within(help).getByText(/refunds and disputes for them are handled in your own Razorpay Dashboard/)).toBeInTheDocument();
    // Nothing about the webhook until there is an account to send notices for.
    expect(screen.queryByRole("region", { name: "Step 2: payment notices" })).not.toBeInTheDocument();
  });

  it("asks for both keys before sending anything", async () => {
    render(<PaymentsPage />);
    await account();
    fireEvent.click(screen.getByRole("button", { name: /Connect Razorpay/ }));
    expect(await screen.findByText("Paste the Key ID from Razorpay.")).toBeInTheDocument();
    expect(screen.getByText("Paste the Key secret from Razorpay.")).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it("shows Razorpay's reason inline when it refuses the keys (INVALID_KEYS), and keeps the form", async () => {
    state.put = () => new ApiError({ message: "The api key provided is invalid", status: 422, errorCode: "INVALID_KEYS" });
    render(<PaymentsPage />);
    await account();
    fillKeys(" rzp_live_wrong ", "nope");
    fireEvent.click(screen.getByRole("button", { name: /Connect Razorpay/ }));
    const refusal = await screen.findByRole("alert");
    expect(refusal).toHaveTextContent("Razorpay didn't accept these keys: The api key provided is invalid. Check both and paste them again.");
    expect(writes()).toEqual([{ method: "PUT", path: "/api/v1/clubs/payments/gateway", body: { key_id: "rzp_live_wrong", key_secret: "nope" } }]);
    expect(screen.getByLabelText("Key ID")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Key secret")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("region", { name: "Your Razorpay" })).toHaveTextContent("Not connected");
  });

  it("says test mode keys are not taken (TEST_KEYS_NOT_ALLOWED), inline", async () => {
    state.put = () => new ApiError({ message: "Test keys are not allowed.", status: 422, errorCode: "TEST_KEYS_NOT_ALLOWED" });
    render(<PaymentsPage />);
    await account();
    fillKeys("rzp_test_123", "secret");
    fireEvent.click(screen.getByRole("button", { name: /Connect Razorpay/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("These are test mode keys. Switch the Razorpay Dashboard to Live mode and generate keys there — a live Key ID starts with rzp_live_.");
    expect(screen.getByLabelText("Key ID")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Key secret")).not.toHaveAttribute("aria-invalid");
  });

  it("says when the server cannot take it right now (503 GATEWAY_UNAVAILABLE)", async () => {
    state.put = () => new ApiError({ message: "Unavailable", status: 503, errorCode: "GATEWAY_UNAVAILABLE" });
    render(<PaymentsPage />);
    await account();
    fillKeys("rzp_live_ok", "secret");
    fireEvent.click(screen.getByRole("button", { name: /Connect Razorpay/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't available right now/);
  });

  it("connects, and the secret is never shown again", async () => {
    render(<PaymentsPage />);
    await account();
    fillKeys("rzp_live_AbC123xyz", "s3cr3t-value");
    fireEvent.click(screen.getByRole("button", { name: /Connect Razorpay/ }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Your Razorpay" })).toHaveTextContent("Active"));
    expect(screen.queryByLabelText("Key secret")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("s3cr3t-value")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("s3cr3t-value");
  });

  it("shows a connected account without a webhook: key, status, verified, no notice yet, and step 2 lit", async () => {
    state.gateway = CONNECTED;
    render(<PaymentsPage />);
    const panel = await account();
    expect(within(panel).getByText("Active")).toBeInTheDocument();
    expect(within(panel).getByText("rzp_live_AbC123xyz")).toBeInTheDocument();
    expect(within(panel).getByText("Verified")).toBeInTheDocument();
    expect(within(panel).getByText("10 min ago")).toBeInTheDocument();
    expect(within(panel).getByText("Last payment notice from Razorpay")).toBeInTheDocument();
    expect(within(panel).getByText("None yet — finish step 2")).toBeInTheDocument();
    for (const name of ["Check again", "Replace keys", "Disconnect"]) expect(within(panel).getByRole("button", { name })).toBeInTheDocument();

    const step = await stepTwo();
    expect(step).toHaveAttribute("data-todo", "true");
    expect(within(step).getByText("To do")).toBeInTheDocument();
    expect(within(step).getByText(/Accounts & Settings → Webhooks/)).toBeInTheDocument();
    expect(within(step).getByText("Click Add new webhook.")).toBeInTheDocument();
    expect(within(step).getByText(CONNECTED.webhook_url)).toBeInTheDocument();
    expect(within(step).getByText(CONNECTED.webhook_secret)).toBeInTheDocument();
    expect(within(step).getByText("Tick these events:")).toBeInTheDocument();
    const events = within(step).getByRole("list", { name: "Events to tick" });
    expect(within(events).getAllByRole("listitem").map((li) => li.textContent)).toEqual(CONNECTED.webhook_events);
    expect(within(step).getByText("Then come back and click Check again.")).toBeInTheDocument();

    fireEvent.click(within(step).getByRole("button", { name: "Copy the webhook url" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CONNECTED.webhook_url));
    fireEvent.click(within(step).getByRole("button", { name: "Copy the secret" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CONNECTED.webhook_secret));
  });

  it("shows when Razorpay's last notice came, and step 2 no longer lit", async () => {
    state.gateway = RECEIVING;
    render(<PaymentsPage />);
    const panel = await account();
    expect(within(panel).getByText("5 min ago")).toBeInTheDocument();
    expect(within(panel).queryByText("None yet — finish step 2")).not.toBeInTheDocument();
    const step = await stepTwo();
    expect(step).not.toHaveAttribute("data-todo");
    expect(within(step).getByText("Notices arriving")).toBeInTheDocument();
  });

  it("shows a failed check with Razorpay's words, and what to do", async () => {
    state.gateway = FAILED;
    render(<PaymentsPage />);
    const panel = await account();
    expect(within(panel).getByText("Failed")).toBeInTheDocument();
    expect(within(panel).getByRole("alert")).toHaveTextContent("Razorpay said: Authentication failed. Replace the keys, or fix them in Razorpay and click Check again.");
    expect(within(panel).getByText(/new payments for your paid events go through MyOtherApp's account/)).toBeInTheDocument();
  });

  it("checks again", async () => {
    state.gateway = FAILED;
    state.verify = () => RECEIVING;
    render(<PaymentsPage />);
    const panel = await account();
    fireEvent.click(within(panel).getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(writes()).toEqual([{ method: "POST", path: "/api/v1/clubs/payments/gateway/verify", body: undefined }]));
    await waitFor(() => expect(within(panel).getByText("Active")).toBeInTheDocument());
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("replaces the keys, or keeps them", async () => {
    state.gateway = CONNECTED;
    state.put = () => ({ ...CONNECTED, key_id: "rzp_live_New999" });
    render(<PaymentsPage />);
    const panel = await account();
    fireEvent.click(within(panel).getByRole("button", { name: "Replace keys" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Keep current keys" }));
    expect(within(panel).queryByLabelText("Key ID")).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Replace keys" }));
    fillKeys("rzp_live_New999", "another-secret");
    fireEvent.click(within(panel).getByRole("button", { name: /Save new keys/ }));
    await waitFor(() => expect(within(panel).getByText("rzp_live_New999")).toBeInTheDocument());
    expect(writes()).toEqual([{ method: "PUT", path: "/api/v1/clubs/payments/gateway", body: { key_id: "rzp_live_New999", key_secret: "another-secret" } }]);
    expect(within(panel).queryByLabelText("Key secret")).not.toBeInTheDocument();
  });

  it("asks before disconnecting, says what happens to payments, and goes back to the form", async () => {
    state.gateway = RECEIVING;
    render(<PaymentsPage />);
    const panel = await account();
    fireEvent.click(within(panel).getByRole("button", { name: "Disconnect" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("New payments will go to MyOtherApp's account. Payments already made stay in your Razorpay.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Keep connected" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(writes()).toHaveLength(0);

    fireEvent.click(within(panel).getByRole("button", { name: "Disconnect" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(writes()).toEqual([{ method: "DELETE", path: "/api/v1/clubs/payments/gateway" }]));
    expect(await screen.findByLabelText("Key ID")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Step 2: payment notices" })).not.toBeInTheDocument();
  });

  it("shows an account MyOtherApp turned off, with no way to switch it back on from here", async () => {
    state.gateway = DISABLED;
    render(<PaymentsPage />);
    const panel = await account();
    expect(within(panel).getByText("Disabled by MyOtherApp")).toBeInTheDocument();
    expect(within(panel).getByText(/MyOtherApp has turned off this connection/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Replace keys" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Step 2: payment notices" })).not.toBeInTheDocument();
  });

  it("is read-only for a team member: the status, and none of the buttons", async () => {
    state.gateway = { ...CONNECTED, can_manage: false, webhook_secret: null };
    render(<PaymentsPage />);
    const panel = await account();
    expect(screen.getByText(/Only the club's own account can connect or change the Razorpay account/)).toBeInTheDocument();
    expect(within(panel).getByText("Active")).toBeInTheDocument();
    expect(within(panel).getByText("rzp_live_AbC123xyz")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replace keys" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
    expect(within(await stepTwo()).getByText("Only the club's own account can see it.")).toBeInTheDocument();
  });

  it("gives a team member no form when nothing is connected", async () => {
    state.gateway = { ...NOT_CONNECTED, can_manage: false };
    render(<PaymentsPage />);
    const panel = await account();
    expect(within(panel).getByText("Only the club's own account can connect one.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Key ID")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Connect Razorpay/ })).not.toBeInTheDocument();
  });
});

// ─── The event form's note ───────────────────────────────────────────────

function Entry({ eventId, hasFee = true }: { eventId?: number; hasFee?: boolean }) {
  const form = useForm({ defaultValues: { ...emptyEventForm, has_fee: hasFee, reg_fee: hasFee ? 100 : undefined } });
  return (
    <Form {...form}>
      <form>
        <EntryStep eventId={eventId} />
      </form>
    </Form>
  );
}

const note = () => screen.findByText(/^Payments go/);

describe("the event form's note", () => {
  it("names the club's account when creating with one connected", async () => {
    state.gateway = CONNECTED;
    render(<Entry />);
    expect(await note()).toHaveTextContent("Payments go to your Razorpay (rzp_live_AbC123xyz)");
  });

  it("says MyOtherApp, with the way to connect, when creating without one", async () => {
    render(<Entry />);
    expect(await note()).toHaveTextContent("Payments go through MyOtherApp — connect your own Razorpay");
    expect(screen.getByRole("link", { name: "connect your own Razorpay" })).toHaveAttribute("href", "/payments");
  });

  it("sends a failed account to be fixed rather than connected, and offers nothing the server cannot take", async () => {
    state.gateway = FAILED;
    const first = render(<Entry />);
    expect(await note()).toHaveTextContent("Payments go through MyOtherApp — fix your Razorpay connection");
    expect(screen.getByRole("link", { name: "fix your Razorpay connection" })).toHaveAttribute("href", "/payments");
    first.unmount();

    state.gateway = DISABLED;
    const second = render(<Entry />);
    expect(await note()).toHaveTextContent(/^Payments go through MyOtherApp$/);
    second.unmount();

    state.gateway = { ...NOT_CONNECTED, available: false };
    render(<Entry />);
    expect(await note()).toHaveTextContent(/^Payments go through MyOtherApp$/);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("takes the event's own word when editing, over the club's account", async () => {
    state.gateway = CONNECTED;
    state.details = { "41": { ...eventDetail, id: 41, payments_to: "platform" }, "42": { ...eventDetail, id: 42, payments_to: "club" } };
    const first = render(<Entry eventId={41} />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/info/41")).toBe(true));
    // Connected, yet this event stays on MyOtherApp's account: said, with nothing to connect.
    await waitFor(() => expect(screen.getByText(/^Payments go/)).toHaveTextContent(/^Payments go through MyOtherApp$/));
    first.unmount();

    state.gateway = NOT_CONNECTED;
    render(<Entry eventId={42} />);
    await waitFor(() => expect(screen.getByText(/^Payments go/)).toHaveTextContent(/^Payments go to your Razorpay$/));
  });

  it("falls back to the club's account for an event from a server that does not say", async () => {
    state.gateway = CONNECTED;
    state.details = { "43": { ...eventDetail, id: 43 } };
    render(<Entry eventId={43} />);
    expect(await note()).toHaveTextContent("Payments go to your Razorpay (rzp_live_AbC123xyz)");
  });

  it("is not there while the event is free", async () => {
    state.gateway = CONNECTED;
    render(<Entry hasFee={false} />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/entitlements")).toBe(true));
    expect(screen.queryByText(/^Payments go/)).not.toBeInTheDocument();
  });
});

describe("the nav", () => {
  it("has Payments under Manage, next to Plan & billing, for every role and every plan", () => {
    const i = navItems.findIndex((n) => n.href === "/payments");
    expect(navItems[i]).toMatchObject({ label: "Payments", group: "manage" });
    expect(navItems[i]!.feature).toBeUndefined();
    expect(navItems[i]!.needs).toBeUndefined();
    expect(navItems[i - 1]!.href).toBe("/billing");
  });
});
