import { describe, expect, it } from "vitest";
import { clubDashboardSchema } from "@moa/app-kit";

import { clubSelfSchema } from "@/features/club";
import { clubOverviewSchema } from "@/features/club/overview-schemas";
import { followerPageSchema } from "@/features/followers";

import dashboard from "./dashboard.json";
import followers from "./followers.json";
import info from "./info.json";
import overview from "./overview.json";

describe("real API responses parse with the web schemas", () => {
  it("overview", () => {
    const r = clubOverviewSchema.safeParse(overview);
    expect(r.success ? "ok" : JSON.stringify(r.error.issues, null, 1)).toBe("ok");
  });
  it("dashboard", () => {
    const r = clubDashboardSchema.safeParse(dashboard);
    expect(r.success ? "ok" : JSON.stringify(r.error.issues, null, 1)).toBe("ok");
  });
  it("followers", () => {
    const r = followerPageSchema.safeParse(followers);
    expect(r.success ? "ok" : JSON.stringify(r.error.issues, null, 1)).toBe("ok");
  });
  it("info", () => {
    const r = clubSelfSchema.safeParse(info);
    expect(r.success ? "ok" : JSON.stringify(r.error.issues, null, 1)).toBe("ok");
  });
});
