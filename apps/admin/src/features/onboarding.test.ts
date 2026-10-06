import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Creating a club and issuing its password.
 *
 * Both endpoints existed with no UI, and they are one job rather than two:
 * `create_club` generates a random password and deliberately does not return
 * it, so a club created here cannot sign in until someone sets one. These
 * cover the payloads, which is where a wrong field name fails silently --
 * the API would 422 and the admin would see "could not create".
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async () => ({ items: [], total: 0 })),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        return { id: 9, name: "Chess Club", email: "chess@example.com" };
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { createClub } = await import("./clubs/api");
const { resetUserPassword } = await import("./users/api");

beforeEach(() => {
  calls.length = 0;
});

describe("creating a club", () => {
  it("sends name and email, trimmed", async () => {
    await createClub({ name: "  Chess Club  ", email: "  chess@example.com " });
    expect(calls[0]!.path).toContain("/clubs/admin/create");
    expect(calls[0]!.body).toEqual({
      name: "Chess Club",
      email: "chess@example.com",
    });
  });

  it("returns the created club so the password step can address it", async () => {
    // Without the email coming back, the dialog that follows has nothing to
    // identify the account by.
    const club = await createClub({ name: "Chess Club", email: "chess@example.com" });
    expect(club.email).toBe("chess@example.com");
  });
});

describe("setting a password", () => {
  it("uses the field names the endpoint actually declares", async () => {
    // email_or_username, not identifier: the guard rejects on role before the
    // body is validated, so a wrong name here passes a role test and fails
    // only in production.
    await resetUserPassword({
      emailOrUsername: "chess@example.com",
      newPassword: "A-Strong-One",
    });
    expect(calls[0]!.path).toContain("/auth/admin/reset-password");
    expect(calls[0]!.body).toEqual({
      email_or_username: "chess@example.com",
      new_password: "A-Strong-One",
    });
  });

  it("does not trim the password, only the identifier", async () => {
    // A trailing space in a generated password is still part of it.
    await resetUserPassword({
      emailOrUsername: "  someone  ",
      newPassword: " spaced ",
    });
    expect(calls[0]!.body).toEqual({
      email_or_username: "someone",
      new_password: " spaced ",
    });
  });
});
