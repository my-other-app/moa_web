import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { guardSession } from "@moa/auth/guard";
import { expiresSoon, resetRenewals, withCookies } from "@moa/auth/renew";

/**
 * The edge guard renews a session whose access cookie ran out from its
 * refresh cookie (packages/auth/src/guard.ts), so a tab left open navigates
 * on instead of going to sign-in.
 */

const API = "https://api.test";
const NOW = 1_800_000_000_000;
const jwt = (exp: number) => `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, "")}.s`;
const visit = (path: string, cookie?: string) =>
  new NextRequest(`https://club-dashboard.myotherapp.in${path}`, { headers: { ...(cookie ? { cookie } : {}), "x-forwarded-for": "203.0.113.9", "user-agent": "Phone" } });

function upstream(status = 200) {
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const headers = new Headers({ "content-type": "application/json" });
    if (status === 200) {
      headers.append("set-cookie", "access_token=NEW-A; HttpOnly; Max-Age=1800; Path=/; SameSite=lax; Secure");
      headers.append("set-cookie", "refresh_token=NEW-R; HttpOnly; Max-Age=604800; Path=/; SameSite=lax; Secure");
    }
    return new Response(JSON.stringify(status === 200 ? { token_type: "Bearer" } : { message: "Token has expired" }), { status, headers });
  });
}

const opts = (fetchImpl: ReturnType<typeof upstream>) => ({ apiUrl: API, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW });

afterEach(() => resetRenewals());

describe("the edge guard", () => {
  it("lets a live session through without asking anything", async () => {
    const api = upstream();
    const res = await guardSession(visit("/events", `access_token=${jwt(NOW / 1000 + 600)}; refresh_token=R1`), opts(api));
    expect(res.headers.get("location")).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it("renews a session with only its refresh cookie left, for the browser and for this render", async () => {
    const api = upstream();
    const res = await guardSession(visit("/events/7?tab=guests", "theme=dark; refresh_token=R1"), opts(api));
    expect(res.headers.get("location")).toBeNull();
    // The browser keeps the new cookies.
    expect(res.headers.getSetCookie()).toEqual([expect.stringContaining("access_token=NEW-A"), expect.stringContaining("refresh_token=NEW-R")]);
    // This render sees them (Next passes overridden request headers on as x-middleware-request-*).
    expect(res.headers.get("x-middleware-request-cookie")).toBe("theme=dark; access_token=NEW-A; refresh_token=NEW-R");
    // Asked with the refresh cookie alone, and the visitor's address and device.
    const [url, init] = api.mock.calls[0]!;
    expect(url).toBe(`${API}/api/v1/auth/refresh`);
    const sent = new Headers(init!.headers);
    expect(init!.method).toBe("POST");
    expect(sent.get("cookie")).toBe("refresh_token=R1");
    expect(sent.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(sent.get("user-agent")).toBe("Phone");
  });

  it("renews an access token about to run out, and keeps it when the renewal can't be had", async () => {
    const soon = `access_token=${jwt(NOW / 1000 + 10)}; refresh_token=R1`;
    const ok = upstream();
    expect((await guardSession(visit("/", soon), opts(ok))).headers.getSetCookie()).toHaveLength(2);
    resetRenewals();
    const down = upstream(502);
    const res = await guardSession(visit("/", soon), opts(down));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("asks once for a burst of requests carrying the same spent session", async () => {
    const api = upstream();
    const all = await Promise.all(["/events", "/finance", "/emails", "/"].map((p) => guardSession(visit(p, "refresh_token=R1"), opts(api))));
    expect(all.every((r) => r.headers.get("location") === null)).toBe(true);
    // Stragglers within the moment after are answered the same new cookies.
    await guardSession(visit("/website", "refresh_token=R1"), opts(api));
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("sends a refused renewal to sign-in, keeping the place, and clears the spent refresh cookie", async () => {
    const api = upstream(401);
    const res = await guardSession(visit("/events/7?tab=guests", "refresh_token=R1"), opts(api));
    expect(res.headers.get("location")).toBe(`https://club-dashboard.myotherapp.in/login?next=${encodeURIComponent("/events/7?tab=guests")}`);
    expect(res.headers.getSetCookie().join("\n")).toMatch(/refresh_token=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);
  });

  it("sends a visitor with no session to sign-in at once, without asking the API", async () => {
    const api = upstream();
    const res = await guardSession(visit("/finance"), opts(api));
    expect(res.headers.get("location")).toBe("https://club-dashboard.myotherapp.in/login?next=%2Ffinance");
    expect(api).not.toHaveBeenCalled();
  });

  it("reads a token's expiry without trusting it, and leaves anything unreadable to the API", () => {
    expect(expiresSoon(jwt(NOW / 1000 + 10), NOW)).toBe(true);
    expect(expiresSoon(jwt(NOW / 1000 - 10), NOW)).toBe(true);
    expect(expiresSoon(jwt(NOW / 1000 + 600), NOW)).toBe(false);
    expect(expiresSoon("abc", NOW)).toBe(false);
    expect(expiresSoon("a.!!!.c", NOW)).toBe(false);
    expect(withCookies("a=1; access_token=old; b=2", { access_token: "new", refresh_token: "r" })).toBe("a=1; b=2; access_token=new; refresh_token=r");
  });
});
