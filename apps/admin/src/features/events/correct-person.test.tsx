import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { FakeState } from "@/test/fake-api";

/**
 * A support agent corrects someone's details on an event without signing in
 * as the club: only what changed is sent, to the club's own route; a
 * registration under review goes to the requests route; a refusal (an email
 * another registration uses) is said in the dialog.
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
const { freshState, callsOf, refusal } = await import("@/test/fake-api");
const { CorrectPersonDialog } = await import("./components/correct-person-dialog");

const person = { id: "reg-1", full_name: "Anu Mathw", email: "anu.typo@example.com", phone: null };

beforeEach(() => {
  freshState(state);
});

describe("correcting someone's details from the admin portal", () => {
  it("sends only what changed, to the registration's route", async () => {
    state.handlers["PATCH /api/v1/events/registration/7/info/reg-1"] = () => ({});
    const onClose = vi.fn();
    render(<CorrectPersonDialog eventId={7} kind="registration" person={person} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Anu Mathew" } });
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "anu@example.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [call] = callsOf(state, "PATCH");
    expect(call?.path).toBe("/api/v1/events/registration/7/info/reg-1");
    expect(call?.body).toEqual({ full_name: "Anu Mathew", email: "anu@example.com" });
  });

  it("corrects a registration under review on the requests route, and shows a refusal", async () => {
    state.handlers["PATCH /api/v1/events/registration/7/requests/rq-9"] = () => {
      throw refusal(409, "Another request on this event already uses that email.");
    };
    const onClose = vi.fn();
    render(<CorrectPersonDialog eventId={7} kind="review" person={{ ...person, id: "rq-9" }} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/nothing is decided or emailed/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "taken@example.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save details" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Another request on this event already uses that email.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without a call when nothing changed, and refuses a blank name", async () => {
    const onClose = vi.fn();
    render(<CorrectPersonDialog eventId={7} kind="registration" person={person} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save details" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("A name is needed.");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Anu Mathw" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save details" }));
    expect(onClose).toHaveBeenCalled();
    expect(callsOf(state, "PATCH")).toHaveLength(0);
  });
});
