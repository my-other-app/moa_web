import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "@moa/ui";

import detailFixture from "../__fixtures__/user-detail.json";

/**
 * The account actions an admin takes on a person: open a session as them,
 * delete them, suspend or reinstate them, correct their details, set their
 * password, and make them an admin.
 *
 * The request payloads are pinned in critical-surfaces.test.ts. These drive
 * the screens the way an admin does -- the confirmation that stands between
 * the click and the request, what is sent once it is passed, and what the
 * screen says afterwards, when it worked and when the server said no. Both
 * surfaces are covered: the drawer on the users list and the controls on a
 * user's own page.
 */

type Call = { method: string; path: string; body?: unknown };
const calls: Call[] = [];
const writes = () => calls.filter((c) => c.method !== "GET");

let role: string | null = "owner";
let detail: Record<string, unknown> = detailFixture;
/** When set, every write is refused with this error. */
let refuse: Error | null = null;
let impersonationToken = "tok/en+1";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/users",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const write = (method: string) =>
    vi.fn(async (path: string, body?: unknown) => {
      calls.push({ method, path, body });
      if (refuse) throw refuse;
      if (path.includes("/impersonate/")) return { token: impersonationToken };
      return undefined;
    });
  return {
    ...actual,
    useSession: () => ({
      data: { id: 1, username: "me", email: "me@example.com", full_name: "Me", user_type: "admin", admin_role: role },
    }),
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (/\/user\/admin\/\d+\/(clubs|events)$/.test(path)) {
          return { items: [], total: 0, limit: 5, offset: 0, next: null };
        }
        if (/\/user\/admin\/\d+$/.test(path)) return detail;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: write("POST"),
      put: write("PUT"),
      del: write("DELETE"),
    },
  };
});

const { render } = await import("@/test/render");
const { UserDrawer } = await import("./components/user-drawer");
const { UserAdminControls } = await import("./components/user-admin-controls");
const { SuspendButton } = await import("./components/suspend-button");
const { ImpersonateButton } = await import("./components/impersonate-button");
const { adminUserDetailSchema, adminUserSchema } = await import("./schemas");

let success: MockInstance<typeof toast.success>;
let failure: MockInstance<typeof toast.error>;

beforeEach(() => {
  calls.length = 0;
  role = "owner";
  detail = { ...detailFixture, is_active: true, admin_role: null };
  refuse = null;
  impersonationToken = "tok/en+1";
  nav.replace.mockClear();
  success = vi.spyOn(toast, "success");
  failure = vi.spyOn(toast, "error");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const asDetail = (over: Record<string, unknown> = {}) =>
  adminUserDetailSchema.parse({ ...detailFixture, is_active: true, admin_role: null, ...over });

/** The drawer as the users list opens it, already pointed at one row. */
function openDrawer(over: Record<string, unknown> = {}) {
  detail = { ...detail, ...over };
  const row = adminUserSchema.parse(detail);
  const onClose = vi.fn();
  render(<UserDrawer row={row} open onClose={onClose} />);
  return { onClose };
}

/** The confirmation on top of the drawer: the last dialog opened. */
const topDialog = async () => {
  await waitFor(() => expect(screen.getAllByRole("dialog").length).toBeGreaterThan(0));
  const all = screen.getAllByRole("dialog");
  return all[all.length - 1]!;
};

describe("open a session as a user (impersonate)", () => {
  const club = () => render(<ImpersonateButton userId={77} name="Robotics Club" userType="club" />);

  it("is offered to an owner, on a club account only", () => {
    const { unmount } = render(<ImpersonateButton userId={1} name="Ann" userType="app_user" />);
    expect(screen.queryByRole("button", { name: /view as/i })).toBeNull();
    unmount();
    render(<ImpersonateButton userId={2} name="Root" userType="admin" />);
    expect(screen.queryByRole("button", { name: /view as/i })).toBeNull();
  });

  it("is not offered to support or a viewer, whose role cannot impersonate", () => {
    for (const r of ["support", "viewer"]) {
      role = r;
      const { unmount } = club();
      expect(screen.queryByRole("button", { name: /view as/i })).toBeNull();
      unmount();
    }
  });

  it("asks first, says it is logged against the admin, and cancelling sends nothing", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    club();
    fireEvent.click(screen.getByRole("button", { name: /view as/i }));

    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Open a session as Robotics Club?")).toBeInTheDocument();
    expect(within(confirm).getByText(/recorded in the activity log against your name/i)).toBeInTheDocument();
    expect(within(confirm).getByLabelText(/reason/i)).toBeInTheDocument();

    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(writes()).toEqual([]);
    expect(open).not.toHaveBeenCalled();
  });

  it("sends the reason, then hands off to the club dashboard in a new tab with a two-minute token", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    club();
    fireEvent.click(screen.getByRole("button", { name: /view as/i }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.change(within(confirm).getByLabelText(/reason/i), {
      target: { value: "  ticket #42: cannot publish  " },
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Open session" }));

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(writes()).toEqual([
      { method: "POST", path: "/api/v1/auth/admin/impersonate/77", body: { reason: "ticket #42: cannot publish" } },
    ]);
    // A navigation, not a fetch: the cookies are set on the clubs app's own
    // origin. The token is encoded, so a `+` or `/` survives the query string.
    expect(open).toHaveBeenCalledWith(
      "https://club-dashboard.myotherapp.in/impersonate?token=tok%2Fen%2B1",
      "_blank",
      "noopener,noreferrer"
    );
    expect(success).toHaveBeenCalledWith("Opened a session as Robotics Club. This is in the activity log.");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  /*
   * A reason is required at both ends: the API answers 422 REASON_REQUIRED
   * below ten characters, counted with spaces at the ends dropped and spaces
   * in a row once. The dialog counts the same way, so the button it enables
   * is one the API accepts.
   */
  it("requires a reason of ten characters before a session can be opened", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    club();
    fireEvent.click(screen.getByRole("button", { name: /view as/i }));
    const confirm = await screen.findByRole("alertdialog");
    const reason = within(confirm).getByLabelText(/reason/i);
    const button = within(confirm).getByRole("button", { name: "Open session" });

    expect(reason).toBeRequired();
    expect(within(confirm).getByText(/at least 10 characters/i)).toBeInTheDocument();
    expect(within(confirm).queryByText(/optional/i)).toBeNull();
    // Nothing yet, too short, padded to look long, or spread out with spaces.
    expect(button).toBeDisabled();
    for (const value of ["test", "     short      ", "a  b  c  d  e"]) {
      fireEvent.change(reason, { target: { value } });
      expect(button).toBeDisabled();
      expect(reason).toHaveAttribute("aria-invalid", "true");
    }
    fireEvent.click(button);
    expect(writes()).toEqual([]);
    expect(open).not.toHaveBeenCalled();

    fireEvent.change(reason, { target: { value: "ticket 451" } });
    expect(button).toBeEnabled();
    expect(reason).not.toHaveAttribute("aria-invalid");
  });

  it("sends the reason as the API counts it: spaces at the ends dropped, runs of them as one", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    club();
    fireEvent.click(screen.getByRole("button", { name: /view as/i }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.change(within(confirm).getByLabelText(/reason/i), { target: { value: "  ticket   4512:\tcannot   publish  " } });
    fireEvent.click(within(confirm).getByRole("button", { name: "Open session" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]!.body).toEqual({ reason: "ticket 4512: cannot publish" });
  });

  it("says what the API said when it wants a reason, and keeps the dialog for it", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    refuse = new Error("Say why you need a session as this account: at least 10 characters. It is kept in the activity log.");
    club();
    fireEvent.click(screen.getByRole("button", { name: /view as/i }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.change(within(confirm).getByLabelText(/reason/i), { target: { value: "looking into a report" } });
    fireEvent.click(within(confirm).getByRole("button", { name: "Open session" }));
    await waitFor(() => expect(failure).toHaveBeenCalledWith(expect.stringMatching(/at least 10 characters/)));
    expect(open).not.toHaveBeenCalled();
    expect(within(screen.getByRole("alertdialog")).getByLabelText(/reason/i)).toHaveValue("looking into a report");
  });

  it("says why when the server refuses, opens nothing and keeps the dialog", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    refuse = new Error("Admins cannot be impersonated");
    club();
    fireEvent.click(screen.getByRole("button", { name: /view as/i }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.change(within(confirm).getByLabelText(/reason/i), { target: { value: "checking a reported problem" } });
    fireEvent.click(within(confirm).getByRole("button", { name: "Open session" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("Admins cannot be impersonated"));
    expect(open).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Open session" })).toBeEnabled();
  });

  it("is reachable from the users drawer for a club account", async () => {
    openDrawer({ user_type: "club" });
    expect(await screen.findByRole("button", { name: /view as/i })).toBeInTheDocument();
  });
});

describe("delete a user", () => {
  describe("from the users drawer", () => {
    it("is offered only to a role that manages admins", async () => {
      role = "support";
      openDrawer();
      await screen.findByText("Test Person");
      expect(screen.queryByRole("button", { name: "Delete user" })).toBeNull();
    });

    it("confirms with what it removes and that it cannot be undone; cancelling sends nothing", async () => {
      openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Delete user" }));
      const confirm = await topDialog();
      expect(within(confirm).getByText("Delete Test Person?")).toBeInTheDocument();
      expect(within(confirm).getByText(/cannot be undone/i)).toBeInTheDocument();

      fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByText("Delete Test Person?")).toBeNull());
      expect(writes()).toEqual([]);
    });

    it("deletes by id, says so and closes the drawer", async () => {
      const { onClose } = openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Delete user" }));
      const confirm = await topDialog();
      fireEvent.click(within(confirm).getByRole("button", { name: "Delete user" }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(writes()).toEqual([{ method: "DELETE", path: "/api/v1/user/admin/412", body: undefined }]);
      expect(success).toHaveBeenCalledWith("Account deleted");
    });

    it("keeps the dialog and the drawer when the server refuses, and says why", async () => {
      refuse = new Error("Cannot delete the last owner");
      const { onClose } = openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Delete user" }));
      const confirm = await topDialog();
      fireEvent.click(within(confirm).getByRole("button", { name: "Delete user" }));

      await waitFor(() => expect(failure).toHaveBeenCalledWith("Cannot delete the last owner"));
      expect(onClose).not.toHaveBeenCalled();
      expect(success).not.toHaveBeenCalled();
      expect(screen.getByText("Delete Test Person?")).toBeInTheDocument();
    });
  });

  describe("from the user's page", () => {
    it("confirms, deletes, and goes back to the list", async () => {
      render(<UserAdminControls user={asDetail()} />);
      fireEvent.click(screen.getByRole("button", { name: /delete/i }));
      const confirm = await screen.findByRole("alertdialog");
      expect(within(confirm).getByText("Delete Test Person?")).toBeInTheDocument();
      expect(within(confirm).getByText(/suspending is the reversible option/i)).toBeInTheDocument();

      fireEvent.click(within(confirm).getByRole("button", { name: "Delete account" }));
      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/users"));
      expect(writes()).toEqual([{ method: "DELETE", path: "/api/v1/user/admin/412", body: undefined }]);
      expect(success).toHaveBeenCalledWith("Account deleted");
    });

    it("stays on the page when the server refuses", async () => {
      refuse = new Error("Not allowed");
      render(<UserAdminControls user={asDetail()} />);
      fireEvent.click(screen.getByRole("button", { name: /delete/i }));
      const confirm = await screen.findByRole("alertdialog");
      fireEvent.click(within(confirm).getByRole("button", { name: "Delete account" }));

      await waitFor(() => expect(failure).toHaveBeenCalledWith("Not allowed"));
      expect(nav.replace).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    it("cancelling sends nothing", async () => {
      render(<UserAdminControls user={asDetail()} />);
      fireEvent.click(screen.getByRole("button", { name: /delete/i }));
      const confirm = await screen.findByRole("alertdialog");
      fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(writes()).toEqual([]);
    });
  });
});

describe("suspend or reinstate a user", () => {
  describe("from the users drawer", () => {
    it("will not suspend without a reason on the record", async () => {
      openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Suspend" }));
      const confirm = await topDialog();
      expect(within(confirm).getByText("Suspend Test Person?")).toBeInTheDocument();
      expect(within(confirm).getByText(/reversible/i)).toBeInTheDocument();

      fireEvent.click(within(confirm).getByRole("button", { name: "Suspend" }));
      expect(await within(confirm).findByRole("alert")).toHaveTextContent("Add a reason — it goes on the record.");
      expect(writes()).toEqual([]);
    });

    it("suspends with the reason given and says so", async () => {
      openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Suspend" }));
      const confirm = await topDialog();
      fireEvent.change(within(confirm).getByRole("textbox"), { target: { value: "spam reports" } });
      fireEvent.click(within(confirm).getByRole("button", { name: "Suspend" }));

      await waitFor(() => expect(success).toHaveBeenCalledWith("Account suspended"));
      expect(writes()).toEqual([
        { method: "PUT", path: "/api/v1/user/admin/412/active", body: { is_active: false, reason: "spam reports" } },
      ]);
      await waitFor(() => expect(screen.queryByText("Suspend Test Person?")).toBeNull());
    });

    it("keeps the dialog open when the server refuses", async () => {
      refuse = new Error("User not found");
      openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Suspend" }));
      const confirm = await topDialog();
      fireEvent.change(within(confirm).getByRole("textbox"), { target: { value: "spam" } });
      fireEvent.click(within(confirm).getByRole("button", { name: "Suspend" }));

      await waitFor(() => expect(failure).toHaveBeenCalledWith("User not found"));
      expect(success).not.toHaveBeenCalled();
      expect(screen.getByText("Suspend Test Person?")).toBeInTheDocument();
    });

    it("reinstates a suspended account straight away", async () => {
      openDrawer({ is_active: false, suspended_reason: "spam" });
      expect(await screen.findByText("Suspended: spam")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Reinstate" }));

      await waitFor(() => expect(success).toHaveBeenCalledWith("Account reinstated"));
      expect(writes()).toEqual([
        { method: "PUT", path: "/api/v1/user/admin/412/active", body: { is_active: true, reason: null } },
      ]);
    });
  });

  describe("from the user's page", () => {
    it("says what suspension does, and cancelling sends nothing", async () => {
      render(<SuspendButton userId={412} name="Test Person" isActive />);
      fireEvent.click(screen.getByRole("button", { name: /suspend/i }));
      const confirm = await screen.findByRole("alertdialog");
      expect(within(confirm).getByText("Suspend Test Person?")).toBeInTheDocument();
      expect(within(confirm).getByText(/signed out everywhere immediately/i)).toBeInTheDocument();

      fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(writes()).toEqual([]);
    });

    it("suspends with the reason and closes", async () => {
      render(<SuspendButton userId={412} name="Test Person" isActive />);
      fireEvent.click(screen.getByRole("button", { name: /suspend/i }));
      const confirm = await screen.findByRole("alertdialog");
      fireEvent.change(within(confirm).getByLabelText(/reason/i), { target: { value: "harassment" } });
      fireEvent.click(within(confirm).getByRole("button", { name: "Suspend account" }));

      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(writes()).toEqual([
        { method: "PUT", path: "/api/v1/user/admin/412/active", body: { is_active: false, reason: "harassment" } },
      ]);
      expect(success).toHaveBeenCalledWith("Account suspended");
    });

    it("keeps the dialog and the typed reason when the server refuses", async () => {
      refuse = new Error("Try again later");
      render(<SuspendButton userId={412} name="Test Person" isActive />);
      fireEvent.click(screen.getByRole("button", { name: /suspend/i }));
      const confirm = await screen.findByRole("alertdialog");
      fireEvent.change(within(confirm).getByLabelText(/reason/i), { target: { value: "harassment" } });
      fireEvent.click(within(confirm).getByRole("button", { name: "Suspend account" }));

      await waitFor(() => expect(failure).toHaveBeenCalledWith("Try again later"));
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(within(screen.getByRole("alertdialog")).getByLabelText(/reason/i)).toHaveValue("harassment");
    });

    it("reinstates a suspended account after asking", async () => {
      render(<SuspendButton userId={412} name="Test Person" isActive={false} />);
      fireEvent.click(screen.getByRole("button", { name: /reinstate/i }));
      const confirm = await screen.findByRole("alertdialog");
      expect(within(confirm).getByText("Reinstate Test Person?")).toBeInTheDocument();
      fireEvent.click(within(confirm).getByRole("button", { name: "Reinstate account" }));

      await waitFor(() => expect(success).toHaveBeenCalledWith("Account reinstated"));
      expect(writes()).toEqual([
        { method: "PUT", path: "/api/v1/user/admin/412/active", body: { is_active: true, reason: null } },
      ]);
    });
  });
});

describe("edit a person's details", () => {
  describe("from the users drawer", () => {
    it("starts from the current details and shows the username as fixed", async () => {
      openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
      expect(screen.getByLabelText("Name")).toHaveValue("Test Person");
      expect(screen.getByLabelText("Email")).toHaveValue("testperson@example.com");
      expect(screen.getByLabelText("Phone")).toHaveValue("9000000412");
      expect(screen.getByText(/@testperson · fixed/)).toBeInTheDocument();
    });

    it("saves name, email and phone, never the username, and closes the form", async () => {
      openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test P. Person" } });
      fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(success).toHaveBeenCalledWith("Account updated"));
      expect(writes()).toEqual([
        {
          method: "PUT",
          path: "/api/v1/user/admin/412",
          body: { full_name: "Test P. Person", email: "testperson@example.com", phone: "" },
        },
      ]);
      await waitFor(() => expect(screen.queryByLabelText("Name")).toBeNull());
    });

    it("refuses an invalid email before sending anything", async () => {
      openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(failure).toHaveBeenCalledWith("Enter a valid email"));
      expect(writes()).toEqual([]);
      expect(screen.getByLabelText("Email")).toHaveValue("not-an-email");
    });

    it("keeps the form and what was typed when the server refuses", async () => {
      refuse = new Error("Email already in use");
      openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: "taken@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(failure).toHaveBeenCalledWith("Email already in use"));
      expect(success).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Email")).toHaveValue("taken@example.com");
    });

    it("cancelling closes the form without sending", async () => {
      openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByLabelText("Name")).toBeNull();
      expect(writes()).toEqual([]);
    });
  });

  describe("from the user's page", () => {
    it("will not save a name shorter than two characters", async () => {
      render(<UserAdminControls user={asDetail()} />);
      fireEvent.click(screen.getByRole("button", { name: /edit/i }));
      const form = await screen.findByRole("dialog");
      expect(within(form).getByText(/the username is fixed/i)).toBeInTheDocument();
      fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "T" } });
      expect(within(form).getByRole("button", { name: "Save changes" })).toBeDisabled();
    });

    it("saves and closes", async () => {
      render(<UserAdminControls user={asDetail()} />);
      fireEvent.click(screen.getByRole("button", { name: /edit/i }));
      const form = await screen.findByRole("dialog");
      fireEvent.change(within(form).getByLabelText("Phone"), { target: { value: " 9000000999 " } });
      fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(writes()).toEqual([
        {
          method: "PUT",
          path: "/api/v1/user/admin/412",
          body: { full_name: "Test Person", email: "testperson@example.com", phone: "9000000999" },
        },
      ]);
      expect(success).toHaveBeenCalledWith("Account updated");
    });

    it("stays open when the server refuses", async () => {
      refuse = new Error("Email already in use");
      render(<UserAdminControls user={asDetail()} />);
      fireEvent.click(screen.getByRole("button", { name: /edit/i }));
      const form = await screen.findByRole("dialog");
      fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(failure).toHaveBeenCalledWith("Email already in use"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});

describe("reset a user's password", () => {
  describe("from the users drawer", () => {
    it("is owner-only", async () => {
      role = "support";
      openDrawer();
      await screen.findByText("Test Person");
      expect(screen.queryByRole("button", { name: "Set password" })).toBeNull();
    });

    it("sets a generated password by username and shows it once", async () => {
      openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Set password" }));

      expect(await screen.findByText(/shown once/i)).toBeInTheDocument();
      const [call] = writes();
      expect(call!.method).toBe("POST");
      expect(call!.path).toBe("/api/v1/auth/admin/reset-password");
      const body = call!.body as { email_or_username: string; new_password: string };
      // Username, not email: an email can belong to two accounts of different types.
      expect(body.email_or_username).toBe("testperson");
      expect(body.new_password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
      // The password on screen is the one that was sent.
      expect(screen.getByText(body.new_password)).toBeInTheDocument();
      expect(success).toHaveBeenCalledWith("Password set");

      fireEvent.click(screen.getByRole("button", { name: "I have saved it" }));
      expect(screen.queryByText(body.new_password)).toBeNull();
    });

    it("shows no password when the server refuses", async () => {
      refuse = new Error("Could not reach the server");
      openDrawer();
      fireEvent.click(await screen.findByRole("button", { name: "Set password" }));

      await waitFor(() => expect(failure).toHaveBeenCalledWith("Could not reach the server"));
      expect(screen.queryByText(/shown once/i)).toBeNull();
    });
  });

  describe("from the user's page", () => {
    it("pre-fills a strong password, and will not send one under six characters", async () => {
      render(<UserAdminControls user={asDetail()} />);
      fireEvent.click(screen.getByRole("button", { name: /set password/i }));
      const form = await screen.findByRole("dialog");
      expect(within(form).getByText(/signed out everywhere/i)).toBeInTheDocument();
      expect((within(form).getByLabelText("New password") as HTMLInputElement).value).toHaveLength(16);

      fireEvent.change(within(form).getByLabelText("New password"), { target: { value: "abc" } });
      expect(within(form).getByText("The API requires at least 6 characters.")).toBeInTheDocument();
      expect(within(form).getByRole("button", { name: "Set password" })).toBeDisabled();
      expect(writes()).toEqual([]);
    });

    it("sends the password for the account's email and says it is set", async () => {
      render(<UserAdminControls user={asDetail()} />);
      fireEvent.click(screen.getByRole("button", { name: /set password/i }));
      const form = await screen.findByRole("dialog");
      fireEvent.change(within(form).getByLabelText("New password"), { target: { value: "Correct-Horse-9" } });
      fireEvent.click(within(form).getByRole("button", { name: "Set password" }));

      expect(await within(form).findByText(/copy it now/i)).toBeInTheDocument();
      expect(writes()).toEqual([
        {
          method: "POST",
          path: "/api/v1/auth/admin/reset-password",
          body: { email_or_username: "testperson@example.com", new_password: "Correct-Horse-9" },
        },
      ]);
      expect(within(form).getByRole("button", { name: "Done" })).toBeInTheDocument();
      expect(within(form).queryByRole("button", { name: "Set password" })).toBeNull();
    });

    it("does not claim it is set when the server refuses", async () => {
      refuse = new Error("Password too common");
      render(<UserAdminControls user={asDetail()} />);
      fireEvent.click(screen.getByRole("button", { name: /set password/i }));
      const form = await screen.findByRole("dialog");
      fireEvent.click(within(form).getByRole("button", { name: "Set password" }));

      await waitFor(() => expect(failure).toHaveBeenCalledWith("Password too common"));
      expect(within(form).queryByText(/copy it now/i)).toBeNull();
      expect(within(form).getByRole("button", { name: "Set password" })).toBeEnabled();
    });
  });
});

describe("make a user an admin", () => {
  describe("from the users drawer", () => {
    it("will not apply 'no admin access', which the endpoint cannot do", async () => {
      openDrawer();
      const select = await screen.findByRole("combobox", { name: "Admin role" });
      expect(select).toHaveValue("none");
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
      expect(screen.getByText("Granting a role makes this an admin account.")).toBeInTheDocument();
    });

    it("grants the chosen role and says so", async () => {
      openDrawer();
      fireEvent.change(await screen.findByRole("combobox", { name: "Admin role" }), { target: { value: "support" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));

      await waitFor(() => expect(success).toHaveBeenCalledWith("Role updated"));
      expect(writes()).toEqual([{ method: "PUT", path: "/api/v1/user/admin/412/role", body: { role: "support" } }]);
    });

    it("says why when the server refuses", async () => {
      refuse = new Error("Only an owner can grant roles");
      openDrawer();
      fireEvent.change(await screen.findByRole("combobox", { name: "Admin role" }), { target: { value: "owner" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));

      await waitFor(() => expect(failure).toHaveBeenCalledWith("Only an owner can grant roles"));
      expect(success).not.toHaveBeenCalled();
    });

    it("is not offered to support", async () => {
      role = "support";
      openDrawer();
      await screen.findByText("Test Person");
      expect(screen.queryByRole("combobox", { name: "Admin role" })).toBeNull();
    });
  });

  describe("from an admin's page", () => {
    it("changes an admin's role from the picker", async () => {
      render(<UserAdminControls user={asDetail({ user_type: "admin", admin_role: "viewer" })} />);
      const trigger = screen.getByRole("combobox", { name: "Admin role" });
      expect(trigger).toHaveTextContent("Viewer");
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      fireEvent.click(await screen.findByRole("option", { name: /^Support/ }));

      await waitFor(() => expect(success).toHaveBeenCalledWith("Role updated"));
      expect(writes()).toEqual([{ method: "PUT", path: "/api/v1/user/admin/412/role", body: { role: "support" } }]);
    });

    it("shows no role picker on an account that is not an admin", () => {
      render(<UserAdminControls user={asDetail()} />);
      expect(screen.queryByRole("combobox", { name: "Admin role" })).toBeNull();
    });

    it("shows none of these controls to support", () => {
      role = "support";
      const { container } = render(<UserAdminControls user={asDetail({ user_type: "admin", admin_role: "viewer" })} />);
      expect(container).toBeEmptyDOMElement();
    });
  });
});

