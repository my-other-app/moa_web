import * as React from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Signing out ends the session on the server, not only in this browser:
 * /auth/logout clears the cookies and nothing else, so a copied cookie used
 * to outlive "Sign out" until it expired. The session this browser holds
 * (the one /auth/sessions marks current) is revoked first, as the website
 * does; the cookies are cleared whatever happens to that.
 */
type Call = { method: string; path: string };
const calls: Call[] = [];
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let sessions: () => Response = () =>
  json(200, [
    { id: "s-laptop", current: false },
    { id: "s-this/one", current: true },
  ]);

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^\/api\/gateway/, "");
    const method = init?.method ?? "GET";
    calls.push({ method, path });
    if (method === "GET" && path === "/api/v1/auth/sessions") return sessions();
    if (method === "DELETE" && path.startsWith("/api/v1/auth/sessions/")) return json(200, { message: "Session signed out" });
    if (method === "POST" && path === "/api/v1/auth/logout") return json(200, { success: true });
    return json(404, { message: "unstubbed" });
  }),
);
afterAll(() => vi.unstubAllGlobals());

const { useLogout } = await import("@moa/app-kit");

function signOut() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const { result } = renderHook(() => useLogout(), {
    wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return act(() => result.current.mutateAsync());
}

beforeEach(() => {
  calls.length = 0;
  sessions = () =>
    json(200, [
      { id: "s-laptop", current: false },
      { id: "s-this/one", current: true },
    ]);
});

describe("signing out", () => {
  it("revokes this browser's session on the server, then clears the cookies", async () => {
    await signOut();
    expect(calls).toEqual([
      { method: "GET", path: "/api/v1/auth/sessions" },
      { method: "DELETE", path: "/api/v1/auth/sessions/s-this%2Fone" },
      { method: "POST", path: "/api/v1/auth/logout" },
    ]);
  });

  it("ends only the current session, never the others", async () => {
    await signOut();
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([{ method: "DELETE", path: "/api/v1/auth/sessions/s-this%2Fone" }]);
  });

  it("still clears the cookies when the session is already over", async () => {
    sessions = () => json(401, { message: "Not signed in" });
    await signOut();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /api/v1/auth/sessions", "POST /api/v1/auth/logout"]);
  });

  it("still clears the cookies when the API has no answer", async () => {
    sessions = () => {
      throw new TypeError("Failed to fetch");
    };
    await signOut();
    expect(calls.at(-1)).toEqual({ method: "POST", path: "/api/v1/auth/logout" });
  });
});
