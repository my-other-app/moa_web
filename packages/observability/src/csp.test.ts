import { describe, expect, it, vi } from "vitest";

import { CSP_REPORT_MAX_BYTES, cspReportHandler, reportUrl, scrubCspReport, sentrySecurityUrl } from "./csp";

/**
 * A dashboard's CSP reports reach Sentry's security endpoint through the
 * app, with what was blocked and nothing of who was looking or what they
 * searched for.
 */

const report = (fields: Record<string, unknown>) => ({ "csp-report": fields });
const blocked = {
  "document-uri": "https://club-dashboard.myotherapp.in/events/42/attendees?q=ananya%40example.com&page=2#row-7",
  referrer: "https://club-dashboard.myotherapp.in/events?q=hack",
  "violated-directive": "script-src-elem",
  "effective-directive": "script-src-elem",
  "original-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; report-uri /api/csp-report",
  disposition: "report",
  "blocked-uri": "https://cdn.example.net/widget.js?session=abc123",
  "line-number": 12,
  "column-number": 7,
  "source-file": "https://club-dashboard.myotherapp.in/_next/static/chunks/app.js?v=1",
  "status-code": 200,
  "script-sample": "console.log('ananya@example.com')",
};

describe("the Sentry security endpoint", () => {
  it("is the DSN's host and project, with the key, environment and release", () => {
    expect(sentrySecurityUrl("https://abc123@o42.ingest.de.sentry.io/4507")).toBe("https://o42.ingest.de.sentry.io/api/4507/security/?sentry_key=abc123");
    expect(sentrySecurityUrl(" https://abc123@o42.ingest.sentry.io/4507 ", { environment: "production", release: "moa-clubs@43ec75a" })).toBe(
      "https://o42.ingest.sentry.io/api/4507/security/?sentry_key=abc123&sentry_environment=production&sentry_release=moa-clubs%4043ec75a",
    );
  });

  it("is null without a usable DSN", () => {
    for (const dsn of [undefined, null, "", "  ", "not a dsn", "https://o42.ingest.sentry.io/4507", "https://k@o42.ingest.sentry.io/abc", "http://k@o42.ingest.sentry.io/1"]) {
      expect(sentrySecurityUrl(dsn)).toBeNull();
    }
  });
});

describe("an address in a report", () => {
  it("is the origin and path, never the query, fragment or a user", () => {
    expect(reportUrl("https://club-dashboard.myotherapp.in/events/42/attendees?q=ananya&page=2#x")).toBe("https://club-dashboard.myotherapp.in/events/42/attendees");
    expect(reportUrl("https://user:pw@cdn.example.net/a.js?sig=1")).toBe("https://cdn.example.net/a.js");
    expect(reportUrl("wss://club-dashboard.myotherapp.in/_next/hmr")).toBe("wss://club-dashboard.myotherapp.in/_next/hmr");
  });

  it("names only the kind of page when the address is a credential", () => {
    expect(reportUrl("https://club-dashboard.myotherapp.in/gate/42?key=K-123")).toBe("https://club-dashboard.myotherapp.in/gate/:token");
    expect(reportUrl("https://club-dashboard.myotherapp.in/s/abcDEF123456")).toBe("https://club-dashboard.myotherapp.in/s/:token");
    expect(reportUrl("https://club-dashboard.myotherapp.in/join/9f8e7d6c5b4a")).toBe("https://club-dashboard.myotherapp.in/join/:token");
    expect(reportUrl("https://club-dashboard.myotherapp.in/kiosk?token=abc")).toBe("https://club-dashboard.myotherapp.in/kiosk");
    expect(reportUrl("https://main-portal.myotherapp.in/accept-invite/tok3n")).toBe("https://main-portal.myotherapp.in/accept-invite/:token");
  });

  it("takes token-like segments, emails and phone numbers out of a path", () => {
    expect(reportUrl("https://cdn.example.net/u/ananya@example.com/x.js")).toBe("https://cdn.example.net/u/[email]/x.js");
    expect(reportUrl("https://cdn.example.net/f/aB3dE5fG7hJ9kL1mN3pQ5r/x.js")).toBe("https://cdn.example.net/f/:token/x.js");
    expect(reportUrl("https://cdn.example.net/p/9876543210/x.js")).toBe("https://cdn.example.net/p/[phone]/x.js");
  });

  it("keeps a keyword or a bare scheme, and leaves out anything else", () => {
    expect(["inline", "eval", "data:image/png;base64,AAAA", "blob:https://club-dashboard.myotherapp.in/1-2-3", "chrome-extension://abc/x.js"].map(reportUrl)).toEqual(["inline", "eval", "data", "blob", "chrome-extension"]);
    expect([undefined, null, 3, "", "javascript:alert(1)", "file:///etc/hosts", "not a url"].map(reportUrl)).toEqual(Array(7).fill(undefined));
  });
});

describe("a report", () => {
  it("keeps what was blocked and where, and drops the rest", () => {
    expect(scrubCspReport(report(blocked))).toEqual({
      "csp-report": {
        "document-uri": "https://club-dashboard.myotherapp.in/events/42/attendees",
        referrer: "https://club-dashboard.myotherapp.in/events",
        "blocked-uri": "https://cdn.example.net/widget.js",
        "source-file": "https://club-dashboard.myotherapp.in/_next/static/chunks/app.js",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        "original-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; report-uri /api/csp-report",
        disposition: "report",
        "status-code": 200,
        "line-number": 12,
        "column-number": 7,
      },
    });
  });

  it("is not a report without a page and a directive", () => {
    for (const body of [null, "x", {}, { "csp-report": null }, report({ "effective-directive": "img-src" }), report({ "document-uri": "https://a.example/" }), report({ "document-uri": "javascript:x", "effective-directive": "img-src" })]) {
      expect(scrubCspReport(body)).toBeNull();
    }
  });
});

describe("the report route", () => {
  const ENDPOINT = "https://o42.ingest.sentry.io/api/4507/security/?sentry_key=abc123";
  const post = (body: string, headers: Record<string, string> = {}) =>
    new Request("https://club-dashboard.myotherapp.in/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/csp-report", "user-agent": "Browser/1.0", cookie: "access_token=A; refresh_token=R", ...headers },
      body,
    });

  it("passes the scrubbed report to Sentry with the browser's User-Agent alone, and answers 204", async () => {
    const send = vi.fn(async (..._args: unknown[]) => new Response(null, { status: 200 }));
    const res = await cspReportHandler({ endpoint: ENDPOINT, fetchImpl: send as unknown as typeof fetch })(post(JSON.stringify(report(blocked))));
    expect(res.status).toBe(204);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({ "content-type": "application/csp-report", "user-agent": "Browser/1.0" });
    const sent = JSON.parse(String(init.body));
    expect(sent).toEqual(scrubCspReport(report(blocked)));
    expect(String(init.body)).not.toMatch(/ananya|session=|script-sample|access_token/);
  });

  it("sends nothing with Sentry off, for a body that is no report, or one too big, and still answers 204", async () => {
    const send = vi.fn(async (..._args: unknown[]) => new Response(null, { status: 200 }));
    const fetchImpl = send as unknown as typeof fetch;
    expect((await cspReportHandler({ endpoint: null, fetchImpl })(post(JSON.stringify(report(blocked))))).status).toBe(204);
    expect((await cspReportHandler({ endpoint: ENDPOINT, fetchImpl })(post("not json"))).status).toBe(204);
    expect((await cspReportHandler({ endpoint: ENDPOINT, fetchImpl })(post(JSON.stringify({ hello: 1 })))).status).toBe(204);
    const big = JSON.stringify(report({ ...blocked, "original-policy": "x".repeat(CSP_REPORT_MAX_BYTES) }));
    expect((await cspReportHandler({ endpoint: ENDPOINT, fetchImpl })(post(big))).status).toBe(204);
    expect(send).not.toHaveBeenCalled();
  });

  it("answers 204 when Sentry does not", async () => {
    const send = vi.fn(async () => {
      throw new Error("network down");
    });
    const res = await cspReportHandler({ endpoint: ENDPOINT, fetchImpl: send as unknown as typeof fetch })(post(JSON.stringify(report(blocked))));
    expect(res.status).toBe(204);
  });
});
