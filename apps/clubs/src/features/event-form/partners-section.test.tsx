import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { ApiError } from "@moa/api";

import topicsFixture from "../__fixtures__/topics.json";
import clubInfoFixture from "../__fixtures__/club-info.json";

/**
 * The event editor's "Sponsors & partners" section: there on a server that
 * has them (the event's detail carried a `sponsors` list), left out of an
 * edit on an older one, and a note on a new event, whose rows wait for it.
 */
const gets: string[] = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        gets.push(path);
        if (path === "/api/v1/events/categories/list") return [{ id: 1, name: "Workshop" }];
        if (path === "/api/v1/interests/list") return topicsFixture;
        if (path === "/api/v1/clubs/info") return clubInfoFixture;
        if (path === "/api/v1/events/37/partners") return [{ id: 11, kind: "sponsor", name: "Kinetic Labs", label: null, link: null, position: 0, logo: null, club_partner_id: null }];
        throw new ApiError({ status: 404, message: "Not here" });
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventForm, emptyEventForm } = await import("./components/event-form");

const saved = { ...emptyEventForm, name: "Hack Night", category_id: 1, event_datetime: "2026-11-08T18:00", duration: 3, location_name: "Seminar Hall, CET" };

beforeEach(() => {
  gets.length = 0;
});

describe("the editor's sponsors and partners", () => {
  it("is a section of an edit on a server that has them, saved row by row", async () => {
    render(<EventForm mode="edit" eventId={37} defaultValues={saved} context={{ status: "published", registered: 0, partnersSupported: true }} />);
    expect(await screen.findByRole("heading", { name: "Sponsors & partners" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Kinetic Labs name")).toHaveValue("Kinetic Labs");
    expect(gets).toContain("/api/v1/events/37/partners");
    expect(screen.getByText("Every section saves together; sponsors and partners save as you add them.")).toBeInTheDocument();
  });

  it("is left out of an edit on an older server, which is never asked for them", async () => {
    render(<EventForm mode="edit" eventId={37} defaultValues={saved} context={{ status: "published", registered: 0 }} />);
    expect(await screen.findByRole("heading", { name: "People" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sponsors & partners" })).toBeNull();
    await waitFor(() => expect(gets).toContain("/api/v1/clubs/info"));
    expect(gets).not.toContain("/api/v1/events/37/partners");
    expect(screen.getByText("Every section saves together.")).toBeInTheDocument();
  });

  it("on a new event, says to save it first", async () => {
    render(<EventForm mode="create" />);
    expect(await screen.findByRole("heading", { name: "Sponsors & partners" })).toBeInTheDocument();
    expect(screen.getByText(/Save the event first \(a draft is fine\)/)).toBeInTheDocument();
    expect(gets.some((p) => p.includes("/partners"))).toBe(false);
  });
});
