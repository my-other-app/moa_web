import { describe, expect, it } from "vitest";

import { DEFAULT_TRACES_SAMPLE_RATE, PRIVATE_DATA_COLLECTION, sentryOptions } from "./options";

const DSN = "https://public@o0.ingest.sentry.io/0";

describe("sentryOptions", () => {
  it("is null without a DSN, in every runtime", () => {
    for (const runtime of ["client", "server", "edge"] as const) {
      expect(sentryOptions("clubs", runtime, {})).toBeNull();
      expect(sentryOptions("clubs", runtime, { dsn: "" })).toBeNull();
      expect(sentryOptions("clubs", runtime, { dsn: "   " })).toBeNull();
    }
  });

  it("carries the DSN, environment, release and a low trace rate", () => {
    const options = sentryOptions("admin", "server", { dsn: DSN, environment: "production", release: "moa-admin@abc123" });
    expect(options).toMatchObject({
      dsn: DSN,
      environment: "production",
      release: "moa-admin@abc123",
      tracesSampleRate: DEFAULT_TRACES_SAMPLE_RATE,
      initialScope: { tags: { app: "admin", runtime: "server" } },
    });
    expect(DEFAULT_TRACES_SAMPLE_RATE).toBe(0.05);
  });

  it("leaves environment and release to the SDK when they are not set", () => {
    const options = sentryOptions("clubs", "server", { dsn: DSN });
    expect(options).not.toHaveProperty("environment");
    expect(options).not.toHaveProperty("release");
  });

  it("collects nothing personal", () => {
    const options = sentryOptions("clubs", "server", { dsn: DSN });
    expect(options?.dataCollection).toEqual(PRIVATE_DATA_COLLECTION);
    expect(PRIVATE_DATA_COLLECTION).toMatchObject({ userInfo: false, cookies: false, httpBodies: [], stackFrameVariables: false });
    expect(options).not.toHaveProperty("sendDefaultPii");
  });

  it("turns off replay and browser trace headers on the client", () => {
    expect(sentryOptions("clubs", "client", { dsn: DSN })).toMatchObject({
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      tracePropagationTargets: [],
    });
    expect(sentryOptions("clubs", "client", { dsn: DSN })).not.toHaveProperty("integrations");
  });

  it("accepts a trace rate between 0 and 1 and ignores anything else", () => {
    expect(sentryOptions("clubs", "server", { dsn: DSN, tracesSampleRate: "0.2" })?.tracesSampleRate).toBe(0.2);
    expect(sentryOptions("clubs", "server", { dsn: DSN, tracesSampleRate: "0" })?.tracesSampleRate).toBe(0);
    for (const bad of ["2", "-1", "lots", ""]) {
      expect(sentryOptions("clubs", "server", { dsn: DSN, tracesSampleRate: bad })?.tracesSampleRate).toBe(DEFAULT_TRACES_SAMPLE_RATE);
    }
  });

  it("scrubs what is sent through its hooks", () => {
    const options = sentryOptions("clubs", "client", { dsn: DSN });
    const crumb = options?.beforeBreadcrumb?.({ category: "navigation", data: { to: "/join?token=abc" } });
    expect(crumb?.data).toEqual({ to: "/join?token=[Filtered]" });
  });
});
