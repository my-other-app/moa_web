import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CROSS_ORIGIN_REFUSED, createGatewayHandlers, isSameOrigin, stripTokens } from "@moa/auth/gateway";

/**
 * The gateway is the dashboard's one way to the API, and the boundary that
 * keeps other sites out of it. The API allows credentialed CORS for the
 * public website (which calls it directly), so the gateway must never pass
 * that answer on: the dashboards are same-origin apps and give no CORS at
 * all. A change must come from the dashboard's own pages (the CSRF check),
 * and the session tokens in an auth answer's body never reach page script.
 */
let server: http.Server;
let apiUrl = "";
const seen: Array<{ method: string; url: string }> = [];

const CORS = {
  "access-control-allow-origin": "https://myotherapp.in",
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET, POST, DELETE",
  "access-control-allow-headers": "content-type",
  "access-control-expose-headers": "content-disposition",
  vary: "Origin",
};
const TOKENS = { token_type: "bearer", access_token: "eyJ.access", refresh_token: "eyJ.refresh" };

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    for await (const _ of req) void _;
    seen.push({ method: req.method!, url: req.url! });
    const path = req.url!.split("?")[0];
    if (req.method === "OPTIONS") {
      res.writeHead(200, CORS);
      return res.end("OK");
    }
    if (path === "/api/v1/auth/token" || path === "/api/v1/auth/refresh" || path === "/api/v1/auth/google/dashboard" || path === "/api/v1/auth/password/reset") {
      res.writeHead(200, {
        ...CORS,
        "content-type": "application/json",
        "set-cookie": ["access_token=a1; Path=/; HttpOnly; SameSite=Lax", "refresh_token=r1; Path=/; HttpOnly; SameSite=Lax"],
      });
      return res.end(JSON.stringify(TOKENS));
    }
    if (path === "/api/v1/auth/impersonate/exchange") {
      res.writeHead(200, { "content-type": "application/json", "set-cookie": ["access_token=a2; Path=/; HttpOnly; SameSite=Lax"] });
      return res.end(JSON.stringify({ ...TOKENS, refresh_token: "" }));
    }
    if (path === "/api/v1/somewhere/session") {
      // Not an auth route, but it starts a session: its tokens go too.
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "set-cookie": ["access_token=a3; Path=/; HttpOnly"] });
      return res.end(JSON.stringify({ username: "devika", ...TOKENS }));
    }
    if (path === "/api/v1/auth/admin/impersonate/7") {
      // The hand-off token is for the admin's page to pass on: not a session, kept.
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ token: "handoff", expires_in: 120 }));
    }
    if (path === "/api/v1/clubs/whatsapp/account") {
      // Not an auth route and no session cookie: the body is the API's own, untouched.
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ access_token: "set", phone: "+91" }));
    }
    res.writeHead(200, { ...CORS, "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  seen.length = 0;
});

const HOST = "main-portal.myotherapp.in";
const gateway = () => createGatewayHandlers({ apiUrl });
const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split("/").filter(Boolean) }) });
const call = (method: string, path: string, headers: Record<string, string> = {}, body?: string) =>
  gateway()[method as "POST"](
    new Request(`https://${HOST}/api/gateway/${path}`, { method, headers: { host: HOST, ...headers }, body }),
    ctx(path),
  );
const corsHeaders = (res: Response) => [...res.headers.keys()].filter((k) => k.startsWith("access-control-"));

describe("CORS through the gateway", () => {
  it("answers a preflight itself, from any origin, with no Access-Control-* and without asking the API", async () => {
    for (const origin of ["https://myotherapp.in", "https://club-dashboard.myotherapp.in", "https://evil.example"]) {
      const res = await call("OPTIONS", "api/v1/auth/me", {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      });
      expect(res.status).toBe(204);
      expect(corsHeaders(res)).toEqual([]);
    }
    expect(seen).toEqual([]);
  });

  it("passes no Access-Control-* header on from the API's answer", async () => {
    const res = await call("GET", "api/v1/auth/me", { origin: "https://myotherapp.in", "sec-fetch-site": "same-site" });
    expect(res.status).toBe(200);
    expect(corsHeaders(res)).toEqual([]);
    // Other headers still pass.
    expect(res.headers.get("vary")).toBe("Origin");
  });
});

describe("requests that change something (the CSRF check)", () => {
  it("refuses one from the public website, the other dashboard or any other site, without sending it", async () => {
    for (const origin of ["https://myotherapp.in", "https://club-dashboard.myotherapp.in", "https://evil.example", "null"]) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const res = await call(method, "api/v1/clubs/approve/4", { origin }, method === "DELETE" ? undefined : "{}");
        expect(res.status).toBe(403);
        expect(((await res.json()) as { error_code: string }).error_code).toBe(CROSS_ORIGIN_REFUSED);
      }
    }
    expect(seen).toEqual([]);
  });

  it("refuses one whose Sec-Fetch-Site says another site, when there is no Origin", async () => {
    for (const site of ["same-site", "cross-site", "none"]) {
      const res = await call("POST", "api/v1/clubs/approve/4", { "sec-fetch-site": site }, "{}");
      expect(res.status).toBe(403);
    }
    expect(seen).toEqual([]);
  });

  it("refuses one that names neither: nothing on the dashboard sends that", async () => {
    const res = await call("POST", "api/v1/clubs/approve/4", {}, "{}");
    expect(res.status).toBe(403);
    expect(seen).toEqual([]);
  });

  it("refuses a same-host Origin the browser marks cross-site", async () => {
    const res = await call("POST", "api/v1/clubs/approve/4", { origin: `https://${HOST}`, "sec-fetch-site": "cross-site" }, "{}");
    expect(res.status).toBe(403);
  });

  it("sends one from the dashboard's own pages", async () => {
    const own = await call("POST", "api/v1/clubs/approve/4", { origin: `https://${HOST}`, "sec-fetch-site": "same-origin" }, "{}");
    expect(own.status).toBe(200);
    // An older browser without Sec-Fetch-Site still sends Origin.
    const originOnly = await call("DELETE", "api/v1/clubs/approve/4", { origin: `https://${HOST}` });
    expect(originOnly.status).toBe(200);
    // One without Origin on a same-origin request (some browsers' form posts) has Sec-Fetch-Site.
    const siteOnly = await call("PATCH", "api/v1/clubs/approve/4", { "sec-fetch-site": "same-origin" }, "{}");
    expect(siteOnly.status).toBe(200);
    expect(seen.map((s) => s.method)).toEqual(["POST", "DELETE", "PATCH"]);
  });

  it("lets a read from anywhere through: it changes nothing, and with no CORS another site cannot read it", async () => {
    const res = await call("GET", "api/v1/clubs/overview", { origin: "https://myotherapp.in", "sec-fetch-site": "same-site" });
    expect(res.status).toBe(200);
    expect(corsHeaders(res)).toEqual([]);
  });

  it("knows its own origin by the Host the proxy passed, or the forwarded host", () => {
    const req = (headers: Record<string, string>) => new Request("http://0.0.0.0:3000/api/gateway/x", { method: "POST", headers });
    expect(isSameOrigin(req({ host: HOST, origin: `https://${HOST}` }))).toBe(true);
    expect(isSameOrigin(req({ host: "admin:3000", "x-forwarded-host": HOST, origin: `https://${HOST}` }))).toBe(true);
    expect(isSameOrigin(req({ host: HOST, origin: `https://${HOST}.evil.example` }))).toBe(false);
    expect(isSameOrigin(req({ host: HOST, origin: "https://myotherapp.in" }))).toBe(false);
  });
});

describe("session tokens in auth answers", () => {
  const own = { origin: `https://${HOST}`, "sec-fetch-site": "same-origin" };

  it("drops them from sign-in, refresh, Google sign-in and password reset, and keeps the cookies", async () => {
    for (const path of ["api/v1/auth/token", "api/v1/auth/refresh", "api/v1/auth/google/dashboard", "api/v1/auth/password/reset"]) {
      const res = await call("POST", path, own, "{}");
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(JSON.parse(body)).toEqual({ token_type: "bearer" });
      expect(body).not.toContain("eyJ");
      expect(res.headers.getSetCookie()).toEqual(["access_token=a1; Path=/; HttpOnly; SameSite=Lax", "refresh_token=r1; Path=/; HttpOnly; SameSite=Lax"]);
    }
  });

  it("drops them from the impersonation exchange", async () => {
    const res = await call("POST", "api/v1/auth/impersonate/exchange", own, "token=abc");
    expect(await res.json()).toEqual({ token_type: "bearer" });
    expect(res.headers.getSetCookie()).toEqual(["access_token=a2; Path=/; HttpOnly; SameSite=Lax"]);
  });

  it("drops them from any answer that starts a session in this browser", async () => {
    const res = await call("POST", "api/v1/somewhere/session", own, "{}");
    expect(await res.json()).toEqual({ username: "devika", token_type: "bearer" });
  });

  it("keeps the admin's impersonation hand-off token, which is not a session", async () => {
    const res = await call("POST", "api/v1/auth/admin/impersonate/7", own, "{}");
    expect(await res.json()).toEqual({ token: "handoff", expires_in: 120 });
  });

  it("leaves other answers as the API sent them", async () => {
    const res = await call("GET", "api/v1/clubs/whatsapp/account");
    expect(await res.json()).toEqual({ access_token: "set", phone: "+91" });
  });

  it("strips only a JSON object's own token fields", () => {
    expect(stripTokens("not json")).toBe("not json");
    expect(stripTokens("[1,2]")).toBe("[1,2]");
    expect(stripTokens('{"a":1}')).toBe('{"a":1}');
    expect(JSON.parse(stripTokens('{"a":1,"access_token":"x","refresh_token":"y"}'))).toEqual({ a: 1 });
  });
});
