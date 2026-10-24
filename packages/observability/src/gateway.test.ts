import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => {
  const scope = { setLevel: vi.fn(), setTag: vi.fn(), setContext: vi.fn(), setFingerprint: vi.fn() };
  return {
    scope,
    client: { name: "client" } as unknown,
    captureMessage: vi.fn(),
    getClient: vi.fn(),
    withScope: vi.fn((fn: (s: typeof scope) => void) => fn(scope)),
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureMessage: sentry.captureMessage,
  getClient: sentry.getClient,
  withScope: sentry.withScope,
}));

import { normalizeApiPath, reportUpstreamResponse } from "./gateway";

beforeEach(() => {
  vi.clearAllMocks();
  sentry.getClient.mockReturnValue(sentry.client);
});

describe("reportUpstreamResponse", () => {
  it("reports an upstream 5xx, grouped by endpoint rather than by id", () => {
    reportUpstreamResponse({ method: "GET", path: "/api/v1/events/42/attendees", status: 502, durationMs: 31 });
    expect(sentry.captureMessage).toHaveBeenCalledWith("Upstream 502 on GET /api/v1/events/:id/attendees");
    expect(sentry.scope.setLevel).toHaveBeenCalledWith("error");
    expect(sentry.scope.setFingerprint).toHaveBeenCalledWith(["gateway-upstream", "GET", "/api/v1/events/:id/attendees", "502"]);
    expect(sentry.scope.setContext).toHaveBeenCalledWith("gateway", {
      method: "GET",
      path: "/api/v1/events/:id/attendees",
      status: 502,
      duration_ms: 31,
    });
  });

  it("does not report a 4xx: that is the API answering the caller", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      reportUpstreamResponse({ method: "POST", path: "/api/v1/auth/login", status, durationMs: 5 });
    }
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("does not report a success or a redirect", () => {
    reportUpstreamResponse({ method: "GET", path: "/api/v1/auth/me", status: 200, durationMs: 5 });
    reportUpstreamResponse({ method: "GET", path: "/api/v1/auth/google", status: 302, durationMs: 5 });
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("does nothing at all when Sentry is off", () => {
    sentry.getClient.mockReturnValue(undefined);
    reportUpstreamResponse({ method: "GET", path: "/api/v1/events", status: 503, durationMs: 5 });
    expect(sentry.withScope).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe("normalizeApiPath", () => {
  it("drops ids, tokens, people and the query string", () => {
    expect(normalizeApiPath("/api/v1/events/42/doors/a8F3kQ9zL2mN7pR4sT6v/link?key=abc")).toBe("/api/v1/events/:id/doors/:token/link");
    expect(normalizeApiPath("/api/v1/clubs/followers/asha@example.com")).toBe("/api/v1/clubs/followers/[email]");
  });
});
