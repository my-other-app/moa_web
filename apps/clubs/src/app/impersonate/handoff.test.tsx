import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { createGatewayHandlers } from "@moa/auth/gateway";

/**
 * An admin's "View as" lands here with a two-minute token. This page trades
 * it for a session on the club dashboard's own origin -- through the
 * gateway, so the cookies the API sets are this app's -- and then opens the
 * dashboard, leaving the credential out of the browser history. A link that
 * is missing its token, or whose token has lapsed, says so and offers
 * sign-in instead.
 */
const nav = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  usePathname: () => "/impersonate",
  useSearchParams: () => search,
}));

const { ImpersonationHandoff } = await import("./handoff");
const { config } = await import("@/proxy");

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

beforeEach(() => {
  nav.replace.mockClear();
  nav.refresh.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the impersonation hand-off", () => {
  it("trades the token, form-encoded, at the exchange through this app's gateway", async () => {
    search = new URLSearchParams("token=tok%2Babc%3D%3D");
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    render(<ImpersonationHandoff />);
    expect(screen.getByText("Signing you in…")).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/gateway/api/v1/auth/impersonate/exchange");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    // The token reaches the API exactly as the admin's link carried it.
    expect(new URLSearchParams(String(init.body)).get("token")).toBe("tok+abc==");
  });

  it("opens the dashboard by replacing the address, so Back cannot return to the token", async () => {
    search = new URLSearchParams("token=abc");
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    render(<ImpersonationHandoff />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("says an expired or invalid link plainly and offers sign-in", async () => {
    search = new URLSearchParams("token=stale");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "Token expired" }), { status: 401 }));
    render(<ImpersonationHandoff />);
    expect(await screen.findByText("This link has expired or is invalid.")).toBeInTheDocument();
    expect(screen.getByText(/Hand-off links last two minutes/)).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalledWith("/");

    fireEvent.click(screen.getByRole("button", { name: "Go to sign in" }));
    expect(nav.replace).toHaveBeenCalledWith("/login");
  });

  it("says when the exchange could not be reached at all", async () => {
    search = new URLSearchParams("token=abc");
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ImpersonationHandoff />);
    expect(await screen.findByText("Failed to fetch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to sign in" })).toBeInTheDocument();
  });

  it("sends nothing for a link without a token", () => {
    search = new URLSearchParams();
    render(<ImpersonationHandoff />);
    expect(screen.getByText("No hand-off token in the link.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is reachable without a session: the sign-in guard leaves /impersonate alone", () => {
    // Next anchors the matcher to the whole path.
    const guarded = new RegExp(`^${config.matcher[0]}$`);
    expect(guarded.test("/impersonate")).toBe(false);
    expect(guarded.test("/events")).toBe(true);
    expect(guarded.test("/security")).toBe(true);
  });
});

describe("the exchange through the gateway", () => {
  let server: http.Server;
  let apiUrl = "";
  const seen: Array<{ url: string | undefined; type: string | undefined; body: string }> = [];

  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      seen.push({ url: req.url, type: req.headers["content-type"], body: Buffer.concat(chunks).toString() });
      res.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": ["access_token=a1; Path=/; HttpOnly; SameSite=Lax", "refresh_token=r1; Path=/; HttpOnly; SameSite=Lax"],
      });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("forwards the token to the API and hands both session cookies back to this origin", async () => {
    // The real fetch, not the stub above: this goes to a local API.
    vi.unstubAllGlobals();
    const { POST } = createGatewayHandlers({ apiUrl });
    const res = await POST(
      new Request("http://localhost/api/gateway/api/v1/auth/impersonate/exchange", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "token=abc",
      }),
      { params: Promise.resolve({ path: ["api", "v1", "auth", "impersonate", "exchange"] }) },
    );
    expect(res.status).toBe(200);
    expect(seen.at(-1)).toEqual({ url: "/api/v1/auth/impersonate/exchange", type: "application/x-www-form-urlencoded", body: "token=abc" });
    // Two cookies, kept apart -- one merged header would set neither.
    expect(res.headers.getSetCookie()).toEqual([
      "access_token=a1; Path=/; HttpOnly; SameSite=Lax",
      "refresh_token=r1; Path=/; HttpOnly; SameSite=Lax",
    ]);
  });
});
