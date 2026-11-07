import { describe, expect, it, vi } from "vitest";

/**
 * The main portal's own gateway route, as deployed: the admin session is the
 * one most worth taking, so this is the route the public website and the
 * club dashboard (same site, so the cookies ride along) must not be able to
 * drive. The behaviour is the shared gateway's (packages/auth, tested in
 * full in the clubs app); this holds that the portal's route uses it.
 */
const upstream = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "https://myotherapp.in", "access-control-allow-credentials": "true" } }));
vi.stubGlobal("fetch", upstream);
vi.stubEnv("MOA_API_URL", "http://api.test");

const route = await import("./[...path]/route");
const HOST = "main-portal.myotherapp.in";
const ctx = { params: Promise.resolve({ path: ["api", "v1", "auth", "me"] }) };
const req = (method: string, headers: Record<string, string>) => new Request(`https://${HOST}/api/gateway/api/v1/auth/me`, { method, headers: { host: HOST, ...headers } });

describe("the main portal's gateway route", () => {
  it("answers a preflight from the public website or the club dashboard itself, granting nothing", async () => {
    for (const origin of ["https://myotherapp.in", "https://club-dashboard.myotherapp.in"]) {
      const res = await route.OPTIONS(req("OPTIONS", { origin, "access-control-request-method": "POST" }), ctx);
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses a change from the club dashboard, and sends one from its own pages", async () => {
    const refused = await route.POST(req("POST", { origin: "https://club-dashboard.myotherapp.in", "sec-fetch-site": "same-site" }), ctx);
    expect(refused.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    const sent = await route.POST(req("POST", { origin: `https://${HOST}`, "sec-fetch-site": "same-origin" }), ctx);
    expect(sent.status).toBe(200);
    expect(sent.headers.get("access-control-allow-origin")).toBeNull();
    expect(upstream).toHaveBeenCalledOnce();
  });
});
