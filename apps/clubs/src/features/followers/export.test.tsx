import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

/**
 * Exporting followers is a download link through the gateway (the session
 * cookie stays first-party), so the file is whatever the link asks for: the
 * whole list, or the segment on screen.
 */
let qs = "";
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/followers", useSearchParams: () => new URLSearchParams(qs) };
});

const segments = { all: 3, new: 0, regulars: 1, once: 1, never: 1, quiet: 1 };
vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/followers/insights")) return null;
        if (path.endsWith("/followers/list")) return { items: [], total: 0, limit: 24, offset: 0, counts: segments };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { FollowersPage } = await import("./components/followers-page");

beforeEach(() => {
  qs = "";
});

const EXPORT = "/api/gateway/api/v1/clubs/followers/export.csv";

describe("exporting followers", () => {
  it("exports everyone when no segment is picked, as a download", async () => {
    render(<FollowersPage />);
    const link = await screen.findByRole("link", { name: "Export all" });
    expect(link).toHaveAttribute("href", `${EXPORT}?segment=all`);
    expect(link).toHaveAttribute("download");
  });

  it.each([
    ["quiet", "Export gone quiet"],
    ["regulars", "Export regulars"],
    ["never", "Export never came"],
    ["new", "Export new"],
  ])("exports only the %s segment on screen, and says so on the button", async (segment, label) => {
    qs = `segment=${segment}`;
    render(<FollowersPage />);
    expect(await screen.findByRole("link", { name: label })).toHaveAttribute("href", `${EXPORT}?segment=${segment}`);
  });

  it("falls back to everyone for a segment it does not know, rather than asking the API for it", async () => {
    qs = "segment=vip";
    render(<FollowersPage />);
    expect(await screen.findByRole("link", { name: "Export all" })).toHaveAttribute("href", `${EXPORT}?segment=all`);
  });
});
