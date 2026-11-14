import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, isRenewable } from "@moa/api";

/**
 * The browser client renews a spent session by itself (packages/api/src/client.ts):
 * one /auth/refresh however many requests failed together, each sent again
 * once, and the session called over only when the renewal itself is refused.
 */

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const expired = () => json(401, { message: "Token has expired", error_code: "TOKEN_EXPIRED" });

/** A fake API: the session is spent until /auth/refresh is answered `refresh`. */
function fakeApi(refresh: () => Response | Promise<Response> = () => json(200, { token_type: "Bearer" })) {
  let live = false;
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path.endsWith("/api/v1/auth/refresh")) {
      const answer = await refresh();
      if (answer.ok) live = true;
      return answer;
    }
    return live ? json(200, { path }) : expired();
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls, renewals: () => calls.filter((c) => c.endsWith("/auth/refresh")).length };
}

const client = (fetchImpl: typeof fetch, onEnded = vi.fn()) =>
  ({ api: createApiClient({ baseUrl: "/api/gateway", fetchImpl, renew: { path: "/api/v1/auth/refresh", onEnded } }), onEnded });

describe("a session that runs out under an open page", () => {
  it("is renewed once for many requests refused together, and each is sent again", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const fake = fakeApi(async () => {
      await held;
      return json(200, {});
    });
    const { api, onEnded } = client(fake.fetchImpl);
    const all = Promise.all([api.get("/api/v1/clubs/me"), api.get("/api/v1/events/1"), api.post("/api/v1/events/1/notes", { text: "hi" })]);
    await vi.waitFor(() => expect(fake.renewals()).toBe(1));
    release();
    const answers = await all;
    expect(answers).toEqual([{ path: "/api/gateway/api/v1/clubs/me" }, { path: "/api/gateway/api/v1/events/1" }, { path: "/api/gateway/api/v1/events/1/notes" }]);
    expect(fake.renewals()).toBe(1);
    expect(fake.calls.filter((c) => c === "POST /api/gateway/api/v1/events/1/notes")).toHaveLength(2);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("sends the renewal POST through the gateway with the cookies, no body", async () => {
    const fake = fakeApi();
    const { api } = client(fake.fetchImpl);
    await api.get("/api/v1/clubs/me");
    const [, init] = (fake.fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([u]) => String(u).endsWith("/auth/refresh"))!;
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(init.body).toBeUndefined();
  });

  it("a 401 that arrives after another request already renewed is just sent again", async () => {
    const fake = fakeApi();
    // Two requests in flight; the first one's 401 renews, the second's arrives late.
    let releaseLate!: () => void;
    const late = new Promise<void>((r) => (releaseLate = r));
    const base = fake.fetchImpl;
    const slow = (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/slow") && !fake.calls.includes("GET /api/gateway/api/v1/slow")) {
        const answer = expired();
        fake.calls.push("GET /api/gateway/api/v1/slow");
        await late;
        return answer;
      }
      return base(url, init);
    }) as unknown as typeof fetch;
    const c = createApiClient({ baseUrl: "/api/gateway", fetchImpl: slow, renew: { path: "/api/v1/auth/refresh" } });
    const slowOne = c.get("/api/v1/slow");
    await c.get("/api/v1/fast");
    releaseLate();
    await expect(slowOne).resolves.toEqual({ path: "/api/gateway/api/v1/slow" });
    expect(fake.renewals()).toBe(1);
  });

  it("says the session is over once when the renewal is refused, and throws the request's own 401", async () => {
    const fake = fakeApi(() => json(401, { message: "Token has been revoked, please log in again" }));
    const { api, onEnded } = client(fake.fetchImpl);
    const results = await Promise.allSettled([api.get("/api/v1/a"), api.get("/api/v1/b")]);
    for (const r of results) {
      expect(r.status).toBe("rejected");
      expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 401, errorCode: "TOKEN_EXPIRED" });
    }
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded.mock.calls[0]![0]).toBeInstanceOf(ApiError);
    // Over is over: nothing more is asked of /auth/refresh until something goes through.
    await expect(api.get("/api/v1/c")).rejects.toMatchObject({ status: 401 });
    expect(fake.renewals()).toBe(1);
  });

  it("does not end the session when the renewal could not be asked (the API restarting, offline)", async () => {
    for (const refresh of [() => json(502), () => Promise.reject(new TypeError("fetch failed"))]) {
      const fake = fakeApi(refresh as () => Promise<Response>);
      const { api, onEnded } = client(fake.fetchImpl);
      await expect(api.get("/api/v1/a")).rejects.toMatchObject({ status: 401 });
      expect(onEnded).not.toHaveBeenCalled();
      // The next request tries again.
      await expect(api.get("/api/v1/b")).rejects.toMatchObject({ status: 401 });
      expect(fake.renewals()).toBe(2);
    }
  });

  it("sends a request again only once: a second 401 is thrown, never renewed in a loop", async () => {
    const fetchImpl = vi.fn(async (url: string) => (String(url).endsWith("/auth/refresh") ? json(200) : expired())) as unknown as typeof fetch;
    const { api, onEnded } = client(fetchImpl);
    await expect(api.get("/api/v1/a")).rejects.toMatchObject({ status: 401 });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([u]) => String(u))).toEqual([
      "/api/gateway/api/v1/a",
      "/api/gateway/api/v1/auth/refresh",
      "/api/gateway/api/v1/a",
    ]);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("leaves alone a 401 about the credentials sent, or one that says why", async () => {
    const coded = vi.fn(async () => json(401, { message: "Enter the code", error_code: "TOTP_REQUIRED" })) as unknown as typeof fetch;
    const { api } = client(coded);
    await expect(api.post("/api/v1/auth/token", new URLSearchParams({ username: "a", password: "b" }))).rejects.toMatchObject({ status: 401 });
    await expect(api.get("/api/v1/clubs/me")).rejects.toMatchObject({ errorCode: "TOTP_REQUIRED" });
    expect((coded as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);

    const e = (code: string | null) => new ApiError({ message: "x", status: 401, errorCode: code });
    expect(isRenewable(e(null), "/api/v1/clubs/me")).toBe(true);
    expect(isRenewable(e("TOKEN_EXPIRED"), "/api/v1/auth/me")).toBe(true);
    for (const code of ["ACCESS_REMOVED", "SESSION_REUSED", "IMPERSONATION_ENDED", "TOTP_INVALID"]) expect(isRenewable(e(code), "/api/v1/clubs/me")).toBe(false);
    for (const path of ["/api/v1/auth/token", "/api/v1/auth/refresh", "/api/v1/auth/logout", "/api/v1/auth/google/dashboard", "/api/v1/auth/password/reset", "/api/v1/auth/impersonate/exchange"]) {
      expect(isRenewable(e(null), path)).toBe(false);
    }
    expect(isRenewable(new ApiError({ message: "x", status: 403, errorCode: null }), "/api/v1/clubs/me")).toBe(false);
  });

  it("never renews a call made with renew: false (signing out)", async () => {
    const fake = fakeApi();
    const { api } = client(fake.fetchImpl);
    await expect(api.post("/api/v1/clubs/anything", undefined, { renew: false })).rejects.toMatchObject({ status: 401 });
    expect(fake.renewals()).toBe(0);
  });

  it("renews after an upload cut off mid-way, without sending the file again", async () => {
    const fake = fakeApi();
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) =>
      String(url).endsWith("/media") ? json(502, { message: "The file couldn't be sent", error_code: "UPLOAD_INTERRUPTED" }) : fake.fetchImpl(url, init),
    ) as unknown as typeof fetch;
    const { api } = client(fetchImpl);
    const form = new FormData();
    form.set("file", new Blob(["x"]), "a.mp4");
    await expect(api.post("/api/v1/clubs/whatsapp/conversations/4/media", form)).rejects.toMatchObject({ errorCode: "UPLOAD_INTERRUPTED" });
    expect(fake.renewals()).toBe(1);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) => String(u).endsWith("/media"))).toHaveLength(1);
  });

  it("a client with no renewal (the server's, a door key's) answers a 401 as it is", async () => {
    const fake = fakeApi();
    const api = createApiClient({ baseUrl: "/api/gateway", fetchImpl: fake.fetchImpl });
    await expect(api.get("/api/v1/a")).rejects.toMatchObject({ status: 401 });
    expect(fake.renewals()).toBe(0);
  });
});
