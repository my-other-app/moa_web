import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

/**
 * The Avatars page: the set people pick from during onboarding, shown to an
 * admin to look at. It is read-only -- there is no endpoint to change the
 * set from here -- so it must not offer anything that looks like it could.
 */
const gets: string[] = [];
let reply: () => unknown = () => [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        gets.push(path);
        if (path === "/api/v1/user/avatar/list") return reply();
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { default: AvatarsPage } = await import("@/app/(dashboard)/avatars/page");

const image = (name: string) => ({
  thumbnail: `https://cdn.test/avatars/${name}.thumbnail.png`,
  medium: `https://cdn.test/avatars/${name}.medium.png`,
  original: `https://cdn.test/avatars/${name}.png`,
});

beforeEach(() => {
  gets.length = 0;
  reply = () => [
    { id: 1, name: "Fox", image: image("fox") },
    { id: 2, name: "Owl", image: { thumbnail: "https://cdn.test/avatars/owl.thumbnail.png" } },
    { id: 3, name: "Blank", image: null },
  ];
});

describe("the avatars page", () => {
  it("says what the set is, and asks for it once", async () => {
    render(<AvatarsPage />);
    expect(screen.getByRole("heading", { name: "Avatars" })).toBeInTheDocument();
    expect(screen.getByText("The avatar set users pick from during onboarding.")).toBeInTheDocument();
    await screen.findByText("Fox");
    expect(gets).toEqual(["/api/v1/user/avatar/list"]);
  });

  it("shows every avatar by name, at the medium size where there is one", async () => {
    render(<AvatarsPage />);
    expect(await screen.findByRole("img", { name: "Fox" })).toHaveAttribute("src", image("fox").medium);
    // Only a thumbnail: that is what is shown, not a broken medium.
    expect(screen.getByRole("img", { name: "Owl" })).toHaveAttribute("src", "https://cdn.test/avatars/owl.thumbnail.png");
  });

  it("keeps an avatar with no picture in the set, by its name, without a broken image", async () => {
    render(<AvatarsPage />);
    expect(await screen.findByText("Blank")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Blank" })).toBeNull();
  });

  it("reads the list whether the API sends a bare array or a page of items", async () => {
    reply = () => ({ items: [{ id: 4, name: "Cat", image: image("cat") }], total: 1 });
    render(<AvatarsPage />);
    expect(await screen.findByRole("img", { name: "Cat" })).toBeInTheDocument();
  });

  it("offers nothing to change: no buttons, no links, no fields", async () => {
    render(<AvatarsPage />);
    await screen.findByText("Fox");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("says so when there are no avatars yet", async () => {
    reply = () => [];
    render(<AvatarsPage />);
    expect(await screen.findByText("No avatars yet")).toBeInTheDocument();
  });

  it("says the list could not be loaded when the request fails", async () => {
    reply = () => {
      throw new Error("Internal server error");
    };
    render(<AvatarsPage />);
    expect(await screen.findByText("Could not load avatars")).toBeInTheDocument();
    expect(screen.getByText("The avatar list could not be fetched. Try reloading the page.")).toBeInTheDocument();
  });
});
