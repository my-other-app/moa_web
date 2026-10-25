import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import summary from "../__fixtures__/event-summary.json";

/**
 * Setting up an event's door team: adding a volunteer (a name, the email
 * they sign in with, a phone if there is one), and whether the door asks a
 * guest for a mobile number. The rest of the panel (switching a duty, taking
 * someone off) is in doors.test.tsx; the door's side of the number is in
 * gate/contact-and-orders.test.tsx.
 */
type Call = { method: string; path: string; body?: unknown };
const calls: Call[] = [];
let refuse: Error | null = null;

const doors = [{ id: "d1", event_id: 37, name: "Gate A", kind: "door", sort_order: 0, active: true, volunteers: [{ id: 7, name: "Vani" }], check_ins: 2, link: null, created_at: null }];
const VANI = { id: 7, email: "v@example.com", name: "Vani", user_id: 9, is_approved: true, scope: "event", can_check_in: true, can_walkup: false, can_merch: false, door_id: "d1", check_ins: 2 };
const SETTINGS = { door_mode: "auto", close_after_minutes: 240, spot_registration_checks_in: true, capture_contact_at_gate: false, require_contact_at_gate: false };
let settings = { ...SETTINGS };
let volunteers: unknown[] = [VANI];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (/\/events\/37\/summary$/.test(path)) return summary;
        if (path.endsWith("/37/team")) return { owner: { name: "Hack Club", email: "club@example.com" }, volunteers, doors, settings };
        if (path.endsWith("/volunteer/list/37")) return [{ full_name: "Vani Iyer", email_id: "v@example.com" }];
        if (path.endsWith("/37/kiosks")) return [];
        if (path.endsWith("/37/kiosks/settings")) return { self_check_in_enabled: false, self_check_in_verify: "name", self_check_in_print: false, has_pin: false };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (refuse) throw refuse;
        return null;
      }),
      patch: vi.fn(async (path: string, body: Record<string, unknown>) => {
        calls.push({ method: "PATCH", path, body });
        if (refuse) throw refuse;
        settings = { ...settings, ...body };
        return settings;
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { TeamPage } = await import("./index");

beforeEach(() => {
  calls.length = 0;
  refuse = null;
  volunteers = [VANI];
  settings = { ...SETTINGS };
  vi.restoreAllMocks();
});

const posts = () => calls.filter((c) => c.method === "POST");
const teamReads = () => calls.filter((c) => c.path.endsWith("/37/team")).length;

async function openAdd() {
  render(<TeamPage eventId={37} />);
  await screen.findByText("On check-in duty");
  fireEvent.click(screen.getByRole("button", { name: /Add a volunteer/ }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: "Add a volunteer" })).toBeInTheDocument();
  return dialog;
}

const fill = (dialog: HTMLElement, values: { name?: string; email?: string; phone?: string }) => {
  if (values.name !== undefined) fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: values.name } });
  if (values.email !== undefined) fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: values.email } });
  if (values.phone !== undefined) fireEvent.change(within(dialog).getByLabelText("Phone (optional)"), { target: { value: values.phone } });
};

describe("adding a volunteer", () => {
  it("adds them by name, email and phone, says so, closes, and reads the team again", async () => {
    const success = vi.spyOn(toast, "success");
    const dialog = await openAdd();
    const before = teamReads();
    fill(dialog, { name: " Asha K ", email: " asha@example.com ", phone: "+91 98470 12345" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add volunteer" }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toEqual({
      method: "POST",
      path: "/api/v1/events/volunteer/add",
      body: { event_id: 37, full_name: "Asha K", email_id: "asha@example.com", phone: "+91 98470 12345" },
    });
    await waitFor(() => expect(success).toHaveBeenCalledWith("Volunteer added"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(teamReads()).toBeGreaterThan(before));
  });

  it("leaves the phone out of the request when none is given", async () => {
    const dialog = await openAdd();
    fill(dialog, { name: "Asha K", email: "asha@example.com" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add volunteer" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.body).toEqual({ event_id: 37, full_name: "Asha K", email_id: "asha@example.com" });
  });

  it("says what is missing under each field and sends nothing", async () => {
    const dialog = await openAdd();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add volunteer" }));
    expect(await within(dialog).findByText("Enter the volunteer's name")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter a valid email")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");

    fill(dialog, { name: "Asha K", email: "asha@example.com", phone: "call me" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add volunteer" }));
    expect(await within(dialog).findByText("Enter a valid phone number")).toBeInTheDocument();
    expect(within(dialog).queryByText("Enter the volunteer's name")).not.toBeInTheDocument();
    expect(posts()).toEqual([]);
  });

  it("keeps the dialog and what was typed when the server refuses, in its words", async () => {
    const error = vi.spyOn(toast, "error");
    refuse = new ApiError({ status: 409, message: "asha@example.com is already a volunteer" });
    const dialog = await openAdd();
    fill(dialog, { name: "Asha K", email: "asha@example.com" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add volunteer" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("asha@example.com is already a volunteer"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Email")).toHaveValue("asha@example.com");
  });

  it("closes on Cancel without adding anyone", async () => {
    const dialog = await openAdd();
    fill(dialog, { name: "Asha K", email: "asha@example.com" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(posts()).toEqual([]);
  });

  it("offers the first volunteer from the empty team", async () => {
    volunteers = [];
    render(<TeamPage eventId={37} />);
    const buttons = await screen.findAllByRole("button", { name: /Add a volunteer/ });
    fireEvent.click(buttons[0]!);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("asking for a mobile number at the door", () => {
  const patches = () => calls.filter((c) => c.method === "PATCH");

  it("switches the ask on for the event, and only then lets the number be made required", async () => {
    const success = vi.spyOn(toast, "success");
    render(<TeamPage eventId={37} />);
    const ask = await screen.findByRole("switch", { name: "Ask for a mobile number at the door" });
    const required = screen.getByRole("switch", { name: "Make the number required" });
    expect(ask).not.toBeChecked();
    // Requiring a number the door never asks for would mean nothing.
    expect(required).toBeDisabled();

    fireEvent.click(ask);
    await waitFor(() => expect(patches()).toEqual([{ method: "PATCH", path: "/api/v1/events/37/gate-settings", body: { capture_contact_at_gate: true } }]));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Door settings saved"));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Make the number required" })).toBeEnabled());

    fireEvent.click(screen.getByRole("switch", { name: "Make the number required" }));
    await waitFor(() => expect(patches().at(-1)).toEqual({ method: "PATCH", path: "/api/v1/events/37/gate-settings", body: { require_contact_at_gate: true } }));
  });

  it("says why when the setting is refused, and leaves the switch as it was", async () => {
    const error = vi.spyOn(toast, "error");
    refuse = new ApiError({ status: 403, message: "Only the organiser can change the door" });
    render(<TeamPage eventId={37} />);
    fireEvent.click(await screen.findByRole("switch", { name: "Ask for a mobile number at the door" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Only the organiser can change the door"));
    expect(screen.getByRole("switch", { name: "Ask for a mobile number at the door" })).not.toBeChecked();
  });
});
