import { describe, expect, it } from "vitest";
import { ApiError } from "@moa/api";

import { isTransient } from "@moa/auth/server";

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
