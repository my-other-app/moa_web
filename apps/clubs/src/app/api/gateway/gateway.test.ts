import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createGatewayHandlers } from "@moa/auth/gateway";

/**
 * The gateway forwards the API's answer as it is. A 401 on a POST is the
 * case that broke: Node's fetch turns a 401 to a streamed request body into
 * a network error, which reached the browser as a bare 500 instead of the
 * API's AI_KEY_INVALID.
 */
let server: http.Server;
let apiUrl = "";
const seen: Array<{ method: string; type: string | undefined; length: number; body: string }> = [];

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    seen.push({ method: req.method!, type: req.headers["content-type"], length: body.length, body: body.toString("latin1") });
    if (req.url === "/api/v1/clubs/ai/write") {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ message: "Your AI key was rejected.", error_code: "AI_KEY_INVALID" }));
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const handlers = () => createGatewayHandlers({ apiUrl });
const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split("/").filter(Boolean) }) });

describe("the gateway", () => {
  it("passes the API's 401 on a POST through, with its body", async () => {
    const res = await handlers().POST(
      new Request("http://localhost/api/gateway/api/v1/clubs/ai/write", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "email", prompt: "Hi" }) }),
      ctx("api/v1/clubs/ai/write"),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Your AI key was rejected.", error_code: "AI_KEY_INVALID" });
    expect(seen.at(-1)).toMatchObject({ method: "POST", type: "application/json", body: '{"kind":"email","prompt":"Hi"}' });
  });

  it("forwards a multipart upload byte for byte, boundary and all", async () => {
    // Built by hand: the test DOM's FormData is not the one Node's fetch reads.
    const boundary = "----moa-test-boundary";
    const png = String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255);
    const body = [`--${boundary}`, 'Content-Disposition: form-data; name="text"', "", "Hack night", `--${boundary}`, 'Content-Disposition: form-data; name="file"; filename="poster.png"', "Content-Type: image/png", "", png, `--${boundary}--`, ""].join("\r\n");
    const bytes = Uint8Array.from(body, (c) => c.charCodeAt(0));
    const type = `multipart/form-data; boundary=${boundary}`;
    const res = await handlers().POST(new Request("http://localhost/api/gateway/api/v1/clubs/ai/event-draft", { method: "POST", headers: { "content-type": type }, body: bytes }), ctx("api/v1/clubs/ai/event-draft"));
    expect(res.status).toBe(200);
    expect(seen.at(-1)).toMatchObject({ method: "POST", type, length: bytes.byteLength, body });
  });

  it("sends no body where there was none", async () => {
    const res = await handlers().DELETE(new Request("http://localhost/api/gateway/api/v1/clubs/ai/key", { method: "DELETE" }), ctx("api/v1/clubs/ai/key"));
    expect(res.status).toBe(200);
    expect(seen.at(-1)).toMatchObject({ method: "DELETE", length: 0 });
  });
});
