import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import clubInfoFixture from "../__fixtures__/club-info.json";

const profile = {
  user: { id: 9, full_name: "Ananya Iyer", username: "ananya", avatar: null, org: "COEP Technological University", interests: ["Robotics", "IoT"] },
  followed_at: "2026-09-01T10:00:00+00:00",
  contact: { email: "ananya@example.com", phone: null },
  events: [
    { event_id: 37, name: "Hack Night 04", starts_at: "2026-10-04T12:30:00+00:00", status: "closed", attended: true, paid: true, paid_amount: 250, registered_at: "2026-09-20T08:00:00+00:00" },
    { event_id: 41, name: "Intro to KiCad", starts_at: "2026-10-23T10:00:00+00:00", status: "published", attended: false, paid: false, paid_amount: 0, registered_at: "2026-10-10T08:00:00+00:00" },
  ],
  totals: { registrations: 2, attended: 1, paid: 250 },
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/clubs/info")) return clubInfoFixture;
        if (/\/clubs\/followers\/5\/9$/.test(path)) return profile;
        if (/\/clubs\/followers\/5\/404$/.test(path)) throw new Error("Not Found");
        if (/\/clubs\/followers\/5\/77$/.test(path)) throw new Error("Not a follower of this club");
        throw new Error(`unstubbed GET ${path}`);
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { FollowerProfileView } = await import("./components/follower-profile");

describe("follower profile", () => {
  it("shows who they are, what they did with the club, and the contact they gave", async () => {
    render(<FollowerProfileView userId={9} />);
    expect(await screen.findByRole("heading", { name: "Ananya Iyer" })).toBeInTheDocument();
    expect(screen.getByText(/COEP Technological University/)).toBeInTheDocument();
    expect(screen.getByText("Robotics")).toBeInTheDocument();
    expect(screen.getByText("Registrations")).toBeInTheDocument();
    expect(screen.getByText("50% of registrations")).toBeInTheDocument();
    expect(screen.getAllByText("₹250")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Hack Night 04" })).toHaveAttribute("href", "/events/37");
    expect(screen.getByText("Came")).toBeInTheDocument();
    expect(screen.getByText("Did not")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ananya@example.com" })).toHaveAttribute("href", "mailto:ananya@example.com");
    expect(screen.getByRole("link", { name: /All followers/ })).toHaveAttribute("href", "/followers");
  });

  it("tells a server without the route apart from someone who unfollowed", async () => {
    render(<FollowerProfileView userId={404} />);
    expect(await screen.findByText("Could not load this follower")).toBeInTheDocument();
    expect(screen.getByText("Not Found")).toBeInTheDocument();
  });

  it("says so when they are no longer a follower", async () => {
    render(<FollowerProfileView userId={77} />);
    expect(await screen.findByText("Not a follower of your club")).toBeInTheDocument();
  });
});
