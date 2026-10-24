import { describe, expect, it } from "vitest";

import { FILTERED, maskPII, scrubBreadcrumb, scrubEvent, scrubSpan, scrubText, scrubUrl } from "./scrub";

describe("maskPII", () => {
  it("masks emails, plain and URL-encoded", () => {
    expect(maskPII("sent to asha.k+club@example.co.in today")).toBe("sent to [email] today");
    expect(maskPII("search=asha%40example.com")).toBe("search=[email]");
  });

  it("masks phone numbers in the shapes people type them", () => {
    expect(maskPII("call +91 98765 43210")).toBe("call [phone]");
    expect(maskPII("call 9876543210 now")).toBe("call [phone] now");
    expect(maskPII("(080) 4123-4567 office")).toBe("[phone] office");
  });

  it("leaves dates, short ids, amounts and UUIDs alone", () => {
    expect(maskPII("from 2026-10-24 to 2026-11-01")).toBe("from 2026-10-24 to 2026-11-01");
    expect(maskPII("/api/v1/events/42/attendees?limit=50")).toBe("/api/v1/events/42/attendees?limit=50");
    expect(maskPII("total 1,250.00")).toBe("total 1,250.00");
    expect(maskPII("123e4567-e89b-12d3-a456-426614174000")).toBe("123e4567-e89b-12d3-a456-426614174000");
  });
});

describe("scrubUrl: the links that carry a credential", () => {
  it("filters the door key on a gate link", () => {
    expect(scrubUrl("https://club-dashboard.myotherapp.in/gate/37?key=k-front-8f2a")).toBe(
      `https://club-dashboard.myotherapp.in/gate/37?key=${FILTERED}`,
    );
  });

  it("filters the kiosk, invite and impersonation tokens", () => {
    expect(scrubUrl("/kiosk?token=kiosk_jTCuFSabc123")).toBe(`/kiosk?token=${FILTERED}`);
    expect(scrubUrl("/join?token=abc&next=%2Fevents")).toBe(`/join?token=${FILTERED}&next=%2Fevents`);
    expect(scrubUrl("https://club-dashboard.myotherapp.in/impersonate?token=eyJhbGciOi.x.y")).toBe(
      `https://club-dashboard.myotherapp.in/impersonate?token=${FILTERED}`,
    );
  });

  it("filters a key or token passed in the fragment", () => {
    expect(scrubUrl("/kiosk#token=kiosk_jTCuFS")).toBe(`/kiosk#token=${FILTERED}`);
    expect(scrubUrl("/gate/37#key=abc")).toBe(`/gate/37#key=${FILTERED}`);
    expect(scrubUrl("/events#attendees")).toBe("/events#attendees");
  });

  it("replaces the token segment of a guest check-in and a confirmation link", () => {
    expect(scrubUrl("/s/short1")).toBe("/s/:token");
    expect(scrubUrl("https://club-dashboard.myotherapp.in/confirm/Zx9-abc_DEF")).toBe(
      "https://club-dashboard.myotherapp.in/confirm/:token",
    );
  });

  it("replaces any long opaque segment elsewhere, but keeps names and ids", () => {
    expect(scrubUrl("/api/v1/doors/a8F3kQ9zL2mN7pR4sT6v/link")).toBe("/api/v1/doors/:token/link");
    expect(scrubUrl("/events/42/attendees")).toBe("/events/42/attendees");
    expect(scrubUrl("/events/new")).toBe("/events/new");
  });

  it("filters personal query values and masks an email anywhere else", () => {
    expect(scrubUrl("/followers?email=a%40b.com&page=2")).toBe(`/followers?email=${FILTERED}&page=2`);
    expect(scrubUrl("/followers?search=asha@example.com")).toBe("/followers?search=[email]");
  });
});

describe("scrubText", () => {
  it("filters credentials written as key=value and masks people", () => {
    expect(scrubText("pairing failed for token=kiosk_abc (owner asha@example.com, +91 98765 43210)")).toBe(
      `pairing failed for token=${FILTERED} (owner [email], [phone])`,
    );
  });
});

describe("scrubBreadcrumb", () => {
  it("scrubs a fetch crumb's URL", () => {
    const crumb = scrubBreadcrumb({
      category: "fetch",
      data: { method: "GET", url: "/api/gateway/api/v1/kiosk/self?token=abc", status_code: 200 },
    });
    expect(crumb.data).toEqual({ method: "GET", url: `/api/gateway/api/v1/kiosk/self?token=${FILTERED}`, status_code: 200 });
  });

  it("scrubs both ends of a navigation", () => {
    const crumb = scrubBreadcrumb({ category: "navigation", data: { from: "/login", to: "/impersonate?token=xyz" } });
    expect(crumb.data).toEqual({ from: "/login", to: `/impersonate?token=${FILTERED}` });
  });

  it("masks emails and phones in a console line and its arguments", () => {
    const crumb = scrubBreadcrumb({
      category: "console",
      message: "added volunteer asha@example.com 9876543210",
      data: { arguments: ["added volunteer", { email: "asha@example.com", phone: "+91 98765 43210" }] },
    });
    expect(crumb.message).toBe("added volunteer [email] [phone]");
    expect(crumb.data).toEqual({ arguments: ["added volunteer", { email: "[email]", phone: "[phone]" }] });
  });

  it("drops bodies, cookies and auth wherever they sit", () => {
    const crumb = scrubBreadcrumb({ data: { request_body: "{}", nested: { Authorization: "Bearer x", cookie: "a=b" } } });
    expect(crumb.data).toEqual({ request_body: FILTERED, nested: { Authorization: FILTERED, cookie: FILTERED } });
  });
});

describe("scrubEvent", () => {
  it("keeps no cookies, no body and no Authorization, and a scrubbed URL", () => {
    const event = scrubEvent({
      message: "Upstream failed for asha@example.com",
      request: {
        url: "https://club-dashboard.myotherapp.in/gate/37?key=k-front",
        query_string: "key=k-front&door=2",
        cookies: { access_token: "jwt" },
        data: '{"password":"hunter2"}',
        headers: {
          Authorization: "Bearer jwt",
          Cookie: "access_token=jwt",
          "User-Agent": "Mozilla/5.0",
          "X-Forwarded-For": "203.0.113.9",
          "Content-Type": "application/json",
        },
      },
      user: { id: 7, email: "asha@example.com", ip_address: "203.0.113.9" },
    });
    expect(event.request).toEqual({
      url: `https://club-dashboard.myotherapp.in/gate/37?key=${FILTERED}`,
      query_string: `key=${FILTERED}&door=2`,
      headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/json" },
    });
    expect(event.user).toEqual({ id: 7 });
    expect(event.message).toBe("Upstream failed for [email]");
  });

  it("masks people in exception messages, and scrubs the breadcrumbs and transaction", () => {
    const event = scrubEvent({
      transaction: "/s/abc123",
      exception: { values: [{ type: "Error", value: "No guest with phone 9876543210" }] },
      breadcrumbs: [{ category: "navigation", data: { from: "/kiosk?token=t", to: "/" } }],
    });
    expect(event.transaction).toBe("/s/:token");
    expect(event.exception?.values?.[0]).toEqual({ type: "Error", value: "No guest with phone [phone]" });
    expect(event.breadcrumbs?.[0]?.data).toEqual({ from: `/kiosk?token=${FILTERED}`, to: "/" });
  });

  it("drops a user with nothing but personal fields", () => {
    expect(scrubEvent({ user: { email: "asha@example.com" } }).user).toBeUndefined();
  });
});

describe("scrubSpan", () => {
  it("scrubs the description and URL-shaped attributes", () => {
    const span = scrubSpan({
      description: "GET /api/gateway/api/v1/kiosk/self?token=abc",
      data: { "http.url": "https://club-dashboard.myotherapp.in/join?token=abc", "http.method": "GET", "http.status_code": 200 },
    });
    expect(span.description).toBe(`GET /api/gateway/api/v1/kiosk/self?token=${FILTERED}`);
    expect(span.data).toEqual({
      "http.url": `https://club-dashboard.myotherapp.in/join?token=${FILTERED}`,
      "http.method": "GET",
      "http.status_code": 200,
    });
  });
});
