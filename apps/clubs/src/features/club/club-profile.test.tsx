import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import clubInfoFixture from "../__fixtures__/club-info.json";
import interestsFixture from "../__fixtures__/interests.json";
import orgsFixture from "../__fixtures__/orgs.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const club = {
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

beforeEach(() => {
  calls.length = 0;
});

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
    const save = await screen.findByRole("button", { name: "Save changes" });
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.path).toBe("/api/v1/clubs/update");
    const form = put.body as FormData;
    expect(form.get("tagline")).toBe("Pune's student electronics and robotics club");
    expect(form.get("brand_primary")).toBe("#2f6fed");
    expect(form.get("name")).toBe("LetMeGoo");
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
});
