import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import clubInfoFixture from "../__fixtures__/club-info.json";
import interestsFixture from "../__fixtures__/interests.json";
import orgsFixture from "../__fixtures__/orgs.json";

/**
 * The year-round partners' logos and the club's team on the profile page.
 *
 * Both upload a picture the moment it is picked, and both add a row in two
 * steps (create, then the picture), so the order and the address of each
 * request are what these pin down, along with the refusals a club sees.
 */
type Call = { method: string; path: string; body?: unknown };
const calls: Call[] = [];

const KINETIC = { id: 1, name: "Kinetic Labs", role: "Industry partner", since: 2025, sort_order: 0 };
const ANJALI = { id: 31, name: "Anjali Menon", role: "Lead", instagram: "anjali.m", linkedin: null, x: null, website: null, sort_order: 0 };

let club: Record<string, unknown> = { ...clubInfoFixture, partners: [KINETIC], team: [ANJALI] };
let failNext: { method: string; error: Error } | null = null;

const record = (method: string, path: string, body?: unknown) => {
  calls.push({ method, path, body });
  if (failNext && failNext.method === method) {
    const { error } = failNext;
    failNext = null;
    throw error;
  }
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/clubs/info")) return club;
        if (path.includes("/interests/list")) return interestsFixture;
        if (path.includes("/orgs/list")) return orgsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        record("POST", path, body);
        if (path === "/api/v1/clubs/team") return { id: 77, ...(body as object), sort_order: 1 };
        return { id: 9, ...(body as object), sort_order: 2 };
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        record("PATCH", path, body);
        return { id: Number(path.split("/").pop()), ...(body as object), sort_order: 0 };
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        record("PUT", path, body);
        const id = Number(path.split("/").at(-2));
        return path.includes("/team/") ? { ...ANJALI, id } : { ...KINETIC, id };
      }),
      del: vi.fn(async (path: string) => {
        record("DELETE", path);
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubProfilePage } = await import("./components/club-profile-page");

const png = (name = "logo.png", bytes = 1024) => new File([new Uint8Array(bytes)], name, { type: "image/png" });

/*
 * The visible button opens a hidden file input by calling its click(). jsdom
 * has no file chooser, so the click is caught and the picked file is then
 * handed to that same input, as the browser would after the dialog closes.
 */
let opened: HTMLInputElement | null = null;
const pick = (button: HTMLElement, file: File) => {
  opened = null;
  fireEvent.click(button);
  expect(opened, "the button should open a file picker").not.toBeNull();
  fireEvent.change(opened!, { target: { files: [file] } });
};

const of = (method: string) => calls.filter((c) => c.method === method);

beforeEach(() => {
  calls.length = 0;
  failNext = null;
  club = { ...clubInfoFixture, partners: [KINETIC], team: [ANJALI] };
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
    if (this.type === "file") opened = this;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("a partner's logo", () => {
  it("uploads the moment it is picked, to that partner, as the logo field", async () => {
    const success = vi.spyOn(toast, "success");
    render(<ClubProfilePage />);
    const file = png("kinetic.png");
    pick(await screen.findByRole("button", { name: "Add Kinetic Labs logo" }), file);

    await waitFor(() => expect(of("PUT")).toHaveLength(1));
    const [put] = of("PUT");
    expect(put!.path).toBe("/api/v1/clubs/partners/1/logo");
    expect((put!.body as FormData).get("logo")).toBe(file);
    await waitFor(() => expect(success).toHaveBeenCalledWith("Logo updated"));
  });

  it("refuses a file that is not an image, and one over 5 MB, without sending either", async () => {
    const error = vi.spyOn(toast, "error");
    render(<ClubProfilePage />);
    const button = await screen.findByRole("button", { name: "Add Kinetic Labs logo" });

    pick(button, new File(["%PDF"], "deck.pdf", { type: "application/pdf" }));
    expect(error).toHaveBeenCalledWith("Choose an image file for the partner logo");

    pick(button, png("huge.png", 5 * 1024 * 1024 + 1));
    expect(error).toHaveBeenCalledWith("The partner logo must be under 5 MB");

    expect(of("PUT")).toHaveLength(0);
  });

  it("previews the picked logo while it uploads", async () => {
    render(<ClubProfilePage />);
    pick(await screen.findByRole("button", { name: "Add Kinetic Labs logo" }), png());
    expect(await screen.findByRole("button", { name: "Replace Kinetic Labs logo" })).toBeInTheDocument();
  });

  it("says what the server said when the upload is refused, and takes the preview down", async () => {
    const error = vi.spyOn(toast, "error");
    failNext = { method: "PUT", error: new ApiError({ status: 413, message: "That image is too large to process" }) };
    render(<ClubProfilePage />);
    pick(await screen.findByRole("button", { name: "Add Kinetic Labs logo" }), png());
    await waitFor(() => expect(error).toHaveBeenCalledWith("That image is too large to process"));
    // A refused logo must not stay up as if it were saved.
    expect(await screen.findByRole("button", { name: "Add Kinetic Labs logo" })).toBeInTheDocument();
  });

  it("goes up with a new partner once the partner exists, addressed to the new id", async () => {
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    fireEvent.click(screen.getByRole("button", { name: /Add partner/ }));
    const file = png("gdg.png");
    pick(screen.getByRole("button", { name: "Add the new partner's logo" }), file);
    // Picking the logo alone sends nothing: there is no partner to attach it to yet.
    expect(calls).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("New partner name"), { target: { value: "GDG Pune" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(of("PUT")).toHaveLength(1));
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /api/v1/clubs/partners", "PUT /api/v1/clubs/partners/9/logo"]);
    expect((of("PUT")[0]!.body as FormData).get("logo")).toBe(file);
    // The row closes once both have landed.
    await waitFor(() => expect(screen.queryByLabelText("New partner name")).not.toBeInTheDocument());
  });

  it("keeps the new partner's row when the partner is refused, and sends no logo", async () => {
    const error = vi.spyOn(toast, "error");
    failNext = { method: "POST", error: new ApiError({ status: 409, message: "You already list this partner" }) };
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    fireEvent.click(screen.getByRole("button", { name: /Add partner/ }));
    pick(screen.getByRole("button", { name: "Add the new partner's logo" }), png());
    fireEvent.change(screen.getByLabelText("New partner name"), { target: { value: "Kinetic Labs" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(error).toHaveBeenCalledWith("You already list this partner"));
    expect(screen.getByLabelText("New partner name")).toHaveValue("Kinetic Labs");
    expect(of("PUT")).toHaveLength(0);
  });

  it("closes the row once the partner exists even if its logo is refused, so it is not added twice", async () => {
    const error = vi.spyOn(toast, "error");
    failNext = { method: "PUT", error: new ApiError({ status: 415, message: "Unsupported image" }) };
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    fireEvent.click(screen.getByRole("button", { name: /Add partner/ }));
    pick(screen.getByRole("button", { name: "Add the new partner's logo" }), png());
    fireEvent.change(screen.getByLabelText("New partner name"), { target: { value: "GDG Pune" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(error).toHaveBeenCalledWith("Unsupported image"));
    await waitFor(() => expect(screen.queryByLabelText("New partner name")).not.toBeInTheDocument());
    expect(of("POST")).toHaveLength(1);
  });
});

describe("the team", () => {
  it("says there is nobody yet on a club without a team", async () => {
    club = { ...club, team: [] };
    render(<ClubProfilePage />);
    expect(await screen.findByText("Nobody on the team yet.")).toBeInTheDocument();
  });

  it("shows each member with links built from the handles they gave", async () => {
    render(<ClubProfilePage />);
    expect(await screen.findByLabelText("Anjali Menon name")).toHaveValue("Anjali Menon");
    expect(screen.getByLabelText("Anjali Menon role")).toHaveValue("Lead");
    expect(screen.getByRole("link", { name: "Anjali Menon on Instagram" })).toHaveAttribute("href", "https://instagram.com/anjali.m");
    // No link for a network they left empty.
    expect(screen.queryByRole("link", { name: "Anjali Menon on LinkedIn" })).not.toBeInTheDocument();
  });

  it("adds a person with their photo: the member first, then the photo to their new id", async () => {
    const success = vi.spyOn(toast, "success");
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    fireEvent.click(screen.getByRole("button", { name: /Add a person/ }));
    const file = png("rahul.png");
    pick(screen.getByRole("button", { name: "Add a photo" }), file);
    fireEvent.change(screen.getByLabelText("New member name"), { target: { value: "Rahul Nair" } });
    fireEvent.change(screen.getByLabelText("New member role"), { target: { value: "Design" } });
    fireEvent.change(screen.getByLabelText("New member Instagram"), { target: { value: "@rahul.n" } });
    const row = screen.getByLabelText("New member name").closest("div")!.parentElement!;
    fireEvent.click(within(row).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(of("PUT")).toHaveLength(1));
    expect(of("POST")[0]).toEqual({
      method: "POST",
      path: "/api/v1/clubs/team",
      // Empty networks go as null, not as empty strings the page would link to.
      body: { name: "Rahul Nair", role: "Design", instagram: "@rahul.n", linkedin: null, x: null, website: null },
    });
    expect(of("PUT")[0]!.path).toBe("/api/v1/clubs/team/77/photo");
    expect((of("PUT")[0]!.body as FormData).get("photo")).toBe(file);
    expect(success).toHaveBeenCalledWith("Added to the team");
    await waitFor(() => expect(screen.queryByLabelText("New member name")).not.toBeInTheDocument());
  });

  it("will not add a person without a name", async () => {
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    fireEvent.click(screen.getByRole("button", { name: /Add a person/ }));
    fireEvent.change(screen.getByLabelText("New member role"), { target: { value: "Design" } });
    const row = screen.getByLabelText("New member name").closest("div")!.parentElement!;
    fireEvent.click(within(row).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Name the person")).toBeInTheDocument();
    expect(of("POST")).toHaveLength(0);
  });

  it("keeps the new row and its words when the server refuses the person", async () => {
    const error = vi.spyOn(toast, "error");
    failNext = { method: "POST", error: new ApiError({ status: 422, message: "The team is full" }) };
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    fireEvent.click(screen.getByRole("button", { name: /Add a person/ }));
    fireEvent.change(screen.getByLabelText("New member name"), { target: { value: "Rahul Nair" } });
    const row = screen.getByLabelText("New member name").closest("div")!.parentElement!;
    fireEvent.click(within(row).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(error).toHaveBeenCalledWith("The team is full"));
    expect(screen.getByLabelText("New member name")).toHaveValue("Rahul Nair");
    expect(of("PUT")).toHaveLength(0);
  });

  it("closes the row once the person exists even if their photo is refused, so they are not added twice", async () => {
    const error = vi.spyOn(toast, "error");
    failNext = { method: "PUT", error: new ApiError({ status: 415, message: "Unsupported image" }) };
    render(<ClubProfilePage />);
    await screen.findByTestId("club-name");
    fireEvent.click(screen.getByRole("button", { name: /Add a person/ }));
    pick(screen.getByRole("button", { name: "Add a photo" }), png());
    fireEvent.change(screen.getByLabelText("New member name"), { target: { value: "Rahul Nair" } });
    const row = screen.getByLabelText("New member name").closest("div")!.parentElement!;
    fireEvent.click(within(row).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(error).toHaveBeenCalledWith("Unsupported image"));
    await waitFor(() => expect(screen.queryByLabelText("New member name")).not.toBeInTheDocument());
    expect(of("POST")).toHaveLength(1);
  });

  it("saves a corrected detail when the field is left, and nothing when it did not change", async () => {
    render(<ClubProfilePage />);
    const role = await screen.findByLabelText("Anjali Menon role");
    fireEvent.blur(role);
    expect(of("PATCH")).toHaveLength(0);

    fireEvent.change(role, { target: { value: "President" } });
    fireEvent.change(screen.getByLabelText("Anjali Menon LinkedIn"), { target: { value: "linkedin.com/in/anjali" } });
    fireEvent.blur(role);
    await waitFor(() => expect(of("PATCH")).toHaveLength(1));
    expect(of("PATCH")[0]).toEqual({
      method: "PATCH",
      path: "/api/v1/clubs/team/31",
      body: { name: "Anjali Menon", role: "President", instagram: "anjali.m", linkedin: "linkedin.com/in/anjali", x: null, website: null },
    });
  });

  it("will not save a member whose name was cleared", async () => {
    const error = vi.spyOn(toast, "error");
    render(<ClubProfilePage />);
    const name = await screen.findByLabelText("Anjali Menon name");
    fireEvent.change(name, { target: { value: "  " } });
    fireEvent.blur(name);
    expect(error).toHaveBeenCalledWith("Name the person");
    expect(of("PATCH")).toHaveLength(0);
  });

  it("replaces a member's photo the moment one is picked", async () => {
    render(<ClubProfilePage />);
    const file = png("anjali.png");
    pick(await screen.findByRole("button", { name: "Add Anjali Menon's photo" }), file);
    await waitFor(() => expect(of("PUT")).toHaveLength(1));
    expect(of("PUT")[0]!.path).toBe("/api/v1/clubs/team/31/photo");
    expect((of("PUT")[0]!.body as FormData).get("photo")).toBe(file);
    expect(await screen.findByRole("button", { name: "Replace Anjali Menon's photo" })).toBeInTheDocument();
  });

  it("takes a refused photo down again, with the server's words", async () => {
    const error = vi.spyOn(toast, "error");
    failNext = { method: "PUT", error: new ApiError({ status: 415, message: "Unsupported image" }) };
    render(<ClubProfilePage />);
    pick(await screen.findByRole("button", { name: "Add Anjali Menon's photo" }), png());
    await waitFor(() => expect(error).toHaveBeenCalledWith("Unsupported image"));
    expect(await screen.findByRole("button", { name: "Add Anjali Menon's photo" })).toBeInTheDocument();
  });

  it("removes a member only on the second, confirming click", async () => {
    const success = vi.spyOn(toast, "success");
    render(<ClubProfilePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Anjali Menon" }));
    expect(of("DELETE")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm removing Anjali Menon" }));
    await waitFor(() => expect(of("DELETE")).toEqual([{ method: "DELETE", path: "/api/v1/clubs/team/31", body: undefined }]));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Removed from the team"));
  });
});
