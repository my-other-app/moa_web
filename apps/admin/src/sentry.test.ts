import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sentry is off unless NEXT_PUBLIC_SENTRY_DSN is set: no init in the browser
 * or on the server, and no error forwarded. With a DSN it starts with the
 * private options (no replay, no trace headers, a low trace rate).
 */
const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureRequestError: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => sentry);

const DSN = "https://public@o0.ingest.sentry.io/0";
type OnRequestError = typeof import("./instrumentation").onRequestError;
const requestErrorArgs = [
  new Error("render failed"),
  { path: "/events", method: "GET", headers: {} },
  { routerKind: "App Router", routePath: "/events", routeType: "render", renderSource: "react-server-components", revalidateReason: undefined, renderType: "dynamic" },
] as unknown as Parameters<OnRequestError>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each([
  ["unset", undefined],
  ["empty", ""],
  ["blank", "  "],
])("with the DSN %s", (_, dsn) => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", dsn);
  });

  it("never starts Sentry in the browser", async () => {
    const client = await import("./instrumentation-client");
    client.onRouterTransitionStart("/events", "push");
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled();
  });

  it("never starts Sentry on the server, nor forwards a request error", async () => {
    const { register, onRequestError } = await import("./instrumentation");
    await register();
    await onRequestError(...requestErrorArgs);
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureRequestError).not.toHaveBeenCalled();
  });
});

describe("with a DSN", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "preview");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_RELEASE", "moa@abc123");
  });

  it("starts in the browser with no replay and no trace headers", async () => {
    const client = await import("./instrumentation-client");
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sentry.init.mock.calls[0]?.[0]).toMatchObject({
      dsn: DSN,
      environment: "preview",
      release: "moa@abc123",
      tracesSampleRate: 0.05,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      tracePropagationTargets: [],
      dataCollection: { cookies: false, userInfo: false, httpBodies: [] },
    });
    client.onRouterTransitionStart("/events", "push");
    expect(sentry.captureRouterTransitionStart).toHaveBeenCalledWith("/events", "push");
  });

  it("starts on the server and forwards request errors", async () => {
    const { register, onRequestError } = await import("./instrumentation");
    await register();
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sentry.init.mock.calls[0]?.[0]).toMatchObject({ dsn: DSN, environment: "preview", tracesSampleRate: 0.05 });
    await onRequestError(...requestErrorArgs);
    expect(sentry.captureRequestError).toHaveBeenCalledWith(...requestErrorArgs);
  });
});
