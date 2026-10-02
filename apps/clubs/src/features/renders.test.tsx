import { describe, expect, it } from "vitest";
import { useForm, FormProvider } from "react-hook-form";
import { screen } from "@testing-library/react";
import { Form } from "@moa/ui";

import { render } from "@/test/render";
import { TemplateDesigner } from "./templates/components/template-designer";
import { BasicsStep } from "./event-form/components/steps/basics-step";
import { DetailsStep } from "./event-form/components/steps/details-step";
import { EntryStep } from "./event-form/components/steps/entry-step";
import { PlaceStep } from "./event-form/components/steps/place-step";
import { QuestionsStep } from "./event-form/components/steps/questions-step";
import { ScheduleStep } from "./event-form/components/steps/schedule-step";
import { emptyEventForm } from "./event-form/components/event-form";

/**
 * These exist because three components shipped to production and crashed on
 * render, and neither tsc nor the build caught any of them.
 *
 * The cause was always the same: @moa/ui's FormLabel / FormDescription /
 * FormMessage / FormControl read from react-hook-form's field context via
 * useFormField, which throws when there is no <FormField> ancestor -- or, in
 * the template designer's case, no form at all, since it holds its config in
 * plain useState. Type-checking cannot see that; only rendering can.
 */

function WithForm({ children }: { children: React.ReactNode }) {
  const form = useForm({ defaultValues: emptyEventForm });
  return (
    <Form {...form}>
      <form>{children}</form>
    </Form>
  );
}

describe("event form steps render", () => {
  const steps = [
    ["Basics", BasicsStep],
    ["Schedule", ScheduleStep],
    ["Place", PlaceStep],
    ["Entry", EntryStep],
    ["Details", DetailsStep],
    ["Questions", QuestionsStep],
  ] as const;

  for (const [name, Step] of steps) {
    it(`${name} renders without throwing`, () => {
      expect(() =>
        render(
          <WithForm>
            <Step />
          </WithForm>
        )
      ).not.toThrow();
    });
  }

  it("Details shows the speakers section", () => {
    render(
      <WithForm>
        <DetailsStep />
      </WithForm>
    );
    expect(screen.getByText("Speakers")).toBeInTheDocument();
  });

  it("Questions shows its intro copy", () => {
    render(
      <WithForm>
        <QuestionsStep />
      </WithForm>
    );
    expect(screen.getByText(/Asked when someone registers/)).toBeInTheDocument();
  });
});

describe("template designer renders", () => {
  it("ticket designer renders without throwing", () => {
    // The designer uses plain useState, so any field-bound Form primitive
    // inside it throws immediately -- this is the exact production crash.
    expect(() => render(<TemplateDesigner kind="ticket" />)).not.toThrow();
  });

  it("certificate designer renders without throwing", () => {
    expect(() => render(<TemplateDesigner kind="certificate" />)).not.toThrow();
  });

  it("shows the colour controls and the preview", () => {
    render(<TemplateDesigner kind="ticket" />);
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByLabelText(/Accent hex value/i)).toBeInTheDocument();
  });

  it("opens an existing template without losing its config", () => {
    render(
      <TemplateDesigner
        kind="ticket"
        existing={{
          id: 1,
          name: "Existing",
          is_default: false,
          config: { accent_color: "#ff0000" },
          logo: null,
          secondary_logo: null,
          background_image: null,
        }}
      />
    );
    // ColorField renders both a swatch picker and a hex field for the same
    // value, so target the labelled hex input rather than the value alone.
    expect(screen.getByLabelText(/Accent hex value/i)).toHaveValue("#ff0000");
  });
});
