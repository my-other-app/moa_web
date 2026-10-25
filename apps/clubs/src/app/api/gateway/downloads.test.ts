import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createGatewayHandlers } from "@moa/auth/gateway";

/**
 * The dashboard's file downloads (the followers export and the finance
 * statement) are plain links to the gateway, so the browser saves whatever
 * the gateway hands back. It has to hand back the API's file untouched: the
 * same bytes, the CSV type and the attachment name, with the session cookie
 * sent upstream and the segment or period in the query kept.
 */
let server: http.Server;
let apiUrl = "";
const seen: Array<{ url: string; cookie: string | undefined }> = [];
const FOLLOWERS = "name,username,followed_at\r\nAnanya Iyer,ananya,2026-03-01\r\nRohan Patil,rohan,2026-09-02\r\n";
const STATEMENT = "date,kind,title,amount\r\n2026-10-01,income,Tickets — Hack Night 04,\"12,500\"\r\n";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen.push({ url: req.url!, cookie: req.headers.cookie });
    const path = req.url!.split("?")[0];
    if (path === "/api/v1/clubs/followers/export.csv") {
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="followers-quiet.csv"' });
      return res.end(FOLLOWERS);
    }
    if (path === "/api/v1/clubs/finance/statement.csv") {
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="statement-2026-10.csv"' });
      return res.end(STATEMENT);
    }
    if (path === "/api/v1/events/37/finance/statement.csv") {
      res.writeHead(403, { "content-type": "application/json" });
      return res.end(JSON.stringify({ message: "Finance is on the Pro plan", error_code: "PLAN_FEATURE_LOCKED" }));
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const get = (url: string) => {
  const { pathname } = new URL(url, "http://localhost");
  const path = pathname.replace(/^\/api\/gateway\//, "");
  return createGatewayHandlers({ apiUrl }).GET(new Request(`http://localhost${url}`, { headers: { cookie: "moa_access=abc" } }), {
    params: Promise.resolve({ path: path.split("/").filter(Boolean) }),
  });
};

describe("downloads through the gateway", () => {
  it("hands back the followers export as the API's own CSV attachment, for the segment asked", async () => {
    const res = await get("/api/gateway/api/v1/clubs/followers/export.csv?segment=quiet");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="followers-quiet.csv"');
    expect(await res.text()).toBe(FOLLOWERS);
    expect(seen.at(-1)).toEqual({ url: "/api/v1/clubs/followers/export.csv?segment=quiet", cookie: "moa_access=abc" });
  });

  it("hands back the finance statement for the period asked, commas in amounts intact", async () => {
    const res = await get("/api/gateway/api/v1/clubs/finance/statement.csv?from=2026-10-01&to=2026-10-31");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="statement-2026-10.csv"');
    expect(await res.text()).toBe(STATEMENT);
    expect(seen.at(-1)!.url).toBe("/api/v1/clubs/finance/statement.csv?from=2026-10-01&to=2026-10-31");
  });

  it("passes a refusal through with its status and words, not as a file", async () => {
    const res = await get("/api/gateway/api/v1/events/37/finance/statement.csv");
    expect(res.status).toBe(403);
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(await res.json()).toEqual({ message: "Finance is on the Pro plan", error_code: "PLAN_FEATURE_LOCKED" });
  });
});
