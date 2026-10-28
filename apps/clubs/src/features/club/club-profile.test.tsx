import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import clubInfoFixture from "../__fixtures__/club-info.json";
import interestsFixture from "../__fixtures__/interests.json";
import orgsFixture from "../__fixtures__/orgs.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
/** What PUT /clubs/update does: resolve, or throw what the server said. */
let putAnswer: () => unknown = () => undefined;
let club = {
  ...clubInfoFixture,
  tagline: "Trivandrum's maker collective",
  partners: [
    { id: 1, name: "Kinetic Labs", role: "Industry partner", since: 2025, sort_order: 0 },
    { id: 2, name: "COEP Makerspace", role: "Lab and equipment partner", since: 2024, sort_order: 1 },
  ],
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.includes("/clubs/info")) return club;
        if (path.includes("/interests/list")) return interestsFixture;
        if (path.includes("/orgs/list")) return orgsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return putAnswer();
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        return { id: 9, name: "GDG Pune", role: "Community partner", since: 2026, sort_order: 2 };
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return { id: 1, ...(body as object), sort_order: 0 };
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubProfilePage } = await import("./components/club-profile-page");

const baseClub = club;
beforeEach(() => {
  calls.length = 0;
  club = baseClub;
  putAnswer = () => undefined;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const putBody = async () => {
  await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
  return calls.find((c) => c.method === "PUT")!.body as FormData;
};

/** The header's Save changes; once something has changed, the bar at the foot has one too. */
const saveButton = async () => (await screen.findAllByRole("button", { name: "Save changes" }))[0]!;
const tones = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => /^btn-(primary|secondary|ghost|quiet|destructive)$/.test(c));

describe("club profile", () => {
  it("shows the club, its handle read-only, its partners, and nothing about follower counts", async () => {
    render(<ClubProfilePage />);
    expect(await screen.findByTestId("club-name")).toHaveTextContent("LetMeGoo");
    expect(screen.queryByDisplayValue("LetMeGoo")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change password/ })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Organisation" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tagline")).toHaveValue("Trivandrum's maker collective");
    expect(screen.getByTestId("club-handle")).toHaveTextContent("letmegoo-33b259");
    expect(screen.queryByDisplayValue("letmegoo-33b259")).not.toBeInTheDocument();
    expect(screen.getByText(/To change the handle, contact support/)).toBeInTheDocument();
    expect(screen.getByLabelText("Kinetic Labs role")).toHaveValue("Industry partner");
    expect(screen.getByLabelText("COEP Makerspace since")).toHaveValue("2024");
    expect(screen.getByRole("button", { name: "Replace logo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cover banner" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All changes saved/ })).toBeDisabled();
    expect(screen.queryByText(/follower count/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/past events/i)).not.toBeInTheDocument();
    for (const name of ["Coding", "UI/UX", "Marketing"]) {
      expect(await screen.findByRole("checkbox", { name: new RegExp(name) })).toBeChecked();
    }
  });

  it("saves the tagline and the brand colour with everything else", async () => {
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    fireEvent.change(screen.getByLabelText("Tagline"), { target: { value: "Pune's student electronics and robotics club" } });
    fireEvent.click(screen.getByRole("button", { name: "Brand colour #2f6fed" }));
    const save = await saveButton();
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.path).toBe("/api/v1/clubs/update");
    const form = put.body as FormData;
    expect(form.get("tagline")).toBe("Pune's student electronics and robotics club");
    expect(form.get("brand_primary")).toBe("#2f6fed");
    // The name is not the club's to change here, and the server refuses one over 20 characters.
    expect(form.get("name")).toBeNull();
    expect(form.get("slug")).toBeNull();
  });

  it("adds a partner, corrects one on blur, and removes one on a second click", async () => {
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    expect(screen.getByRole("button", { name: "Add Kinetic Labs logo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add partner/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Name the partner")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New partner name"), { target: { value: "GDG Pune" } });
    fireEvent.change(screen.getByLabelText("New partner role"), { target: { value: "Community partner" } });
    fireEvent.change(screen.getByLabelText("New partner since"), { target: { value: "2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/api/v1/clubs/partners", body: { name: "GDG Pune", role: "Community partner", since: 2026 } });

    fireEvent.change(screen.getByLabelText("Kinetic Labs role"), { target: { value: "Title sponsor" } });
    fireEvent.blur(screen.getByLabelText("Kinetic Labs role"));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/v1/clubs/partners/1", body: { name: "Kinetic Labs", role: "Title sponsor", since: 2025 } });

    fireEvent.click(screen.getByRole("button", { name: "Remove COEP Makerspace" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm removing COEP Makerspace" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")).toMatchObject({ path: "/api/v1/clubs/partners/2" });
  });
  it("searches for the club's location, pins the place picked, and saves the pin as the club's own", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ features: [{ type: "Feature", geometry: { coordinates: [76.9063, 8.5459] }, properties: { osm_type: "W", osm_id: 9, name: "College of Engineering Trivandrum", city: "Thiruvananthapuram" } }] }),
      })),
    );
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    const location = screen.getByRole("combobox", { name: "Location" });
    expect(location).toHaveValue("Technopark,Tvm");
    fireEvent.change(location, { target: { value: "College of Engineering" } });
    fireEvent.click(await screen.findByRole("option", { name: /College of Engineering Trivandrum/ }));
    expect(location).toHaveValue("College of Engineering Trivandrum");
    expect(screen.getByText("Set by you")).toBeInTheDocument();
    expect(screen.getByTitle("Map of College of Engineering Trivandrum")).toBeInTheDocument();

    fireEvent.click(await saveButton());
    const form = await putBody();
    expect(form.get("location_name")).toBe("College of Engineering Trivandrum");
    expect(form.get("lat")).toBe("8.5459");
    expect(form.get("lng")).toBe("76.9063");
    expect(form.get("clear_point")).toBeNull();
    // The link the club saved earlier still goes, as it always has.
    expect(form.get("location_link")).toBe("Test Person");
  });

  it("shows where a saved pin came from, and removing it sends clear_point", async () => {
    club = { ...baseClub, lat: 8.5581, lng: 76.8816, geo_source: "geocoded" } as typeof baseClub;
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    expect(screen.getByText("Found from the venue name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove pin" }));
    fireEvent.click(await saveButton());
    const form = await putBody();
    expect(form.get("clear_point")).toBe("true");
    expect(form.get("lat")).toBeNull();
  });

  it("picks interests by topic, removes one from the picked chips, and saves the lot", async () => {
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    const creative = await screen.findByRole("group", { name: /Creative/ });
    fireEvent.click(within(creative).getByRole("checkbox", { name: /Photography/ }));
    expect(screen.getByText("4 interests picked")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Marketing" }));
    expect(screen.getByRole("checkbox", { name: "Marketing" })).not.toBeChecked();
    fireEvent.click(await saveButton());
    const form = await putBody();
    expect(form.get("interest_ids")).toBe("6,7,21");
  });
  it("makes Save changes one primary button once something changes, in the header and in a bar at the foot", async () => {
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    const idle = screen.getByRole("button", { name: /All changes saved/ });
    expect(tones(idle)).toEqual(["btn-secondary"]);
    expect(screen.queryByRole("region", { name: "Save the profile" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tagline"), { target: { value: "Robots, after class" } });
    const saves = await screen.findAllByRole("button", { name: "Save changes" });
    expect(saves).toHaveLength(2);
    // Both tones at once put the primary's white text on the secondary's white fill.
    for (const b of saves) expect(tones(b)).toEqual(["btn-primary"]);
    const bar = screen.getByRole("region", { name: "Save the profile" });
    expect(within(bar).getByRole("status")).toHaveTextContent("You have unsaved changes.");
  });

  it("says it is saving, then that it saved", async () => {
    let release: () => void = () => {};
    putAnswer = () => new Promise<void>((r) => (release = r));
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    fireEvent.change(screen.getByLabelText("Tagline"), { target: { value: "Robots, after class" } });
    fireEvent.click(await saveButton());

    expect(await screen.findAllByRole("button", { name: /Saving…/ })).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("Saving your changes…");
    release();
    expect(await screen.findByRole("button", { name: /All changes saved/ })).toBeDisabled();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Save the profile" })).not.toBeInTheDocument());
  });

  it("says why when the server refuses, keeps the edit, and lets Save try again", async () => {
    putAnswer = () => {
      throw new ApiError({ status: 500, message: "The server could not save the profile just now." });
    };
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    fireEvent.change(screen.getByLabelText("Tagline"), { target: { value: "Robots, after class" } });
    fireEvent.click(await saveButton());

    expect(await screen.findByText("Not saved: The server could not save the profile just now.")).toBeInTheDocument();
    expect(screen.getByLabelText("Tagline")).toHaveValue("Robots, after class");
    expect(await saveButton()).toBeEnabled();

    putAnswer = () => undefined;
    fireEvent.click(await saveButton());
    expect(await screen.findByRole("button", { name: /All changes saved/ })).toBeDisabled();
  });

  it("does not send a field the server would refuse, and says so", async () => {
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    fireEvent.change(screen.getByLabelText("Instagram"), { target: { value: "instagram.com/club" } });
    fireEvent.click(await saveButton());

    expect(await screen.findByText("Enter a full URL")).toBeInTheDocument();
    expect(screen.getByText("Not saved: fix the marked field above.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);

    // Fixed, the old reason goes; saved, it is said.
    fireEvent.change(screen.getByLabelText("Instagram"), { target: { value: "https://instagram.com/club" } });
    expect(screen.queryByText("Not saved: fix the marked field above.")).not.toBeInTheDocument();
    fireEvent.click(await saveButton());
    expect(await screen.findByRole("button", { name: /All changes saved/ })).toBeDisabled();
    expect((await putBody()).get("instagram")).toBe("https://instagram.com/club");
  });
});
