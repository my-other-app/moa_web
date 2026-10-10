import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

import registrationsFixture from "../__fixtures__/registrations.json";

/**
 * Assigning a role from the attendee list.
 *
 * The role decides which ticket and certificate variant someone is issued,
 * so an event can hold a speaker design that reaches nobody unless this
 * control works. The second fixture row deliberately carries no `role` at
 * all, standing in for a response cached from before the field existed.
 */
const put = vi.fn(async () => ({}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/list")) return registrationsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put,
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { RegistrationsTable } = await import("./components/registrations-table");
const { registrationPageSchema } = await import("./schemas");

describe("the role column", () => {
  it("shows the role each person is attending as", async () => {
    render(<RegistrationsTable eventId={37} />);

    const speaker = await screen.findByLabelText(
      "Role for Test Participant One"
    );
    expect(within(speaker).getByText("Speaker")).toBeInTheDocument();
  });

  it("treats a row with no role as an attendee", async () => {
    // Rather than rendering an empty select, which would read as "no role"
    // when the server has them down as an attendee.
    render(<RegistrationsTable eventId={37} />);

    const other = await screen.findByLabelText("Role for Test Participant Two");
    expect(within(other).getByText("Attendee")).toBeInTheDocument();
  });
});

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
    const broken = {
      ...registrationsFixture,
      items: [{ ...registrationsFixture.items[0], role: "keynote" }],
    };

    expect(registrationPageSchema.safeParse(broken).success).toBe(false);
  });
});
