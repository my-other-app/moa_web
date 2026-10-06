import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { can, roleOf } from "@moa/auth";

/**
 * Role gating in the UI.
 *
 * The server enforces every capability, so none of this is a security
 * boundary -- it decides what gets *offered*. Two things are worth pinning:
 * the unset-role default, because getting it backwards locks every existing
 * admin out of their own panel on deploy; and that a viewer is not shown
 * controls that would 403, since the role's own description promises they
 * change nothing.
 */
describe("role resolution", () => {
  it("treats an unset role as owner, matching the backend", () => {
    // Accounts predating roles have none. Defaulting to "no capabilities"
    // would sign every existing admin out of their own tools.
    expect(roleOf({ admin_role: null })).toBe("owner");
    expect(roleOf({ admin_role: undefined })).toBe("owner");
  });

  it("gives an unrecognised role the least privilege, not the most", () => {
    // This can only come from a backend newer than this build, so it is the
    // one case where guessing high would be unsafe.
    expect(roleOf({ admin_role: "superuser" })).toBe("viewer");
  });

  it("reports no role for a signed-out user", () => {
    expect(roleOf(null)).toBeNull();
    expect(can(null, "view")).toBe(false);
  });
});

describe("capabilities per role", () => {
  const viewer = { admin_role: "viewer" };
  const support = { admin_role: "support" };
  const owner = { admin_role: "owner" };

  it("lets a viewer read and nothing else", () => {
    expect(can(viewer, "view")).toBe(true);
    for (const c of ["moderate", "destroy", "manage_money", "manage_content"] as const) {
      expect(can(viewer, c)).toBe(false);
    }
  });

  it("lets support moderate but not delete, bill or reshape the catalogue", () => {
    expect(can(support, "moderate")).toBe(true);
    expect(can(support, "destroy")).toBe(false);
    expect(can(support, "manage_money")).toBe(false);
    expect(can(support, "manage_content")).toBe(false);
    expect(can(support, "reset_credentials")).toBe(false);
  });

  it("lets an owner do everything", () => {
    for (const c of [
      "view", "moderate", "destroy", "manage_money",
      "impersonate", "manage_admins", "manage_content", "reset_credentials",
    ] as const) {
      expect(can(owner, c)).toBe(true);
    }
  });
});

let role: string | null = "viewer";

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "a", email: "a@b.c", full_name: "A", user_type: "admin", admin_role: role } }),
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  };
});

const { render } = await import("@/test/render");
const { SuspendButton } = await import("./users/components/suspend-button");

describe("controls a role cannot use are not shown", () => {
  it("hides suspend from a viewer", () => {
    role = "viewer";
    render(<SuspendButton userId={1} name="Someone" isActive={true} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows suspend to support, whose job it is", () => {
    role = "support";
    render(<SuspendButton userId={1} name="Someone" isActive={true} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
