import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import clubInfoFixture from "../__fixtures__/club-info.json";
import interestsFixture from "../__fixtures__/interests.json";
import orgsFixture from "../__fixtures__/orgs.json";

/**
 * Both profile screens render live data through hooks, so they are exercised
 * against the real schemas with the API stubbed at the client boundary. Same
 * reason as `renders.test.tsx`: tsc cannot see a component that throws on
 * render, and three of them reached production before these existed.
 */
vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/clubs/info")) return clubInfoFixture;
        if (path.includes("/interests/list")) return interestsFixture;
        if (path.includes("/orgs/list")) return orgsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(),
      post: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubProfileView } = await import("./components/club-profile-view");
const { ClubProfileForm } = await import("./components/club-profile-form");

describe("club profile view", () => {
  it("renders without throwing", () => {
    expect(() => render(<ClubProfileView />)).not.toThrow();
  });

  it("shows the club and its focus areas as chips", async () => {
    render(<ClubProfileView />);
    expect(await screen.findByText("LetMeGoo")).toBeInTheDocument();
    for (const name of ["Coding", "UI/UX", "Marketing"]) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    }
  });

  it("shows the two fact cards, falling back when no org is linked", async () => {
    render(<ClubProfileView />);
    expect(await screen.findByText("College")).toBeInTheDocument();
    expect(await screen.findByText("Location")).toBeInTheDocument();
    // The fixture club has org: null.
    expect(await screen.findByText("Not linked")).toBeInTheDocument();
    expect(await screen.findByText("Technopark,Tvm")).toBeInTheDocument();
  });

  it("offers both header actions", async () => {
    render(<ClubProfileView />);
    expect(await screen.findByRole("link", { name: "Edit Profile" })).toHaveAttribute(
      "href",
      "/profile/edit"
    );
    expect(
      await screen.findByRole("button", { name: "Change password" })
    ).toBeInTheDocument();
  });

  it("prompts for links when the club has none rather than listing blanks", async () => {
    // Every social in the fixture is null.
    render(<ClubProfileView />);
    expect(await screen.findByText(/No links yet/)).toBeInTheDocument();
  });
});

describe("club profile form", () => {
  it("renders without throwing", () => {
    expect(() => render(<ClubProfileForm />)).not.toThrow();
  });

  it("seeds the text fields from the club", async () => {
    render(<ClubProfileForm />);
    expect(await screen.findByLabelText("Club Name")).toHaveValue("LetMeGoo");
    expect(await screen.findByLabelText("Club Location")).toHaveValue("Technopark,Tvm");
    expect(await screen.findByLabelText("Contact Email")).toHaveValue(
      "club@example.com"
    );
  });

  it("pre-selects the club's existing focus areas", async () => {
    render(<ClubProfileForm />);
    // Ids 6, 7 and 10 in the club fixture; the picker groups them by category.
    for (const name of ["Coding", "UI/UX", "Marketing"]) {
      expect(await screen.findByRole("checkbox", { name: new RegExp(name) })).toBeChecked();
    }
    // Present but not selected.
    expect(
      await screen.findByRole("checkbox", { name: /Photography/ })
    ).not.toBeChecked();
  });

  it("renders every section the design defines", async () => {
    render(<ClubProfileForm />);
    for (const heading of [
      "Basic Information",
      "Links to connect",
      "Select Areas Related to the Club",
    ]) {
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("keeps a logo control for a club that already has one", async () => {
    render(<ClubProfileForm />);
    expect(
      await screen.findByRole("button", { name: "Change club logo" })
    ).toBeInTheDocument();
  });
});
