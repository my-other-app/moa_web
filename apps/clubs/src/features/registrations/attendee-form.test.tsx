import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * Adding a guest by hand answers the event's own questions as the public
 * form does: several ticks as a list (one as the option itself, which every
 * API takes), typed questions with their input, and the API's word on an
 * answer it refuses under that question.
 */
const posts: Array<{ path: string; body: unknown }> = [];
let refusal: ApiError | null = null;

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async () => ({})),
      post: vi.fn(async (path: string, body: unknown) => {
        posts.push({ path, body });
        if (refusal) throw refusal;
        return { id: "r1", full_name: (body as { full_name: string }).full_name, role: "attendee", additional_details: (body as { additional_details: unknown }).additional_details };
      }),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { AttendeeFormDialog } = await import("./components/attendee-form-dialog");

const fields = [
  { key: "tracks", label: "Tracks", field_type: "checkbox", options: ["AI", "Web", "Hardware"], required: true },
  { key: "year", label: "Year of study", field_type: "number", required: false },
];

const fillIn = async () => {
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Ananya Iyer" } });
  fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "ananya@example.com" } });
  return dialog;
};

beforeEach(() => {
  posts.length = 0;
  refusal = null;
});

describe("adding a guest by hand", () => {
  it("sends several ticks as a list, and asks a number with a number field", async () => {
    render(<AttendeeFormDialog eventId={37} fields={fields} existing={null} open onOpenChange={() => {}} />);
    const dialog = await fillIn();
    expect(within(dialog).getByLabelText(/Year of study/)).toHaveAttribute("type", "number");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Hardware" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "AI" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to the list" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ path: "/api/v1/events/registration/37/attendees", body: { additional_details: { tracks: ["AI", "Hardware"] } } });
  });

  it("sends one tick as the option itself, which an API from before also takes", async () => {
    render(<AttendeeFormDialog eventId={37} fields={fields} existing={null} open onOpenChange={() => {}} />);
    const dialog = await fillIn();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Web" }));
    fireEvent.change(within(dialog).getByLabelText(/Year of study/), { target: { value: "3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to the list" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect((posts[0]!.body as { additional_details: unknown }).additional_details).toEqual({ tracks: "Web", year: "3" });
  });

  it("asks for a required several-choices question before sending", async () => {
    render(<AttendeeFormDialog eventId={37} fields={fields} existing={null} open onOpenChange={() => {}} />);
    const dialog = await fillIn();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to the list" }));
    expect(await within(dialog).findByText("This is required.")).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it("shows the API's word on a refused answer under its question", async () => {
    refusal = new ApiError({ message: "Check your answers: Year of study.", status: 400, errorCode: "INVALID_ANSWERS", fieldErrors: { year: "Enter a number." } as unknown as Record<string, string[]> });
    render(<AttendeeFormDialog eventId={37} fields={fields} existing={null} open onOpenChange={() => {}} />);
    const dialog = await fillIn();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "AI" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to the list" }));
    expect(await within(dialog).findByText("Enter a number.")).toBeInTheDocument();
  });

  it("reads a guest's earlier answers back, a list as ticks", async () => {
    const existing = { id: "r1", full_name: "Ananya Iyer", email: "ananya@example.com", phone: null, role: "attendee" as const, additional_details: { tracks: ["AI", "Web"], year: 2 }, is_paid: false, is_attended: false, is_won: false, ticket_deliveries: [], certificate_deliveries: [] };
    render(<AttendeeFormDialog eventId={37} fields={fields} existing={existing} open onOpenChange={() => {}} />);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: "AI" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Web" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Hardware" })).not.toBeChecked();
    expect(within(dialog).getByLabelText(/Year of study/)).toHaveValue(2);
  });
});
