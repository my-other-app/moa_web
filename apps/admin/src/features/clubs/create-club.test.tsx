import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import clubsFixture from "../__fixtures__/clubs.json";

/**
 * Create a club from the Clubs screen, in the two steps it takes: the name
 * and login email, then a password the club can actually sign in with. The
 * service creates the account with a random password it never returns, so
 * walking away after step one leaves a club nobody can open -- the wizard
 * says so rather than letting it happen quietly.
 *
 * onboarding.test.ts covers the two payloads; these cover the screens.
 */
const writes: Array<{ path: string; body: unknown }> = [];
let refuseCreate: string | null = null;
let refusePassword: string | null = null;

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({
      data: { id: 1, username: "platform_admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: "owner" },
    }),
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/clubs/admin/list")) return clubsFixture;
        if (path.includes("/orgs/list")) return [];
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        writes.push({ path, body });
        if (path === "/api/v1/clubs/admin/create") {
          if (refuseCreate) throw new Error(refuseCreate);
          return { id: 91, name: "Chess Club", slug: "chess-club", is_verified: true, created_at: "2026-10-25T09:00:00Z" };
        }
        if (path === "/api/v1/auth/admin/reset-password") {
          if (refusePassword) throw new Error(refusePassword);
          return { message: "Password reset" };
        }
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubsV2 } = await import("./components/clubs-v2");
const { PASSWORD_LENGTH } = await import("@/features/users/password");
const { toast } = await import("@moa/ui");

const success = vi.spyOn(toast, "success");
const failure = vi.spyOn(toast, "error");
const writeText = vi.fn(async (_text: string) => {});

const openWizard = async () => {
  render(<ClubsV2 />);
  fireEvent.click(await screen.findByRole("button", { name: /Create club/ }));
  return screen.findByRole("dialog");
};
const fillStepOne = (name: string, email: string) => {
  fireEvent.change(screen.getByLabelText("Club name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Login email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Create and continue" }));
};
const toStepTwo = async () => {
  await openWizard();
  fillStepOne("  Chess Club ", " chess@example.com ");
  await screen.findByRole("heading", { name: "Set the club’s password" });
  return screen.getByText((_, el) => el?.tagName === "CODE").textContent!;
};

beforeEach(() => {
  writes.length = 0;
  refuseCreate = null;
  refusePassword = null;
  success.mockClear();
  failure.mockClear();
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("step one: the club's name and login email", () => {
  it("opens from Create club on step one of two, empty", async () => {
    const dialog = await openWizard();
    expect(within(dialog).getByText("Step 1 of 2")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Create a club" })).toBeInTheDocument();
    expect(screen.getByLabelText("Club name")).toHaveValue("");
    expect(screen.getByLabelText("Login email")).toHaveValue("");
  });

  it("will not create a club with a name under three characters, and sends nothing", async () => {
    await openWizard();
    fillStepOne("CC", "chess@example.com");
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the club name — at least 3 characters.");
    expect(writes).toHaveLength(0);
  });

  it("will not create a club without a valid email, and sends nothing", async () => {
    await openWizard();
    fillStepOne("Chess Club", "chess@example");
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email.");
    expect(writes).toHaveLength(0);
  });

  it("creates the club with the name and email trimmed, then asks for its password", async () => {
    await openWizard();
    fillStepOne("  Chess Club ", " chess@example.com ");
    expect(await screen.findByRole("heading", { name: "Set the club’s password" })).toBeInTheDocument();
    expect(writes).toEqual([{ path: "/api/v1/clubs/admin/create", body: { name: "Chess Club", email: "chess@example.com" } }]);
    expect(success).toHaveBeenCalledWith("Club created");
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByText(/Chess Club is created but cannot sign in yet/)).toBeInTheDocument();
  });

  it("stays on step one with the server's words when the club is refused", async () => {
    refuseCreate = "Club with this name already exists";
    await openWizard();
    fillStepOne("Chess Club", "chess@example.com");
    expect(await screen.findByRole("alert")).toHaveTextContent("Club with this name already exists");
    expect(screen.getByRole("heading", { name: "Create a club" })).toBeInTheDocument();
    expect(screen.getByLabelText("Club name")).toHaveValue("Chess Club");
    expect(writes.filter((w) => w.path.includes("reset-password"))).toHaveLength(0);
  });

  it("closes on Cancel without creating anything", async () => {
    await openWizard();
    fireEvent.change(screen.getByLabelText("Club name"), { target: { value: "Chess Club" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(writes).toHaveLength(0);
  });

  it("comes back empty after being closed half-filled", async () => {
    await openWizard();
    fireEvent.change(screen.getByLabelText("Club name"), { target: { value: "Chess Club" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Create club/ }));
    expect(await screen.findByLabelText("Club name")).toHaveValue("");
  });
});

describe("step two: the club's password", () => {
  it("offers a strong generated password, and another on request", async () => {
    const first = await toStepTwo();
    expect(first).toHaveLength(PASSWORD_LENGTH);
    fireEvent.click(screen.getByRole("button", { name: "Generate another password" }));
    const second = screen.getByText((_, el) => el?.tagName === "CODE").textContent!;
    expect(second).toHaveLength(PASSWORD_LENGTH);
    expect(second).not.toBe(first);
  });

  it("copies the password shown", async () => {
    const shown = await toStepTwo();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(shown);
  });

  it("sets the password shown on the new club, by its id, then closes and says it can sign in", async () => {
    const shown = await toStepTwo();
    fireEvent.click(screen.getByRole("button", { name: "Set password and finish" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    /*
     * By the club's id (91), not its login email: an email is unique only per
     * account type, so a committee that uses the same address for the app has
     * two accounts behind it, and a reset by that email cannot tell them apart.
     */
    expect(writes.at(-1)).toEqual({
      path: "/api/v1/auth/admin/reset-password",
      body: { email_or_username: "91", new_password: shown },
    });
    expect(success).toHaveBeenCalledWith("Chess Club can sign in now");
  });

  it("stays on step two with the server's words when the password is refused", async () => {
    refusePassword = "User or club '91' not found";
    const shown = await toStepTwo();
    fireEvent.click(screen.getByRole("button", { name: "Set password and finish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("User or club '91' not found");
    expect(screen.getByRole("heading", { name: "Set the club’s password" })).toBeInTheDocument();
    // The same password is still there to try again, not a new one.
    expect(screen.getByText((_, el) => el?.tagName === "CODE")).toHaveTextContent(shown);
    expect(success).not.toHaveBeenCalledWith("Chess Club can sign in now");
  });

  it("asks before leaving a club nobody can sign in to, and goes back on Cancel", async () => {
    await toStepTwo();
    fireEvent.click(screen.getByRole("button", { name: "Finish later" }));
    expect(await screen.findByText("Leave without a password?")).toBeInTheDocument();
    expect(screen.getByText(/Chess Club exists but nobody can sign in to it/)).toBeInTheDocument();
    expect(screen.getByText(/You can set one later from the club’s entry on the Users screen/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Leave without a password?")).toBeNull());
    expect(screen.getByRole("heading", { name: "Set the club’s password" })).toBeInTheDocument();
  });

  it("leaves it unusable only when the admin says so, setting no password", async () => {
    await toStepTwo();
    fireEvent.click(screen.getByRole("button", { name: "Finish later" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave it unusable" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(writes.filter((w) => w.path.includes("reset-password"))).toHaveLength(0);
  });
});
