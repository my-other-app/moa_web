import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { SHARED_FORM_WIRE } from "@moa/questions";

/**
 * The club's own forms and views of answers, on the contract's shared form
 * (§12) as read endpoints send it (§5: conditional questions as
 * required: false, required_when_shown: true). Adding a guest by hand asks
 * only what their answers reveal and clears a branch the moment it stops
 * applying; the guest's detail shows only what they were asked.
 */
const posts: Array<{ path: string; body: unknown }> = [];
let detail: Record<string, unknown> = {};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async () => detail),
      post: vi.fn(async (path: string, body: unknown) => {
        posts.push({ path, body });
        return { id: "r1", full_name: "Ananya Iyer", role: "attendee", additional_details: (body as { additional_details: unknown }).additional_details };
      }),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { AttendeeFormDialog } = await import("./components/attendee-form-dialog");
const { AttendeeDetailDialog } = await import("./components/attendee-detail-dialog");
const { eventFieldSchema } = await import("./schemas");

const fields = SHARED_FORM_WIRE.map((f) => eventFieldSchema.parse(f));
const labels = (dialog: HTMLElement) =>
  within(dialog)
    .queryAllByText(/^(Status|College name|Year|Degree type|PG specialisation|Company|Experience|T-shirt size)( · optional)?$/)
    .map((n) => n.textContent);

const open = async () => {
  render(<AttendeeFormDialog eventId={37} fields={fields} existing={null} open onOpenChange={() => {}} />);
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Ananya Iyer" } });
  fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "ananya@example.com" } });
  return dialog;
};

beforeEach(() => {
  posts.length = 0;
});

describe("adding a guest: the form as an attendee meets it", () => {
  it("asks only what the answers reveal, nested; required is required-when-shown, not the flat false", async () => {
    const dialog = await open();
    expect(labels(dialog)).toEqual(["Status", "T-shirt size"]);
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Student" } });
    expect(await within(dialog).findByLabelText("College name")).toBeInTheDocument();
    // No "· optional": required_when_shown is the club's word, not required: false.
    expect(labels(dialog)).toEqual(["Status", "College name", "Year", "Degree type", "T-shirt size"]);
    fireEvent.change(within(dialog).getByLabelText("Degree type"), { target: { value: "PG" } });
    expect(await within(dialog).findByLabelText("PG specialisation")).toBeInTheDocument();
  });

  it("refuses a visible required one left blank, and never a hidden one", async () => {
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Working" } });
    fireEvent.change(await within(dialog).findByLabelText("Experience"), { target: { value: "3-5" } });
    fireEvent.change(within(dialog).getByLabelText("T-shirt size"), { target: { value: "M" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to the list" }));
    expect(await within(dialog).findByText("This is required.")).toBeInTheDocument();
    expect(posts).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText("Company"), { target: { value: "Acme" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to the list" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect((posts[0]!.body as { additional_details: unknown }).additional_details).toEqual({ status: "Working", company: "Acme", experience: "3-5", tshirt: "M" });
  });

  it("switching Student → Working clears the student answers at once, and doesn't send them", async () => {
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Student" } });
    fireEvent.change(await within(dialog).findByLabelText("College name"), { target: { value: "IIT Madras" } });
    fireEvent.change(within(dialog).getByLabelText("Year"), { target: { value: "3" } });
    fireEvent.change(within(dialog).getByLabelText("Degree type"), { target: { value: "PG" } });
    fireEvent.change(await within(dialog).findByLabelText("PG specialisation"), { target: { value: "VLSI" } });
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Working" } });
    await waitFor(() => expect(within(dialog).queryByLabelText("College name")).toBeNull());
    expect(within(dialog).queryByLabelText("PG specialisation")).toBeNull();
    // Back to Student: the answers were cleared, not just hidden.
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Student" } });
    expect(await within(dialog).findByLabelText("College name")).toHaveValue("");
    expect(within(dialog).getByLabelText("Degree type")).toHaveValue("");
    expect(within(dialog).queryByLabelText("PG specialisation")).toBeNull();
  });

  it("switching PG → UG clears only the PG answer", async () => {
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Student" } });
    fireEvent.change(await within(dialog).findByLabelText("College name"), { target: { value: "IIT Madras" } });
    fireEvent.change(within(dialog).getByLabelText("Year"), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText("Degree type"), { target: { value: "PG" } });
    fireEvent.change(await within(dialog).findByLabelText("PG specialisation"), { target: { value: "VLSI" } });
    fireEvent.change(within(dialog).getByLabelText("Degree type"), { target: { value: "UG" } });
    fireEvent.change(within(dialog).getByLabelText("T-shirt size"), { target: { value: "L" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to the list" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect((posts[0]!.body as { additional_details: unknown }).additional_details).toEqual({ status: "Student", college: "IIT Madras", year: "2", degree_type: "UG", tshirt: "L" });
  });
});

describe("a guest's detail shows what they were asked", () => {
  it("leaves out a question their answers hid; blank, never an error", async () => {
    detail = { id: "r1", full_name: "Ravi Kumar", role: "attendee", created_at: "2026-11-01T10:00:00+05:30", additional_details: { status: "Working", company: "Acme", experience: "3-5" } };
    render(<AttendeeDetailDialog eventId={37} registrationId="r1" fields={fields} open onOpenChange={() => {}} onEdit={() => {}} onRemove={() => {}} />);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Acme")).toBeInTheDocument();
    expect(within(dialog).queryByText("College name")).toBeNull();
    expect(within(dialog).queryByText("PG specialisation")).toBeNull();
    // A visible question they left blank is said as not answered.
    expect(within(dialog).getByText("T-shirt size")).toBeInTheDocument();
  });

  it("still shows an answer the form would hide now: a changed form doesn't rewrite what they said", async () => {
    detail = { id: "r1", full_name: "Ravi Kumar", role: "attendee", created_at: "2026-11-01T10:00:00+05:30", additional_details: { status: "Working", college: "IIT Madras" } };
    render(<AttendeeDetailDialog eventId={37} registrationId="r1" fields={fields} open onOpenChange={() => {}} onEdit={() => {}} onRemove={() => {}} />);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("IIT Madras")).toBeInTheDocument();
  });
});
