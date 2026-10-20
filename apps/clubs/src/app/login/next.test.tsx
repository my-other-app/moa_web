import { describe, expect, it, vi } from "vitest";

/**
 * Where sign-in sends someone back to: `?next=` when it is a path on this
 * site, never another site. An assistant's confirm link goes through here
 * (/login?next=/confirm/{token}), so it must survive the round trip, and a
 * crafted one must not bounce anyone elsewhere.
 */
const redirect = vi.fn((to: string) => {
  throw new Error(`redirect ${to}`);
});
const session = { current: { user_type: "club" } as null | { user_type: string } };

vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirect(to),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@moa/auth/server", () => ({ getSessionQuietly: vi.fn(async () => session.current) }));

const { safeNext } = await import("@moa/app-kit");
const { default: LoginPage } = await import("./page");

const TOKEN = "moa_pa_Qx7b2kTzLr0vWm9yNe4pHs6uJc1aXd8gFo3iKt5qZbE";

describe("safeNext", () => {
  it("keeps a path on this site, with its query and hash", () => {
    expect(safeNext(`/confirm/${TOKEN}`)).toBe(`/confirm/${TOKEN}`);
    expect(safeNext("/events/37?tab=live#feedback")).toBe("/events/37?tab=live#feedback");
  });

  it.each([
    ["another site", "https://evil.example/confirm"],
    ["a protocol-relative address", "//evil.example"],
    ["a backslash browsers read as a slash", "/\\evil.example"],
    ["a tab browsers drop", "/\t/evil.example"],
    ["a newline browsers drop", "/\n/evil.example"],
    ["a javascript: address", "javascript:alert(1)"],
    ["a relative path", "events/37"],
    ["nothing", ""],
  ])("refuses %s", (_name, next) => {
    expect(safeNext(next, "/")).toBe("/");
  });

  it("falls back to the given place", () => {
    expect(safeNext(null, "/events")).toBe("/events");
  });
});

describe("the sign-in page, already signed in", () => {
  it("goes back to the confirm page it was sent from", async () => {
    await expect(LoginPage({ searchParams: Promise.resolve({ next: `/confirm/${TOKEN}` }) })).rejects.toThrow(`redirect /confirm/${TOKEN}`);
  });

  it("goes to the dashboard instead of another site", async () => {
    await expect(LoginPage({ searchParams: Promise.resolve({ next: "//evil.example/steal" }) })).rejects.toThrow("redirect /");
    await expect(LoginPage({ searchParams: Promise.resolve({ next: "/\\evil.example" }) })).rejects.toThrow(/^redirect \/$/);
    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(/^redirect \/$/);
  });
});
