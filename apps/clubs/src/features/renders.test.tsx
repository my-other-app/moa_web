import { describe, expect, it } from "vitest";
import { useForm } from "react-hook-form";
import { screen } from "@testing-library/react";
import { Form } from "@moa/ui";

import { render } from "@/test/render";
import { EntryStep } from "./event-form/components/steps/entry-step";
import { EventStep } from "./event-form/components/steps/event-step";
import { PeopleStep } from "./event-form/components/steps/people-step";
import { QuestionsStep } from "./event-form/components/steps/questions-step";
import { ReachStep } from "./event-form/components/steps/reach-step";
import { WhenStep } from "./event-form/components/steps/when-step";
import { WhereStep } from "./event-form/components/steps/where-step";
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
    ["The event", EventStep],
    ["When", WhenStep],
    ["Where", WhereStep],
    ["Places and money", EntryStep],
    ["People", PeopleStep],
    ["Reach and rules", ReachStep],
    ["Sign-up questions", QuestionsStep],
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

  it("People shows the speakers section", () => {
    render(
      <WithForm>
        <PeopleStep />
      </WithForm>
    );
    expect(screen.getByText("Speakers and mentors")).toBeInTheDocument();
  });

  it("Questions shows its intro copy", () => {
    render(
      <WithForm>
        <QuestionsStep />
      </WithForm>
    );
    expect(screen.getByText(/Only a name and an email are asked/)).toBeInTheDocument();
  });
});

