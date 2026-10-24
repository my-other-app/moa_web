import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";

import { shownPicture, stubImageLoading } from "@/test/images";

/**
 * Who did what, with their face: GET /admin/audit-log now carries the
 * actor's picture (`actor.avatar`, resolved by the API), where the log could
 * only ever draw initials before.
 */
const photo = { thumbnail: "https://cdn.test/users/profile_pic/owner.thumbnail.png", original: "https://cdn.test/users/profile_pic/owner.png" };

const page = {
  limit: 20,
  offset: 0,
  total: 3,
  next: null,
  items: [
    { id: 3, action: "club.approve", summary: "Approved club “Robotics”", created_at: "2026-10-20T10:00:00Z", actor: { id: 1, full_name: "Platform Owner", email: "owner@example.com", avatar: photo } },
    { id: 2, action: "user.suspend", summary: "Suspended a@b.c", created_at: "2026-10-19T10:00:00Z", actor: { id: 2, full_name: "Support Desk", email: "support@example.com", avatar: null } },
    // From an API before the field: no `avatar` at all.
    { id: 1, action: "badge.award", summary: "Awarded Regular", created_at: "2026-10-18T10:00:00Z", actor: { id: 3, full_name: "Old Entry", email: "old@example.com" } },
  ],
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/admin/audit-log") return page;
        if (path === "/api/v1/admin/audit-log/actions") return ["badge.award", "club.approve", "user.suspend"];
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { AuditLogTable, auditEntrySchema } = await import("./index");

beforeEach(() => stubImageLoading());
afterEach(() => vi.unstubAllGlobals());

describe("the audit log's actors", () => {
  it("keeps the actor's picture, and reads a malformed one as none", () => {
    expect(auditEntrySchema.parse(page.items[0]).actor?.avatar?.thumbnail).toBe(photo.thumbnail);
    expect(auditEntrySchema.parse({ ...page.items[0], actor: { ...page.items[0]!.actor, avatar: 7 } }).actor?.avatar).toBeNull();
  });

  it("shows each actor's picture, and initials for one without", async () => {
    render(<AuditLogTable />);
    const rowOf = async (name: string) => (await screen.findByText(name)).closest("tr")!;

    await waitFor(async () => expect(shownPicture(await rowOf("Platform Owner"))).toBe(photo.thumbnail));
    const support = await rowOf("Support Desk");
    expect(shownPicture(support)).toBeNull();
    expect(within(support).getByText("SD")).toBeInTheDocument();
    expect(within(await rowOf("Old Entry")).getByText("OE")).toBeInTheDocument();
  });
});
