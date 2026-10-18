import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { Form } from "@moa/ui";

import topicsFixture from "../__fixtures__/topics.json";

/** The event's interests are picked with the topic picker, and go out as the comma list the backend splits. */
vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/interests/list") return topicsFixture;
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
const { ReachStep } = await import("./components/steps/reach-step");
const { emptyEventForm } = await import("./components/event-form");
const { toEventFormData } = await import("./api");
const { eventFormSchema } = await import("./schemas");
type Values = import("./schemas").EventFormValues;

let form: UseFormReturn<Values>;

function Harness({ defaults }: { defaults: Values }) {
  const f = useForm<Values>({ defaultValues: defaults });
  React.useEffect(() => {
    form = f;
  }, [f]);
  return (
    <Form {...f}>
      <form>
        <ReachStep />
      </form>
    </Form>
  );
}

const required = { name: "Hack Night", category_id: 1, event_datetime: "2026-11-01T18:00", duration: 3, location_name: "Technopark Phase 1" };

describe("the event's interests", () => {
  it("are picked by topic and sent as a comma list", async () => {
    render(<Harness defaults={{ ...emptyEventForm, interest_ids: [6] }} />);
    expect(screen.getByText("Interests")).toBeInTheDocument();
    expect(screen.queryByText("Topics")).not.toBeInTheDocument();
    const deep = await screen.findByRole("group", { name: /Deep Tech/ });
    expect(screen.getByRole("checkbox", { name: /Coding/ })).toBeChecked();

    fireEvent.click(within(deep).getByRole("checkbox", { name: "Robotics" }));
    expect(form.getValues("interest_ids")).toEqual([6, 31]);
    // Where the picks list the event.
    expect(within(screen.getByRole("list", { name: "Shows under these topics" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Development", "Deep Tech"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Coding" }));
    expect(form.getValues("interest_ids")).toEqual([31]);
    const fd = toEventFormData(eventFormSchema.parse({ ...form.getValues(), ...required }));
    expect(fd.get("interest_ids")).toBe("31");
  });

  it("carries the form's description to the picker for screen readers", async () => {
    render(<Harness defaults={emptyEventForm} />);
    await screen.findByRole("checkbox", { name: "Robotics" });
    const picker = screen.getByRole("group", { name: "Interests" });
    const description = screen.getByText(/Students who follow an interest see this event/);
    expect(picker.getAttribute("aria-describedby")).toContain(description.id);
  });
});
