import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/**
 * The Settings page: runtime switches an owner changes without SSH, the
 * server's own value beside each, a way back to it, the secrets' health
 * (never a value), and what changed.
 */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: state.role } }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, callsOf } = await import("@/test/fake-api");
const { SettingsPage, shownValue, grouped } = await import("./index");

const setting = (over: Record<string, unknown>) => ({
  help: "",
  choices: [],
  group: "Features",
  env: true,
  env_name: null,
  overridden: false,
  restart_required: false,
  note: null,
  updated_at: null,
  updated_by: null,
  ...over,
});

const PAGE = {
  settings: [
    setting({ key: "AI_ENABLED", label: "AI assist", kind: "bool", env_name: "APP_AI_ENABLED", value: false, server_value: false }),
    setting({ key: "MAIL_PROVIDER", label: "Mail provider", kind: "choice", choices: ["ses", "resend"], group: "Delivery", env_name: "APP_MAIL_PROVIDER", value: "resend", server_value: "ses", overridden: true, updated_at: "2026-10-24T00:00:00Z", updated_by: { id: 1, name: "Owner" }, note: "Resend needs RESEND_API_KEY" }),
    setting({ key: "maintenance_banner", label: "Maintenance banner", kind: "text", group: "Platform", env: false, value: "", server_value: "" }),
  ],
  secrets: [
    { name: "APP_RAZORPAY_KEY_ID", group: "Payments", set: true, healthy: true, problem: null, mode: "live" },
    { name: "APP_RESEND_API_KEY", group: "Mail", set: false, healthy: false, problem: null, mode: null },
    { name: "APP_SENTRY_DSN", group: "Monitoring", set: true, healthy: false, problem: "is a placeholder", mode: null },
  ],
  history: [{ at: "2026-10-24T00:00:00Z", key: "MAIL_PROVIDER", action: "platform_setting.update", actor: "Owner", from: "ses", to: "resend" }],
  refresh_seconds: 15,
  can_edit: true,
};

beforeEach(() => {
  freshState(state);
  state.handlers["GET /api/v1/admin/settings"] = () => PAGE;
  state.handlers["PUT /api/v1/admin/settings/AI_ENABLED"] = ({ body }) => ({ ...PAGE.settings[0], value: (body as { value: unknown }).value, overridden: true });
  state.handlers["PUT /api/v1/admin/settings/maintenance_banner"] = ({ body }) => ({ ...PAGE.settings[2], value: (body as { value: unknown }).value, overridden: true });
  state.handlers["DELETE /api/v1/admin/settings/MAIL_PROVIDER"] = () => ({ ...PAGE.settings[1], value: "ses", overridden: false });
});

describe("the settings", () => {
  it("shows each with the server's own value, and marks one changed here", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText("AI assist")).toBeInTheDocument();
    expect(screen.getByText("APP_MAIL_PROVIDER")).toBeInTheDocument();
    expect(screen.getByText("Set here")).toBeInTheDocument();
    expect(screen.getByText("Resend needs RESEND_API_KEY")).toBeInTheDocument();
    expect(screen.getByText(/within 15 seconds/)).toBeInTheDocument();
  });

  it("switches a setting on", async () => {
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole("switch", { name: "AI assist" }));
    await waitFor(() => expect(callsOf(state, "PUT", "/api/v1/admin/settings/AI_ENABLED")[0]!.body).toEqual({ value: true }));
  });

  it("saves the maintenance banner", async () => {
    render(<SettingsPage />);
    const box = await screen.findByRole("textbox", { name: "Maintenance banner" });
    fireEvent.change(box, { target: { value: "  Payments pause at 11 pm " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(callsOf(state, "PUT", "/api/v1/admin/settings/maintenance_banner")[0]!.body).toEqual({ value: "Payments pause at 11 pm" }));
  });

  it("puts a setting back to the server's value", async () => {
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Back to the server's value/ }));
    await waitFor(() => expect(callsOf(state, "DELETE", "/api/v1/admin/settings/MAIL_PROVIDER")).toHaveLength(1));
  });

  it("says whether each secret is set and looks right, and never shows a value", async () => {
    render(<SettingsPage />);
    const razorpay = (await screen.findByText("APP_RAZORPAY_KEY_ID")).closest("li")!;
    expect(within(razorpay).getByText("live")).toBeInTheDocument();
    expect(within(razorpay).getByText("Set")).toBeInTheDocument();
    expect(within(screen.getByText("APP_RESEND_API_KEY").closest("li")!).getByText("Not set")).toBeInTheDocument();
    const sentry = screen.getByText("APP_SENTRY_DSN").closest("li")!;
    expect(within(sentry).getByText("Check")).toBeInTheDocument();
    expect(within(sentry).getByText("is a placeholder")).toBeInTheDocument();
  });

  it("lists what changed", async () => {
    render(<SettingsPage />);
    const changes = (await screen.findByText("Recent changes")).closest("section")!;
    expect(within(changes).getByText(/Owner/)).toBeInTheDocument();
    expect(within(changes).getByText(/ses → resend/)).toBeInTheDocument();
  });

  it("lets support look but not change anything", async () => {
    state.role = "support";
    render(<SettingsPage />);
    expect(await screen.findByText(/Only an owner can change these/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "AI assist" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Back to the server's value/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("reads values and groups as a person would", () => {
    expect(shownValue(true)).toBe("On");
    expect(shownValue("")).toBe("(empty)");
    expect(grouped([{ group: "A" }, { group: "B" }, { group: "A" }]).map((g) => [g.group, g.rows.length])).toEqual([["A", 2], ["B", 1]]);
  });
});
