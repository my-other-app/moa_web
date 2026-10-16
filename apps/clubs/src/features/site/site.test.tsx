import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];

const site = {
  template: "launchpad", theme: "light", font: "dm_sans", headline: null, subline: null,
  default_headline: "Build things that think.", default_subline: "Hack nights, build weekends and competitions for Pune's makers.",
  sections: { hero: true, upcoming: true, about: true, past: true, team: true, partners: true, follow: true, contact: true },
  available: { hero: true, upcoming: true, about: true, past: true, team: false, partners: true, follow: true, contact: true },
  published_at: "2026-10-02T09:00:00Z", stale: false, url: "https://events.myotherapp.in/clubs/circuit-society", slug: "circuit-society",
  templates: [{ key: "launchpad", name: "Launchpad", blurb: "Big centred hero, event cards" }, { key: "chapter", name: "Chapter", blurb: "Editorial, left-aligned list" }, { key: "campus", name: "Campus", blurb: "Cover photo and gallery grid" }, { key: "arena", name: "Arena", blurb: "Countdown hero for competitions" }],
  fonts: [{ key: "dm_sans", name: "DM Sans" }, { key: "inter", name: "Inter" }],
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/clubs/site")) return site;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/preview")) return { html: `<html><body><h1>${(body as { headline?: string }).headline ?? site.default_headline}</h1></body></html>` };
        if (path.endsWith("/publish")) return { ...site, published_at: "2026-10-16T10:00:00Z", stale: false };
        return site;
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return { ...site, ...(body as object), stale: true };
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { SitePage } = await import("./components/site-page");

beforeEach(() => {
  calls.length = 0;
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
});

describe("the website page", () => {
  it("reads the live state, the templates, the sections with what is empty, and previews", async () => {
    render(<SitePage />);
    expect(await screen.findByText(/Live · updated/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Launchpad/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Arena/ })).toBeInTheDocument();
    expect(screen.getByText("Add people on Club profile")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Build things that think.")).toBeInTheDocument();
    expect(screen.getByText("events.myotherapp.in/clubs/circuit-society", { selector: "p" })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/clubs/site/preview"))).toBe(true));
    expect(await screen.findByTitle("Site preview")).toHaveAttribute("srcdoc", expect.stringContaining("Build things that think."));
  });

  it("re-previews as the headline is typed, says the live page is behind, and updates the site", async () => {
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    fireEvent.click(screen.getByRole("radio", { name: /Arena/ }));
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Make things that think" } });
    expect(await screen.findByText(/The live page is from/)).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith("/preview")).at(-1)).toMatchObject({ body: { template: "arena", headline: "Make things that think" } }), { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: /Update site/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/v1/clubs/site", body: { template: "arena", headline: "Make things that think" } }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/publish"))).toBeTruthy());
  });

  it("switches a section off and copies the link", async () => {
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    fireEvent.click(screen.getByRole("switch", { name: "Past events" }));
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ body: { sections: expect.objectContaining({ past: false }) } }));
    fireEvent.click(screen.getByRole("button", { name: /Copy site link/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://events.myotherapp.in/clubs/circuit-society"));
  });
});
