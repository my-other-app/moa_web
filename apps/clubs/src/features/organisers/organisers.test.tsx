import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import clubInfoFixture from "../__fixtures__/club-info.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const member = (id: number, name: string, role: string | null) => ({ id, name, role, instagram: null, linkedin: null, x: null, website: null, sort_order: id, photo: null });
const TEAM = [member(1, "Ananya Iyer", "Lead"), member(2, "Rohan Patil", "Treasurer"), member(3, "Meera Nair", "Design")];
const SAVED = [
  { member_id: 3, name: "Meera Nair", club_role: "Design", role: "Host", photo: null },
  { member_id: 1, name: "Ananya Iyer", club_role: "Lead", role: null, photo: null },
];
const DOOR = {
  role: "door", role_label: "Door", role_description: "Checks people in.", club_id: 5, club_name: "LetMeGoo", member: null,
  can: { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: false, delete_events: false, door: true },
};

let team: unknown[] = TEAM;
let saved: unknown = SAVED;
let me: unknown = null;
let refuse: ApiError | null = null;

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/clubs/info")) return { ...clubInfoFixture, team };
        if (path.endsWith("/events/37/organisers")) {
          if (saved instanceof Error) throw saved;
          return saved;
        }
        if (path.endsWith("/clubs/access/me") && me) return me;
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (refuse) throw refuse;
        return null;
      }),
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { OrganisersPanel } = await import("./components/organisers-panel");

/** The names down the list, top to bottom, read off the checkboxes. */
const order = () => screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label")!.replace(/^Show (.*) on the event page$/, "$1"));
const box = (name: string) => screen.getByRole("checkbox", { name: `Show ${name} on the event page` });
const put = () => calls.find((c) => c.method === "PUT");

beforeEach(() => {
  calls.length = 0;
  team = TEAM;
  saved = SAVED;
  me = null;
  refuse = null;
});

describe("on the event page", () => {
  it("lists the saved organisers first, in order and with their event roles, then the rest of the team", async () => {
    render(<OrganisersPanel eventId={37} />);
    await screen.findByRole("checkbox", { name: "Show Meera Nair on the event page" });
    expect(order()).toEqual(["Meera Nair", "Ananya Iyer", "Rohan Patil"]);
    expect(box("Meera Nair")).toBeChecked();
    expect(box("Ananya Iyer")).toBeChecked();
    expect(box("Rohan Patil")).not.toBeChecked();
    expect(screen.getByLabelText("Meera Nair's role at this event")).toHaveValue("Host");
    // An empty event role falls back to the club role, which the placeholder shows.
    expect(screen.getByLabelText("Ananya Iyer's role at this event")).toHaveAttribute("placeholder", "Lead");
    expect(screen.getByLabelText("Rohan Patil's role at this event")).toBeDisabled();
    expect(screen.getByText(/With nobody ticked, it shows the club's whole team/)).toBeInTheDocument();
    expect(screen.getByText("The event page lists 2 of 3 people, in this order.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
  });

  it("reorders, ticks and gives a role, then saves the order as the page's", async () => {
    render(<OrganisersPanel eventId={37} />);
    await screen.findByRole("checkbox", { name: "Show Meera Nair on the event page" });
    expect(screen.getByRole("button", { name: "Move Meera Nair up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Ananya Iyer down" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move Ananya Iyer up" }));
    expect(order()).toEqual(["Ananya Iyer", "Meera Nair", "Rohan Patil"]);
    fireEvent.click(box("Rohan Patil"));
    fireEvent.change(screen.getByLabelText("Rohan Patil's role at this event"), { target: { value: "  Volunteer lead " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(put()).toEqual({
        method: "PUT",
        path: "/api/v1/events/37/organisers",
        body: {
          members: [
            { member_id: 1, role: null },
            { member_id: 3, role: "Host" },
            { member_id: 2, role: "Volunteer lead" },
          ],
        },
      }),
    );
  });

  it("unticking everyone saves an empty list, which puts the whole club team back", async () => {
    render(<OrganisersPanel eventId={37} />);
    await screen.findByRole("checkbox", { name: "Show Meera Nair on the event page" });
    fireEvent.click(screen.getByRole("button", { name: "Untick everyone" }));
    expect(screen.getByText("Nobody ticked: the event page shows the whole club team (3 people).")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(put()?.body).toEqual({ members: [] }));
  });

  it("puts the server's refusal beside the list, and discarding goes back to what is saved", async () => {
    refuse = new ApiError({ message: "Rohan Patil is not on the club's team.", status: 422 });
    render(<OrganisersPanel eventId={37} />);
    await screen.findByRole("checkbox", { name: "Show Rohan Patil on the event page" });
    fireEvent.click(box("Rohan Patil"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Rohan Patil is not on the club's team.");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(box("Rohan Patil")).not.toBeChecked();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends a club with nobody on its team to the club profile's team section", async () => {
    team = [];
    render(<OrganisersPanel eventId={37} />);
    expect(await screen.findByText("Your club has no team yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add the team" })).toHaveAttribute("href", "/profile#team");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("is read-only for a role that cannot edit events", async () => {
    me = DOOR;
    render(<OrganisersPanel eventId={37} />);
    expect(await screen.findByText("Your role can see this, not change it.")).toBeInTheDocument();
    for (const c of screen.getAllByRole("checkbox")) expect(c).toBeDisabled();
    expect(screen.getByLabelText("Meera Nair's role at this event")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Save|Move/ })).not.toBeInTheDocument();
  });

  it("says when the organising team cannot be loaded, and tries again", async () => {
    saved = new ApiError({ message: "Something went wrong on our side. Please try again.", status: 500 });
    render(<OrganisersPanel eventId={37} />);
    const empty = (await screen.findByText("Could not load the organising team")).closest("div")!.parentElement!;
    saved = SAVED;
    fireEvent.click(within(empty).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("checkbox", { name: "Show Meera Nair on the event page" })).toBeChecked();
  });
});
