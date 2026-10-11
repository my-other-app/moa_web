import { describe, expect, it } from "vitest";

import registrationsFixture from "../__fixtures__/registrations.json";
import { registrationPageSchema } from "./schemas";

describe("the registration schema", () => {
  it("defaults a missing role to attendee", () => {
    const parsed = registrationPageSchema.parse(registrationsFixture);
    expect(parsed.items[1]?.role).toBe("attendee");
  });

  it("keeps a role the server did send", () => {
    const parsed = registrationPageSchema.parse(registrationsFixture);
    expect(parsed.items[0]?.role).toBe("speaker");
  });

  it("rejects a role the control cannot display", () => {
    // A value with no label would render as a blank select next to a name.
    const broken = { ...registrationsFixture, items: [{ ...registrationsFixture.items[0], role: "keynote" }] };
    expect(registrationPageSchema.safeParse(broken).success).toBe(false);
  });

  it("gives a row from before deliveries existed an empty list of them", () => {
    const parsed = registrationPageSchema.parse(registrationsFixture);
    expect(parsed.items[0]?.ticket_deliveries).toEqual([]);
  });
});
