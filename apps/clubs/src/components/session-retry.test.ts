import { describe, expect, it } from "vitest";
import { ApiError } from "@moa/api";

import { isTransient, sessionRefusal } from "@moa/auth/server";

const api = (status: number) => new ApiError({ status, message: "x", errorCode: null, trackId: null, fieldErrors: null } as ConstructorParameters<typeof ApiError>[0]);

describe("the sign-in check asks again only when it is worth it", () => {
  it("retries a gateway's try-again and a dropped connection", () => {
    expect(isTransient(api(502))).toBe(true);
    expect(isTransient(api(503))).toBe(true);
    expect(isTransient(api(504))).toBe(true);
    expect(isTransient(new TypeError("fetch failed"))).toBe(true);
  });

  it("does not retry a real answer", () => {
    for (const status of [400, 401, 403, 404, 422, 500]) expect(isTransient(api(status))).toBe(false);
    expect(isTransient(new Error("boom"))).toBe(false);
  });
});

describe("why there is no session", () => {
  const refused = (status: number, errorCode: string | null) => new ApiError({ status, message: "x", errorCode });

  it("keeps the code of a refusal, so a club awaiting approval is not taken for signed out", () => {
    expect(sessionRefusal(refused(403, "CLUB_NOT_VERIFIED"))).toBe("CLUB_NOT_VERIFIED");
    expect(sessionRefusal(refused(403, "ACCOUNT_SUSPENDED"))).toBe("ACCOUNT_SUSPENDED");
  });

  it("reads today's 401 for an unapproved club, and any plain 401, as no session with no reason", () => {
    expect(sessionRefusal(refused(401, null))).toBeNull();
  });

  it("is not a refusal when the API failed", () => {
    expect(sessionRefusal(refused(502, null))).toBeUndefined();
    expect(sessionRefusal(new TypeError("fetch failed"))).toBeUndefined();
  });
});
