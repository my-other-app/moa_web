import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const analytics: { on: boolean; data: unknown } = {
  on: false,
  data: {
    published: true, days: 30,
    link: { id: "w1", code: "webs1te9", short_url: "https://api.myotherapp.in/l/webs1te9", destination: "https://events.myotherapp.in/clubs/circuit-society?ref=webs1te9" },
    visits: 120, visitors: 96, signups: 9, came: 4, follows: 0, rate: 7.5,
    deltas: { visits: 20, signups: null },
    series: [{ day: "2026-10-15", visits: 70, signups: 4 }, { day: "2026-10-16", visits: 50, signups: 5 }],
    sources: [
      { kind: "website", link_id: "w1", name: "Found the site on their own", visits: 80, signups: 5, rate: 6.3 },
      { kind: "link", link_id: "l2", name: "Instagram bio", visits: 40, signups: 4, rate: 10 },
    ],
    referrers: [{ referrer: "Google", visits: 50 }, { referrer: "Direct · app or typed", visits: 30 }],
    devices: [{ device: "phone", visits: 90 }, { device: "desktop", visits: 30 }],
    events: [{ event_id: 12, name: "Hack Night 04", signups: 9, came: 4 }],
  },
};

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
        if (path.includes("/clubs/site/analytics")) {
          if (!analytics.on) throw new Error("Not Found");
          return analytics.data;
        }
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
  analytics.on = false;
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

  it("shows what the published site brought: visits, sources, sign-ups and its own short link", async () => {
    analytics.on = true;
    render(<SitePage />);
    expect(await screen.findByText("How the site is doing")).toBeInTheDocument();
    expect(await screen.findByText("Found the site on their own")).toBeInTheDocument();
    expect(screen.getByText("Instagram bio")).toBeInTheDocument();
    expect(screen.getByText("Hack Night 04")).toBeInTheDocument();
    expect(screen.getByText(/9 signed up · 4 came/)).toBeInTheDocument();
    expect(screen.getByText("api.myotherapp.in/l/webs1te9")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "7 days" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/clubs/site/analytics?days=7"))).toBe(true));
  });

  it("keeps the analytics away when the server has none", async () => {
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    await waitFor(() => expect(calls.some((c) => c.path.includes("/analytics"))).toBe(true));
    expect(screen.queryByText("How the site is doing")).not.toBeInTheDocument();
  });
});
