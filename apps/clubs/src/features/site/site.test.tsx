import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "@moa/ui";

import clubInfoFixture from "../__fixtures__/club-info.json";

/*
 * The website editor against a mocked API that keeps its state, in the
 * shapes of the site templates v2 contract (feature-register/
 * site-templates-contract.md), and against a server from before it.
 */

type Body = Record<string, unknown>;
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

const analytics: { on: boolean; data: unknown } = {
  on: false,
  data: {
    published: true, days: 30,
    link: { id: "w1", code: "webs1te9", short_url: "https://api.myotherapp.in/l/webs1te9", destination: "https://myotherapp.in/clubs/circuit-society?ref=webs1te9" },
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

const thumb = (k: string, m = "") => `https://api.myotherapp.in/static/site-templates/${k}${m}.png`;
const section = (key: string, label: string, default_title: string, hideable = true) => ({ key, label, default_title, hideable });
const slot = (key: string, label: string, size: [number, number], sec: string) => ({ key, label, size, section: sec });

const TEMPLATES = [
  {
    key: "classic", name: "Classic", blurb: "Profile page with cover, events and team", layout: "single",
    fixed_top: ["nav", "hero"], fixed_side: [], fixed_bottom: ["footer"],
    sections: [section("about", "About", "About us"), section("upcoming", "Upcoming events", "Upcoming", false), section("past", "Past events", "Past events"), section("photos", "Photos", "Photos"), section("team", "Team", "The team")],
    slots: [slot("hero.cover", "Cover photo", [1440, 300], "hero"), slot("about.image", "About image", [720, 480], "about"), slot("photos.1", "Photo 1", [720, 480], "photos"), slot("photos.2", "Photo 2", [720, 480], "photos")],
    thumb_url: thumb("classic"), thumb_mobile_url: thumb("classic", "-mobile"), accent: { default: "#2B4BFF", vars: ["--accent"] },
  },
  {
    key: "editorial", name: "Editorial", blurb: "A magazine's front page", layout: "single",
    fixed_top: ["nav", "hero"], fixed_side: [], fixed_bottom: ["footer"],
    sections: [section("upcoming", "Upcoming events", "The calendar", false), section("about", "About", "About"), section("speakers", "Speakers", "Speakers"), section("past", "Past events", "The archive")],
    slots: [slot("hero.cover", "Cover photo", [1200, 600], "hero"), slot("photos.1", "Photo 1", [600, 400], "photos")],
    thumb_url: thumb("editorial"), thumb_mobile_url: thumb("editorial", "-mobile"), accent: "#C8102E",
  },
  {
    key: "night", name: "Night", blurb: "Dark, a profile column at the side", layout: "two_column",
    fixed_top: ["nav"], fixed_side: ["profile"], fixed_bottom: ["footer"],
    sections: [section("team", "Team", "Crew"), section("upcoming", "Upcoming events", "Next up", false)],
    slots: [], thumb_url: null, thumb_mobile_url: null,
  },
];

const image = (id: number, alt: string, position: number, used_in: string[] = []) => ({
  id, url: `https://cdn.myotherapp.in/clubs/site/${id}-480.jpg`, srcset: `https://cdn.myotherapp.in/clubs/site/${id}-480.jpg 480w, https://cdn.myotherapp.in/clubs/site/${id}-960.jpg 960w`,
  alt, width: 1440, height: 960, position, used_in,
});

function v2Site(over: Body = {}): Body {
  return {
    template: "classic", headline: null, subline: null,
    default_headline: "Build things that think.", default_subline: "Hack nights, build weekends and competitions for Pune's makers.",
    published_at: "2026-10-02T09:00:00Z", stale: false, url: "https://circuit-society.myotherapp.in", slug: "circuit-society", tracking: null,
    templates: TEMPLATES,
    layout: { order: ["about", "upcoming", "past", "photos", "team"], hidden: [], titles: {}, slots: { "about.image": 11 }, accent: null },
    images: [image(11, "Members at the workbench", 0, ["about.image"]), image(12, "Hack night crowd", 1), image(13, "", 2)],
    limits: { images: 20, image_mb: 10 },
    ...over,
  };
}

/** The server as it was before the designer's templates. */
function legacySite(): Body {
  return {
    template: "launchpad", theme: "light", font: "dm_sans", headline: null, subline: null,
    default_headline: "Build things that think.", default_subline: null,
    sections: { hero: true, upcoming: true, about: true, past: true, team: true, partners: true, follow: true, contact: true },
    available: { hero: true, upcoming: true, about: true, past: true, team: false, partners: true, follow: true, contact: true },
    published_at: "2026-10-02T09:00:00Z", stale: false, url: "https://circuit-society.myotherapp.in", slug: "circuit-society",
    templates: [{ key: "launchpad", name: "Launchpad", blurb: "Big centred hero, event cards" }, { key: "arena", name: "Arena", blurb: "Countdown hero for competitions" }],
    fonts: [{ key: "dm_sans", name: "DM Sans" }],
  };
}

const server: { site: Body; nextId: number } = { site: v2Site(), nextId: 100 };
const images = () => server.site.images as Array<ReturnType<typeof image>>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/clubs/site")) return clone(server.site);
        if (path.endsWith("/clubs/info")) return { ...clubInfoFixture, brand_primary: "#1db9a0" };
        if (path.endsWith("/clubs/site/domain")) return { available: true, entitled: true, default_host: "circuit-society.myotherapp.in", domain: null };
        if (path.includes("/clubs/site/analytics")) {
          if (!analytics.on) throw new Error("Not Found");
          return analytics.data;
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: Body) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/preview")) return { html: `<html><body><h1>${(body.headline as string | undefined) ?? server.site.default_headline}</h1><p>${(body.template as string | undefined) ?? server.site.template}</p></body></html>` };
        if (path.endsWith("/publish")) {
          server.site = { ...server.site, published_at: "2026-11-13T10:00:00Z", stale: false };
          return clone(server.site);
        }
        throw new Error(`unstubbed POST ${path}`);
      }),
      patch: vi.fn(async (path: string, body: Body) => {
        calls.push({ method: "PATCH", path, body });
        const m = path.match(/\/images\/(\d+)$/);
        if (m) {
          const img = images().find((i) => i.id === Number(m[1]));
          if (img) img.alt = (body.alt as string | null) ?? "";
          return clone(img);
        }
        server.site = { ...server.site, ...body, stale: true };
        return clone(server.site);
      }),
      put: vi.fn(async (path: string, body: { ids: number[] }) => {
        calls.push({ method: "PUT", path, body });
        const byId = new Map(images().map((i) => [i.id, i]));
        server.site.images = body.ids.map((id, position) => ({ ...byId.get(id)!, position }));
        return clone(server.site.images);
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        const id = Number(path.split("/").at(-1));
        server.site.images = images().filter((i) => i.id !== id).map((i, position) => ({ ...i, position }));
        const layout = server.site.layout as { slots: Record<string, number> };
        layout.slots = Object.fromEntries(Object.entries(layout.slots).filter(([, v]) => v !== id));
        return clone(server.site.images);
      }),
    },
  };
});

/** XMLHttpRequest, held until the test answers it: uploads with their progress. */
const xhrs: FakeXHR[] = [];
class FakeXHR {
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = "";
  withCredentials = false;
  url = "";
  body: FormData | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader() {}
  abort() {}
  send(body: FormData) {
    this.body = body;
    xhrs.push(this);
  }
  progress(f: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded: f * 100, total: 100 });
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}
/** The server's side of an upload: kept, or refused once the library holds its 20. */
function serve(x: FakeXHR) {
  if (images().length >= 20) return x.respond(409, { message: "The library holds 20 photos", error_code: "SITE_IMAGES_FULL", errors: null, track_id: null });
  const img = image(server.nextId++, "", images().length);
  images().push(img);
  x.respond(200, img);
}

const { render } = await import("@/test/render");
const { SitePage } = await import("./components/site-page");

const lastCall = (method: string, end: string) => calls.filter((c) => c.method === method && c.path.endsWith(end)).at(-1);
const openTab = (name: RegExp) => fireEvent.click(screen.getByRole("tab", { name }));
const sectionOrder = () => within(screen.getByRole("list", { name: "Sections in order" })).getAllByRole("listitem").map((li) => li.getAttribute("data-testid")?.replace("section-", ""));

beforeEach(() => {
  calls.length = 0;
  xhrs.length = 0;
  analytics.on = false;
  server.site = v2Site();
  server.nextId = 100;
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the website page: templates and publishing", () => {
  it("reads the live state, shows each template's pictures (desktop or phone), previews and keeps the domain card", async () => {
    render(<SitePage />);
    expect(await screen.findByText(/Live · updated/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Classic is chosen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Use Editorial" })).toBeInTheDocument();
    expect(screen.getByAltText("Classic, on a desktop")).toHaveAttribute("src", thumb("classic"));
    // A template without pictures still shows its name.
    expect(within(screen.getByTestId("template-night")).getByText("Night", { selector: "span" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Thumbnails" })).getByRole("radio", { name: "Mobile" }));
    expect(screen.getByAltText("Classic, on a phone")).toHaveAttribute("src", thumb("classic", "-mobile"));
    await waitFor(() => expect(lastCall("POST", "/clubs/site/preview")).toBeTruthy());
    expect(await screen.findByTitle("Site preview")).toHaveAttribute("srcdoc", expect.stringContaining("Build things that think."));
    expect(screen.queryByTestId("unpublished")).not.toBeInTheDocument();
    const domain = await screen.findByRole("region", { name: "Custom domain" });
    expect(await within(domain).findByLabelText("Your domain")).toBeInTheDocument();
    expect(screen.getByText(/To use a domain of your own, see Custom domain below\./)).toBeInTheDocument();
  });

  it("choosing a template marks unpublished changes, previews it with its own sections, and publishes it", async () => {
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    fireEvent.click(screen.getByRole("button", { name: "Use Editorial" }));
    expect(screen.getByTestId("unpublished")).toHaveTextContent("Unpublished changes");
    expect(screen.getByText(/The live page is from/)).toBeInTheDocument();
    // Its sections: the order kept for keys both have, its own appended.
    await waitFor(() => expect(lastCall("POST", "/preview")).toMatchObject({ body: { template: "editorial", layout: { order: ["about", "upcoming", "past", "speakers"], slots: {} } } }));
    expect(await screen.findByTitle("Site preview")).toHaveAttribute("srcdoc", expect.stringContaining("editorial"));
    fireEvent.click(screen.getByRole("button", { name: /Publish changes/ }));
    await waitFor(() => expect(lastCall("PATCH", "/clubs/site")).toMatchObject({ body: { template: "editorial", layout: { order: ["about", "upcoming", "past", "speakers"] } } }));
    await waitFor(() => expect(lastCall("POST", "/publish")).toBeTruthy());
    expect(await screen.findByText(/Live · updated/)).toBeInTheDocument();
    expect(screen.queryByTestId("unpublished")).not.toBeInTheDocument();
  });

  it("previews once the typing settles, not at every key", async () => {
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    openTab(/Text and colour/);
    const headline = screen.getByLabelText("Headline");
    fireEvent.change(headline, { target: { value: "M" } });
    fireEvent.change(headline, { target: { value: "Ma" } });
    fireEvent.change(headline, { target: { value: "Make things" } });
    await waitFor(() => expect(lastCall("POST", "/preview")).toMatchObject({ body: { headline: "Make things" } }), { timeout: 3000 });
    const headlines = calls.filter((c) => c.path.endsWith("/preview")).map((c) => (c.body as Body).headline);
    expect(headlines).not.toContain("M");
    expect(headlines).not.toContain("Ma");
    // Typed back to what is saved: nothing to publish.
    fireEvent.change(headline, { target: { value: "" } });
    expect(screen.queryByTestId("unpublished")).not.toBeInTheDocument();
  });

  it("draws the preview at a desktop's, a tablet's and a phone's width", async () => {
    render(<SitePage />);
    const frame = await screen.findByTitle("Site preview");
    expect(frame).toHaveAttribute("data-width", "1440");
    const widths = screen.getByRole("radiogroup", { name: "Preview width" });
    fireEvent.click(within(widths).getByRole("radio", { name: "Tablet" }));
    expect(screen.getByTitle("Site preview")).toHaveAttribute("data-width", "768");
    fireEvent.click(within(widths).getByRole("radio", { name: "Mobile" }));
    expect(screen.getByTitle("Site preview")).toHaveAttribute("data-width", "390");
  });

  it("uses the club's brand colour as the accent, or the template's", async () => {
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    openTab(/Text and colour/);
    expect(screen.getByRole("radio", { name: /Template colour/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(await screen.findByRole("radio", { name: /Club colour.*brand colour in its place/ }));
    await waitFor(() => expect(lastCall("POST", "/preview")).toMatchObject({ body: { layout: { accent: "#1db9a0" } } }));
    fireEvent.click(screen.getByRole("button", { name: /Save draft/ }));
    await waitFor(() => expect(lastCall("PATCH", "/clubs/site")).toMatchObject({ body: { layout: { accent: "#1db9a0" } } }));
  });

  it("copies the link", async () => {
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    fireEvent.click(screen.getByRole("button", { name: /Copy site link/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://circuit-society.myotherapp.in"));
  });
});

describe("the website page: sections", () => {
  it("moves sections with the buttons and by dragging, hides and retitles them, and saves the layout", async () => {
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    openTab(/Sections/);
    expect(sectionOrder()).toEqual(["about", "upcoming", "past", "photos", "team"]);
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move About up" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move About down" }));
    expect(sectionOrder()).toEqual(["upcoming", "about", "past", "photos", "team"]);
    expect(screen.getByText("About moved to place 2 of 5")).toBeInTheDocument();
    // Team dragged onto the first row.
    fireEvent.dragStart(screen.getByTestId("section-team"));
    fireEvent.dragOver(screen.getByTestId("section-upcoming"));
    fireEvent.drop(screen.getByTestId("section-upcoming"));
    expect(sectionOrder()).toEqual(["team", "upcoming", "about", "past", "photos"]);
    // Upcoming events cannot be hidden; past events can.
    expect(screen.getByLabelText("Upcoming events is always shown")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Show Past events" }));
    expect(within(screen.getByTestId("section-past")).getByText("Hidden")).toBeInTheDocument();
    // A space typed between words stays while typing (the saved title is trimmed).
    fireEvent.change(screen.getByLabelText("Team title"), { target: { value: "Who " } });
    expect(screen.getByLabelText("Team title")).toHaveValue("Who ");
    fireEvent.change(screen.getByLabelText("Team title"), { target: { value: "Who we are" } });
    // The template's own title, typed out, is no override.
    fireEvent.change(screen.getByLabelText("About title"), { target: { value: "About us" } });
    expect(screen.getByLabelText("About title")).toHaveValue("About us");
    expect(screen.getByTestId("unpublished")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save draft/ }));
    await waitFor(() =>
      expect(lastCall("PATCH", "/clubs/site")).toMatchObject({ body: { layout: { order: ["team", "upcoming", "about", "past", "photos"], hidden: ["past"], titles: { team: "Who we are" } } } }),
    );
    expect((lastCall("PATCH", "/clubs/site")?.body as Body).template).toBeUndefined();
  });

  it("shows a two-column template's profile column as fixed at the side", async () => {
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    fireEvent.click(screen.getByRole("button", { name: "Use Night" }));
    openTab(/Sections/);
    expect(screen.getByText("Profile column")).toBeInTheDocument();
    expect(screen.getByText("Fixed at the side")).toBeInTheDocument();
    expect(sectionOrder()).toEqual(["upcoming", "team"]);
  });
});

describe("the website page: photos", () => {
  it("picks a library photo for a place and shows the gallery filling itself", async () => {
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    openTab(/Photos/);
    expect(within(screen.getByTestId("slot-hero.cover")).getByText(/1440 × 300 px/)).toBeInTheDocument();
    expect(within(screen.getByTestId("slot-hero.cover")).getByText(/Empty/)).toBeInTheDocument();
    expect(within(screen.getByTestId("slot-about.image")).getByText(/Photo 1/)).toBeInTheDocument();
    // Photo 1 is the about image, so the gallery starts at photo 2.
    expect(within(screen.getByTestId("slot-photos.1")).getByText(/Auto: photo 2/)).toBeInTheDocument();
    expect(within(screen.getByTestId("slot-photos.2")).getByText(/Auto: photo 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose a photo for Cover photo" }));
    const picker = await screen.findByRole("dialog");
    expect(within(picker).getByText(/Drawn at 1440 × 300 px/)).toBeInTheDocument();
    fireEvent.click(within(picker).getByRole("button", { name: "Photo 2: Hack night crowd" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(screen.getByTestId("slot-hero.cover")).getByText(/Photo 2/)).toBeInTheDocument();
    expect(within(screen.getByTestId("slot-photos.1")).getByText(/Auto: photo 3/)).toBeInTheDocument();
    expect(within(screen.getByTestId("slot-photos.2")).getByText(/Empty/)).toBeInTheDocument();
    // The library says where each photo goes.
    expect(within(screen.getByTestId("photo-12")).getByText("Cover photo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear About image" }));
    fireEvent.click(screen.getByRole("button", { name: /Save draft/ }));
    await waitFor(() => expect(lastCall("PATCH", "/clubs/site")).toMatchObject({ body: { layout: { slots: { "hero.cover": 12 } } } }));
    expect(((lastCall("PATCH", "/clubs/site")?.body as Body).layout as Body).slots).toEqual({ "hero.cover": 12 });
  });

  it("uploads several photos with their progress, up to the 20 the library holds", async () => {
    server.site = v2Site({ images: Array.from({ length: 18 }, (_, i) => image(200 + i, `Photo ${i}`, i)), layout: { order: [], hidden: [], titles: {}, slots: {}, accent: null } });
    const error = vi.spyOn(toast, "error");
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    openTab(/Photos/);
    expect(screen.getByText("18 of 20")).toBeInTheDocument();
    const files = ["a.jpg", "b.png", "c.webp"].map((name) => new File(["x"], name, { type: name.endsWith("jpg") ? "image/jpeg" : name.endsWith("png") ? "image/png" : "image/webp" }));
    fireEvent.change(screen.getByLabelText("Photos to add"), { target: { files } });
    expect(error).toHaveBeenCalledWith("The library holds 20 photos: 1 was left out.");
    expect(screen.getAllByTestId("upload-row")).toHaveLength(2);
    await waitFor(() => expect(xhrs).toHaveLength(1));
    expect(xhrs[0]?.url).toBe("/api/gateway/api/v1/clubs/site/images");
    expect((xhrs[0]?.body?.get("file") as File).name).toBe("a.jpg");
    act(() => xhrs[0]?.progress(0.5));
    expect(screen.getByText("Uploading · 50%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Uploading a.jpg" })).toHaveAttribute("aria-valuenow", "50");
    // The library is full while two are on their way: no more can be picked.
    expect(screen.getByRole("button", { name: /Add photos/ })).toBeDisabled();
    act(() => serve(xhrs[0]!));
    await waitFor(() => expect(xhrs).toHaveLength(2));
    act(() => serve(xhrs[1]!));
    await waitFor(() => expect(screen.queryAllByTestId("upload-row")).toHaveLength(0));
    expect(await screen.findByText("20 of 20")).toBeInTheDocument();
    expect(screen.getByText("The library is full (20 photos). Delete one to add another.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add photos/ })).toBeDisabled();
  });

  it("stops the rest when the server says the library is full, and says so on each", async () => {
    server.site = v2Site({ images: Array.from({ length: 18 }, (_, i) => image(200 + i, "", i)) });
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    openTab(/Photos/);
    // Another tab filled the library meanwhile.
    images().push(image(300, "", 18), image(301, "", 19));
    fireEvent.change(screen.getByLabelText("Photos to add"), { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" }), new File(["x"], "b.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(xhrs).toHaveLength(1));
    act(() => serve(xhrs[0]!));
    expect(await screen.findAllByText("The library is full (20 photos).")).toHaveLength(2);
    expect(xhrs).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss a.jpg" }));
    expect(screen.getAllByTestId("upload-row")).toHaveLength(1);
  });

  it("refuses what is not a photo before sending anything", async () => {
    const error = vi.spyOn(toast, "error");
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    openTab(/Photos/);
    fireEvent.change(screen.getByLabelText("Photos to add"), { target: { files: [new File(["x"], "notes.pdf", { type: "application/pdf" })] } });
    expect(error).toHaveBeenCalledWith("Only photos go in the library: JPG, PNG or WebP.");
    expect(screen.queryAllByTestId("upload-row")).toHaveLength(0);
  });

  it("saves alt text and the library's order at once, by button or by dragging", async () => {
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    openTab(/Photos/);
    const alt = screen.getByLabelText("Alt text for photo 3");
    fireEvent.change(alt, { target: { value: "Soldering class" } });
    fireEvent.blur(alt);
    await waitFor(() => expect(lastCall("PATCH", "/images/13")).toMatchObject({ body: { alt: "Soldering class" } }));
    fireEvent.click(screen.getByRole("button", { name: "Move photo 2 earlier" }));
    await waitFor(() => expect(lastCall("PUT", "/images/order")).toMatchObject({ body: { ids: [12, 11, 13] } }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Move photo 1 earlier" })).toBeDisabled());
    expect(within(screen.getByRole("list", { name: "Photos in order" })).getAllByRole("listitem")[0]).toHaveAttribute("data-testid", "photo-12");
    fireEvent.dragStart(screen.getByTestId("photo-13"));
    fireEvent.dragOver(screen.getByTestId("photo-12"));
    fireEvent.drop(screen.getByTestId("photo-12"));
    await waitFor(() => expect(lastCall("PUT", "/images/order")).toMatchObject({ body: { ids: [13, 12, 11] } }));
  });

  it("says where a photo is used before deleting it, and lets go of it", async () => {
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    openTab(/Photos/);
    fireEvent.click(screen.getByRole("button", { name: "Delete photo 1" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/It is used in About image\./)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete photo" }));
    await waitFor(() => expect(lastCall("DELETE", "/images/11")).toBeTruthy());
    await waitFor(() => expect(screen.queryByTestId("photo-11")).not.toBeInTheDocument());
    expect(within(screen.getByTestId("slot-about.image")).getByText(/Empty/)).toBeInTheDocument();
    // An unused one says so.
    fireEvent.click(screen.getByRole("button", { name: "Delete photo 2" }));
    expect(within(await screen.findByRole("alertdialog")).getByText(/isn't chosen for any place/)).toBeInTheDocument();
  });
});

describe("the website page ahead of its backend", () => {
  it("against a server before v2: templates by name, sections on and off, the hero; no photos yet", async () => {
    server.site = legacySite();
    render(<SitePage />);
    await screen.findByText(/Live · updated/);
    expect(screen.getByText(/arrive with the next server update/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Photos/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launchpad is chosen" })).toBeInTheDocument();
    openTab(/Sections/);
    expect(screen.getByText("Add people on Club profile")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Show Past events" }));
    openTab(/Text/);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Make things that think" } });
    expect(screen.queryByRole("radiogroup", { name: "Accent colour" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Publish changes/ }));
    await waitFor(() =>
      expect(lastCall("PATCH", "/clubs/site")).toMatchObject({ body: { headline: "Make things that think", sections: expect.objectContaining({ past: false, team: true }) } }),
    );
    expect((lastCall("PATCH", "/clubs/site")?.body as Body).layout).toBeUndefined();
    await waitFor(() => expect(lastCall("POST", "/publish")).toBeTruthy());
  });
});

describe("the website page: analytics", () => {
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
