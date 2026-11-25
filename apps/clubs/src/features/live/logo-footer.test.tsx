import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

/**
 * The logo strip along the big screen's foot (as on the games venue
 * screen): the host club and the event's sponsors and partners, on the
 * themed stage and on the screen's own look (the stage draws both while the
 * strip shows); gone when there is nothing to show or the organiser turned
 * it off, and then the old screen is as it was.
 */

const EVENT = { id: 37, name: "Space Night", slug: "space-night", status: "live", status_clock: true, poster: null, event_datetime: "2026-11-29T13:00:00Z", club: { id: 3, name: "Astro Club", slug: "astro", logo: null } };
const state: { screen: Record<string, unknown> } = { screen: {} };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/events/37/live/screen") return state.screen;
        if (path === "/api/v1/events/info/37") return EVENT;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,AA==") } }));

const { render } = await import("@/test/render");
const { ScreenPage } = await import("./components/screen-page");
const { logoFooterOf } = await import("./stage/room");

const CONTROL = { mode: "auto", results: "live", ticker: false, idle_slides: [], slide_seconds: 12, wall_size: 6, logo_footer: true };
const CLUB = { name: "Astro Club", logo_url: "https://cdn.test/club.png" };
const PARTNERS = [
  { name: "Rocket Co", logo_url: "https://cdn.test/rocket.png", kind: "sponsor", label: "Title" },
  { name: "Star Labs", logo_url: "https://cdn.test/star.png", kind: "partner", label: null },
];
const base = (over: Record<string, unknown> = {}) => ({
  event: { id: 37, name: "Space Night" },
  pinned: { id: "p1", text: "When is the next launch?", author_name: "Nila", votes: 4, pinned: true, status: "approved", created_at: "2026-11-28T10:00:00Z" },
  board: [],
  poll: null,
  quiz: null,
  update: null,
  theme: null,
  theme_custom: false,
  control: CONTROL,
  shows: "qa",
  club: CLUB,
  partners: PARTNERS,
  ...over,
});

beforeEach(() => {
  state.screen = base();
});

describe("which logos the strip shows", () => {
  it("groups the hosts, then the partners by label (or kind), in order", () => {
    const got = logoFooterOf(
      base({
        cohosts: [{ name: "Co Club", logo_url: "https://cdn.test/co.png" }],
        partners: [
          ...PARTNERS,
          { name: "Uni", logo_url: "https://cdn.test/uni.png", kind: "partner", label: "Academia Partner" },
          { name: "College", logo_url: "https://cdn.test/college.png", kind: "partner", label: "academia partner" },
        ],
      }) as never,
    );
    expect(got?.groups?.map((g) => [g.caption, g.logos.map((l) => l.name)])).toEqual([
      ["Hosted by", ["Astro Club", "Co Club"]],
      ["Title", ["Rocket Co"]],
      ["Partners", ["Star Labs"]],
      ["Academia Partner", ["Uni", "College"]],
    ]);
  });

  it("is the organiser's footer image when set, else the logos, or nothing", () => {
    expect(logoFooterOf(base({ footer_image_url: "https://cdn.test/strip.png" }) as never)).toEqual({ image: "https://cdn.test/strip.png" });
    expect(logoFooterOf(base({ club: { name: "Astro Club", logo_url: null } }) as never)?.groups?.[0]?.caption).toBe("Title");
    expect(logoFooterOf(base({ club: null, partners: [] }) as never)).toBeNull();
    expect(logoFooterOf(base({ club: { name: "Astro Club", logo_url: null }, partners: [] }) as never)).toBeNull();
    expect(logoFooterOf(base({ control: { ...CONTROL, logo_footer: false }, footer_image_url: "https://cdn.test/strip.png" }) as never)).toBeNull();
    // A server from before the strip sends none of the fields.
    expect(logoFooterOf({ control: null } as never)).toBeNull();
  });
});

describe("the strip on the big screen", () => {
  it("shows the host club and the partners, drawn by the stage in the screen's own look", async () => {
    render(<ScreenPage eventId={37} />);
    const strip = await screen.findByTestId("logo-footer");
    // Only the stage fits what it shows around the strip.
    expect(strip.closest("[data-theme]")).toHaveAttribute("data-theme", "own");
    expect(within(strip).getByText("Hosted by")).toBeInTheDocument();
    expect(within(strip).getByAltText("Astro Club")).toHaveAttribute("src", CLUB.logo_url);
    expect(within(strip).getByText("Title")).toBeInTheDocument();
    expect(within(strip).getByText("Partners")).toBeInTheDocument();
    expect([...strip.querySelectorAll("img")].map((i) => i.getAttribute("alt"))).toEqual(["Astro Club", "Rocket Co", "Star Labs"]);
  });

  it("shows on the themed stage, in place of the theme's sponsor strip", async () => {
    const { presetDraft, resolveDraft } = await import("./theme");
    const theme = resolveDraft({ ...presetDraft("club", { brand_primary: "#F2AA4C", logo: false }), screen: { ...presetDraft("club", { brand_primary: "#F2AA4C", logo: false }).screen, sponsors: true } } as never, {}, null);
    state.screen = base({ theme, theme_custom: true, sponsors: [{ name: "Rocket Co", label: "Title", logo: { medium: "https://cdn.test/rocket.png" } }] });
    render(<ScreenPage eventId={37} />);
    const strip = await screen.findByTestId("logo-footer");
    expect(strip.closest("[data-theme]")).not.toHaveAttribute("data-theme", "own");
    expect(screen.queryByLabelText("Sponsors")).toBeNull();
  });

  it("shows the organiser's footer image instead of the logos", async () => {
    state.screen = base({ footer_image_url: "https://cdn.test/strip.png" });
    render(<ScreenPage eventId={37} />);
    const strip = await screen.findByTestId("logo-footer");
    expect([...strip.querySelectorAll("img")].map((i) => i.getAttribute("src"))).toEqual(["https://cdn.test/strip.png"]);
    expect(within(strip).queryByText("Hosted by")).toBeNull();
  });

  it("shows only the partners when the club has no logo", async () => {
    state.screen = base({ club: { name: "Astro Club", logo_url: null } });
    render(<ScreenPage eventId={37} />);
    const strip = await screen.findByTestId("logo-footer");
    expect(within(strip).queryByText("Hosted by")).toBeNull();
    expect(within(strip).getByText("Partners")).toBeInTheDocument();
  });

  it("is gone with nothing to show, or when the organiser turned it off", async () => {
    state.screen = base({ club: null, partners: [] });
    const first = render(<ScreenPage eventId={37} />);
    await screen.findByText("When is the next launch?");
    expect(screen.queryByTestId("logo-footer")).toBeNull();
    first.unmount();
    state.screen = base({ control: { ...CONTROL, ticker: true, logo_footer: false } });
    render(<ScreenPage eventId={37} />);
    await screen.findByText("When is the next launch?");
    expect(screen.queryByTestId("logo-footer")).toBeNull();
  });
});
