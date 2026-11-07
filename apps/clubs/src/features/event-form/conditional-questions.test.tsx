import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { SHARED_FORM, SHARED_FORM_WIRE, type Question } from "@moa/questions";
import { Form } from "@moa/ui";

/**
 * Conditional sign-up questions in the club's builder, on the contract's
 * shared test form (§12): the nested tree, every refused definition, the
 * R6 block, deleting a parent, the preview walking each branch, and a round
 * trip that keeps show_if and required_when_shown.
 */
vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});

const { render } = await import("@/test/render");
const { QuestionsStep } = await import("./components/steps/questions-step");
const { toEventFormData } = await import("./api");
const { eventDetailToFormValues } = await import("./mapper");
const { eventFormSchema } = await import("./schemas");
type Values = import("./schemas").EventFormValues;

const base = { name: "Hack Night", category_id: 1, event_datetime: "2026-11-01T18:00", duration: 3, is_online: false, location_name: "Main Hall", has_fee: false, has_prize: false, interest_ids: [], speakers: [] };
const asDrafts = (qs: Question[]) => qs.map((q) => ({ ...q, field_type: q.field_type as "text", required: q.required ?? true, options: q.options ?? undefined })) as Values["additional_details"];

let form: UseFormReturn<Values>;
function Harness({ questions = SHARED_FORM }: { questions?: Question[] }) {
  const f = useForm<Values>({ defaultValues: { ...base, additional_details: asDrafts(questions) } as Values });
  React.useEffect(() => {
    form = f;
  }, [f]);
  return (
    <Form {...f}>
      <form>
        <QuestionsStep />
      </form>
    </Form>
  );
}
const keys = () => (form.getValues("additional_details") ?? []).map((q) => q.key);
const card = (n: number) => screen.getByRole("listitem", { name: new RegExp(`^Question ${n}\\b`) });

describe("the builder shows the tree", () => {
  it("indents each conditional question under its parent with the condition in words, nested", () => {
    render(<Harness />);
    expect(within(card(2)).getByText("Shown when Status is Student")).toBeInTheDocument();
    expect(within(card(5)).getByText("Shown when Degree type is PG")).toBeInTheDocument();
    expect(within(card(6)).getByText("Shown when Status is Working")).toBeInTheDocument();
    expect(card(1).style.marginInlineStart).toBe("");
    expect(card(2).style.marginInlineStart).toBe("20px");
    expect(card(5).style.marginInlineStart).toBe("40px");
    expect(card(8).style.marginInlineStart).toBe("");
    // The conditional ones say "when shown".
    expect(within(card(5)).getByText("Must be answered when shown")).toBeInTheDocument();
    expect(within(card(8)).getByText("Must be answered")).toBeInTheDocument();
  });

  it("a child can't move above its parent; moving a parent moves its subtree", async () => {
    render(<Harness />);
    expect(within(card(2)).getByRole("button", { name: "Move question 2 up" })).toBeDisabled();
    expect(within(card(5)).getByRole("button", { name: "Move question 5 up" })).toBeDisabled();
    fireEvent.click(within(card(4)).getByRole("button", { name: "Move question 4 up" }));
    await waitFor(() => expect(keys()).toEqual(["status", "college", "degree_type", "pg_spec", "year", "company", "experience", "tshirt"]));
    // Focus stays on the button used, now on the question's new place.
    await waitFor(() => expect(document.activeElement).toBe(within(card(3)).getByRole("button", { name: "Move question 3 up" })));
  });
});

describe("Only show this if…", () => {
  it("puts a question under the nearest choice question above it, and lets the club pick the answers", async () => {
    render(<Harness questions={[...SHARED_FORM, { key: "laptop", label: "Bringing a laptop?", field_type: "text", required: true }]} />);
    fireEvent.click(within(card(9)).getByRole("button", { name: /Only show this if/ }));
    // T-shirt size is the nearest choice question above it.
    await waitFor(() => expect(form.getValues("additional_details.8.show_if")).toEqual({ key: "tshirt", any_of: [] }));
    const picker = await within(card(9)).findByLabelText("Only show this if");
    fireEvent.change(picker, { target: { value: "status" } });
    // Now under Status, last of its branch.
    await waitFor(() => expect(keys()).toEqual(["status", "college", "year", "degree_type", "pg_spec", "company", "experience", "laptop", "tshirt"]));
    const box = within(card(8)).getByRole("group", { name: "When question 8 is asked" });
    fireEvent.click(within(box).getByRole("button", { name: "Student" }));
    expect(form.getValues("additional_details.7.show_if")).toEqual({ key: "status", any_of: ["Student"] });
    expect(await within(card(8)).findByText("Shown when Status is Student")).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "Student" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers only earlier choice questions with options", () => {
    render(<Harness />);
    const picker = within(card(5)).getByLabelText("Only show this if");
    expect(within(picker).getAllByRole("option").map((o) => o.textContent)).toEqual(["Status", "Year", "Degree type"]);
    // The first question has nothing above it to depend on.
    expect(within(card(1)).getByRole("button", { name: /Only show this if/ })).toBeDisabled();
  });

  it("Always show takes the question out of its branch", async () => {
    render(<Harness />);
    fireEvent.click(within(card(4)).getByRole("button", { name: "Always show this question" }));
    await waitFor(() => expect(keys()).toEqual(["status", "college", "year", "company", "experience", "degree_type", "pg_spec", "tshirt"]));
    expect(form.getValues("additional_details.5.show_if")).toBeNull();
  });
});

describe("R6: an option a child depends on", () => {
  it("can't be removed: the change is refused, naming the child", async () => {
    render(<Harness />);
    fireEvent.click(within(card(4)).getByRole("button", { name: "Remove choice PG" }));
    expect(await within(card(4)).findByText("'PG' can't be removed or renamed: 'PG specialisation' is shown when 'Degree type' is 'PG'. Change that question's condition first.")).toBeInTheDocument();
    expect(form.getValues("additional_details.3.options")).toEqual(["UG", "PG"]);
  });

  it("can't be renamed either", async () => {
    render(<Harness />);
    fireEvent.change(within(card(4)).getByLabelText("Choice 2 of Degree type"), { target: { value: "PGx" } });
    expect(await within(card(4)).findByText(/'PG' can't be removed or renamed/)).toBeInTheDocument();
    expect(form.getValues("additional_details.3.options")).toEqual(["UG", "PG"]);
  });

  it("one nothing depends on can", () => {
    render(<Harness />);
    fireEvent.click(within(card(4)).getByRole("button", { name: "Remove choice UG" }));
    expect(form.getValues("additional_details.3.options")).toEqual(["PG"]);
  });
});

describe("deleting a parent", () => {
  it("asks, and can keep the children as always shown", async () => {
    render(<Harness />);
    fireEvent.click(within(card(4)).getByRole("button", { name: "Remove question 4" }));
    const ask = await screen.findByRole("alertdialog");
    expect(within(ask).getByText("Delete 'Degree type'?")).toBeInTheDocument();
    expect(within(ask).getByText(/One question is asked only on its answers: PG specialisation/)).toBeInTheDocument();
    fireEvent.click(within(ask).getByRole("button", { name: "Keep it, always shown" }));
    await waitFor(() => expect(keys()).toEqual(["status", "college", "year", "company", "experience", "pg_spec", "tshirt"]));
    expect(form.getValues("additional_details.5.show_if")).toBeNull();
  });

  it("or delete them too", async () => {
    render(<Harness />);
    fireEvent.click(within(card(1)).getByRole("button", { name: "Remove question 1" }));
    const ask = await screen.findByRole("alertdialog");
    fireEvent.click(within(ask).getByRole("button", { name: "Delete them too" }));
    await waitFor(() => expect(keys()).toEqual(["tshirt"]));
  });

  it("a question with nothing under it goes without asking", () => {
    render(<Harness />);
    fireEvent.click(within(card(8)).getByRole("button", { name: "Remove question 8" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(keys()).not.toContain("tshirt");
  });
});

describe("definitions refused before save (R1–R5), in the server's words", () => {
  const refused = (questions: Question[]) => {
    const r = eventFormSchema.safeParse({ ...base, additional_details: questions });
    expect(r.success).toBe(false);
    return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  };

  it("takes the shared form", () => {
    expect(eventFormSchema.safeParse({ ...base, additional_details: SHARED_FORM }).success).toBe(true);
  });
  it("a child before its parent", () => {
    expect(refused([SHARED_FORM[4]!, ...SHARED_FORM.slice(0, 4), ...SHARED_FORM.slice(5)])).toContainEqual({ path: "additional_details.0.show_if", message: "'PG specialisation' depends on 'Degree type', which must come before it." });
  });
  it("a cycle", () => {
    const issues = refused([
      { key: "a", label: "A", field_type: "radio", options: ["x"], required: true, show_if: { key: "b", any_of: ["y"] } },
      { key: "b", label: "B", field_type: "radio", options: ["y"], required: true, show_if: { key: "a", any_of: ["x"] } },
    ]);
    expect(issues).toContainEqual({ path: "additional_details.0.show_if", message: "'A' depends on 'B', which must come before it." });
  });
  it("a text question as a parent", () => {
    const form = SHARED_FORM.map((q) => (q.key === "pg_spec" ? { ...q, show_if: { key: "college", any_of: ["IIT"] } } : q));
    expect(refused(form)).toContainEqual({ path: "additional_details.4.show_if", message: "'PG specialisation' depends on 'College name', which isn't a choice question. Only a question with options can show or hide others." });
  });
  it("an any_of value that isn't an option", () => {
    const form = SHARED_FORM.map((q) => (q.key === "company" ? { ...q, show_if: { key: "status", any_of: ["Retired"] } } : q));
    expect(refused(form)).toContainEqual({ path: "additional_details.5.show_if", message: "'Company' is shown when 'Status' is 'Retired', which isn't one of its options." });
  });
  it("depth 6", () => {
    const chain = Array.from({ length: 7 }, (_, i) => ({ key: `q${i}`, label: `Q${i}`, field_type: "radio", options: ["Yes", "No"], required: true, ...(i ? { show_if: { key: `q${i - 1}`, any_of: ["Yes"] } } : {}) }));
    expect(refused(chain)).toContainEqual({ path: "additional_details.6.show_if", message: "'Q6' is nested 6 deep. Questions can be nested at most 5 deep." });
  });
  it("a duplicate key, said under the label", () => {
    expect(refused([...SHARED_FORM, { key: "tshirt", label: "Shirt", field_type: "text", required: true }])).toContainEqual({ path: "additional_details.8.label", message: "'Shirt' has the same key as 'T-shirt size'. Every question needs its own." });
  });
});

describe("a round trip through the builder (§5, §6)", () => {
  it("keeps every show_if, and sends required_when_shown, never turning required into false", () => {
    const values = eventDetailToFormValues({ id: 7, name: "Hack Night", category: { id: 1 }, additional_details: SHARED_FORM_WIRE });
    // The form holds the club's intent: every question required.
    expect(values.additional_details?.map((q) => q.required)).toEqual(SHARED_FORM.map(() => true));
    const sent = JSON.parse(String(toEventFormData(eventFormSchema.parse({ ...base, additional_details: values.additional_details })).get("additional_details")));
    expect(sent).toEqual(
      SHARED_FORM.map((q) => ({
        key: q.key,
        label: q.label,
        field_type: q.field_type,
        required: true,
        ...(q.options ? { options: q.options } : {}),
        ...(q.show_if ? { show_if: q.show_if, required_when_shown: true } : {}),
      })),
    );
    // An always-shown question goes exactly as before: no required_when_shown.
    expect(sent[0]).not.toHaveProperty("required_when_shown");
    expect(sent[7]).not.toHaveProperty("show_if");
  });

  it("keeps an optional conditional question optional", () => {
    const wire = SHARED_FORM_WIRE.map((q) => (q.key === "pg_spec" ? { ...q, required: false, required_when_shown: false } : q));
    const values = eventDetailToFormValues({ id: 7, name: "Hack Night", category: { id: 1 }, additional_details: wire });
    const sent = JSON.parse(String(toEventFormData(eventFormSchema.parse({ ...base, additional_details: values.additional_details })).get("additional_details")));
    expect(sent[4]).toMatchObject({ key: "pg_spec", required: false, required_when_shown: false, show_if: { key: "degree_type", any_of: ["PG"] } });
  });
});

describe("the preview", () => {
  const preview = async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Preview the form/ }));
    return screen.findByRole("dialog");
  };
  const asked = (dialog: HTMLElement) => within(dialog).getAllByText(/^(Status|College name|Year|Degree type|PG specialisation|Company|Experience|T-shirt size)$/).map((n) => n.textContent);

  it("walks Student → PG", async () => {
    const dialog = await preview();
    expect(asked(dialog)).toEqual(["Status", "T-shirt size"]);
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Student" } });
    expect(asked(dialog)).toEqual(["Status", "College name", "Year", "Degree type", "T-shirt size"]);
    fireEvent.change(within(dialog).getByLabelText("Degree type"), { target: { value: "PG" } });
    expect(asked(dialog)).toEqual(["Status", "College name", "Year", "Degree type", "PG specialisation", "T-shirt size"]);
    // Said to a screen reader, without moving focus.
    expect(within(dialog).getByText("A question was added below: PG specialisation.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Check my answers" }));
    expect(within(dialog).getAllByText("This field is required")).toHaveLength(4);
  });

  it("walks Working, and switching back clears the student answers", async () => {
    const dialog = await preview();
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Student" } });
    fireEvent.change(within(dialog).getByLabelText("College name"), { target: { value: "IIT Madras" } });
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Working" } });
    expect(asked(dialog)).toEqual(["Status", "Company", "Experience", "T-shirt size"]);
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "Student" } });
    expect(within(dialog).getByLabelText("College name")).toHaveValue("");
  });
});
