import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { ApiError } from "@moa/api";
import { Form } from "@moa/ui";

/**
 * "Confirm each registration yourself" on a new event: shown once the
 * server is known to have registration requests (its access caps name
 * `decide_requests`), off until switched on; untouched or absent, the
 * create sends no `requires_approval`, so the server's default stands and
 * an API without it never sees the field.
 */
const calls: Array<{ method: string; path: string }> = [];
let me: unknown = null;

const caps = (over: Record<string, boolean> = {}) => ({
  role: "owner", role_label: "Owner", role_description: "Everything.", club_id: 5, club_name: "Circuit Society", member: null,
  can: { manage_access: true, see_access: true, money: true, club_profile: true, edit_events: true, delete_events: true, door: true, ...over },
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/access/me") {
          if (me) return me;
          throw new ApiError({ status: 401, message: "Not signed in" });
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EntryStep } = await import("./components/steps/entry-step");
const { emptyEventForm } = await import("./components/event-form");
const { toEventFormData } = await import("./api");
const { eventFormSchema } = await import("./schemas");
type Values = import("./schemas").EventFormValues;

let form: UseFormReturn<Values>;

function Harness() {
  const f = useForm<Values>({ defaultValues: emptyEventForm });
  React.useEffect(() => {
    form = f;
  }, [f]);
  return (
    <Form {...f}>
      <form>
        <EntryStep />
      </form>
    </Form>
  );
}

const required = { name: "Hack Night", category_id: 1, event_datetime: "2026-11-01T18:00", duration: 3, location_name: "Technopark Phase 1" };
const wire = () => toEventFormData(eventFormSchema.parse({ ...form.getValues(), ...required }));

beforeEach(() => {
  calls.length = 0;
  me = null;
});

describe("reviewing registrations on a new event", () => {
  it("shows once the server is known to have requests, off until switched on, and the create sends it", async () => {
    me = caps({ decide_requests: true });
    render(<Harness />);
    const toggle = await screen.findByRole("switch", { name: "Review registrations before sending tickets" });
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText(
        "Everyone who registers gets a 'Thanks for registering' email. You confirm or decline each registration in the Review tab, and confirmed people get their ticket by email.",
      ),
    ).toBeInTheDocument();
    // Untouched: not sent, so the server's default stands.
    expect(wire().has("requires_approval")).toBe(false);
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    // A new event has no waiting list to move: no note about one.
    expect(screen.queryByText(/moves into Review/)).toBeNull();
    expect(wire().get("requires_approval")).toBe("true");
    fireEvent.click(toggle);
    expect(wire().get("requires_approval")).toBe("false");
  });

  it("isn't there for a server without requests (its caps don't name them), and nothing is sent", async () => {
    me = caps();
    render(<Harness />);
    await screen.findByRole("switch", { name: "Swag to hand out" });
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/access/me")).toBe(true));
    expect(screen.queryByRole("switch", { name: "Review registrations before sending tickets" })).toBeNull();
    expect(wire().has("requires_approval")).toBe(false);
  });

  it("isn't there before the server has said who is signed in", async () => {
    render(<Harness />);
    await screen.findByRole("switch", { name: "Swag to hand out" });
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/access/me")).toBe(true));
    expect(screen.queryByRole("switch", { name: "Review registrations before sending tickets" })).toBeNull();
  });
});
