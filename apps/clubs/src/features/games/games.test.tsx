import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * Event → Games (games contract §3, §4): the two switches and names, the
 * look and the venue screen link, the Hero Cards rules and monitor, the card
 * designer with its locks, the hunt (state, QR points, clue preview, live
 * scans), the players (PIN reset, opt-outs, exports), the plan notice, and
 * the same page read only for staff. The API is stubbed in its shapes;
 * invented data throughout.
 */

type Call = { method: string; path: string; body?: unknown; options?: { query?: Record<string, unknown> } };
const calls: Call[] = [];
const EVENT = 42;

const SETTINGS = {
  event_id: EVENT,
  cards_on: false,
  cards_name: "Hero Cards",
  hunt_on: false,
  hunt_name: "Scavenger Hunt",
  theme: "neon_arcade",
  accent: null,
  logo_url: null,
  board_layout: "podium",
  board_rows: 10,
  ticker_on: true,
  join_box_on: true,
  screen_version: 1,
  updated_at: "2026-11-22T10:00:00Z",
  plan: { game_cards: true, game_hunt: true },
};
const SCREEN = { url: "https://myotherapp.in/screen/s.42.1.abc", token: "s.42.1.abc", version: 1 };
const FEED = [
  { id: 31, game: "cards", type: "reveal", message: "Asha K. pulled a Rare card", created_at: "2026-11-28T05:00:00Z", hidden: false },
  { id: 30, game: "hunt", type: "claim", message: "Ben T. found a code", created_at: "2026-11-28T04:59:00Z", hidden: true },
];
const CONFIG = { preset: "medium", shares: { common: 52, uncommon: 30, rare: 13, legendary: 5 }, legendary_floor: 4, pin_required: true, collect_on: true, two_way: true, show_holders: true, warnings: [] as unknown[] };
const LIVE = {
  revealed: 120,
  checked_in: 150,
  registered: 300,
  legendary_revealed: 3,
  legendary_target: 4,
  legendary_floor: 4,
  full_decks: 2,
  collects: 640,
  heroes: 5,
  tiers: [
    { tier: "common", revealed: 62, expected: 62.4, share: 52 },
    { tier: "legendary", revealed: 3, expected: 6, share: 5 },
  ],
};
const hero = (n: number, tier: string, over: Record<string, unknown> = {}) => ({ id: `h${n}`, number: n, name: `Hero ${n}`, tagline: `Line ${n}`, tier, art: null, art_url: null, emblem_key: "bolt", holders: 0, reveals: 0, revealed: false, ...over });
const HEROES = [hero(1, "common"), hero(2, "common"), hero(3, "uncommon"), hero(4, "rare", { reveals: 9, holders: 12, revealed: true }), hero(5, "legendary")];
const HUNT = { status: "draft", starts_at: null, ends_at: null, duration_minutes: 90, mode: "ordered", bonus_n: 10, bonus_pts: 20, hint_cost: 10, paused_at: null, server_now: null };
const POINTS = [
  { id: "p1", number: 1, label: "Registration pillar", clue: "Where you collected your badge.", zone: "Lobby", base_points: 30, hint: "Look up.", scans: 41, code: "p.42.abc.mac" },
  { id: "p2", number: 2, label: "Sponsor wall", clue: "Logos as far as you can see.", zone: "Hall A", base_points: 50, hint: "", scans: 12, code: "p.42.def.mac" },
];
const HUNT_LIVE = {
  scans: 90,
  claims: 53,
  players: 31,
  points: [{ id: "p1", number: 1, label: "Registration pillar", zone: "Lobby", scans: 44 }],
  finishers: 2,
  flags: [{ registration_id: "r9", name: "Asha K.", claims: 3, zones: ["Lobby", "Hall A", "Hall C"], first_at: "2026-11-28T05:00:00Z" }],
  flagged: [{ registration_id: "r9", name: "Asha K.", claims: 3, zones: ["Lobby", "Hall A", "Hall C"], first_at: "2026-11-28T05:00:00Z" }],
  recent: [{ name: "Ben T.", at: "2026-11-28T05:01:00Z" }],
};
const PLAYERS = {
  items: [
    { registration_id: "r1", name: "Asha Kumar", email: "asha@example.com", player_no: 1, public: true, heroes: 3, points: 120, pin_locked: false, last_seen_at: "2026-11-28T05:00:00Z" },
    { registration_id: "r2", name: "Ben Thomas", email: "ben@example.com", player_no: 247, public: false, heroes: 1, points: 0, pin_locked: true, last_seen_at: null },
  ],
  total: 2,
};

const state = {
  settings: structuredClone(SETTINGS) as Record<string, unknown>,
  config: structuredClone(CONFIG) as Record<string, unknown>,
  live: structuredClone(LIVE) as Record<string, unknown>,
  heroes: structuredClone(HEROES) as unknown[],
  hunt: structuredClone(HUNT) as Record<string, unknown>,
  points: structuredClone(POINTS) as unknown[],
  feed: structuredClone(FEED) as unknown[],
  routeMissing: false,
  entitlements: { enforced: false, features: {} } as Record<string, unknown>,
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { ApiError } = await import("@moa/api");
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: Call["options"]) => {
        calls.push({ method: "GET", path, options });
        if (state.routeMissing && path.includes("/games")) throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
        if (path === "/api/v1/clubs/entitlements") return { plan_key: "free", plan_name: "Free", limits: {}, usage: {}, configured: true, ...state.entitlements };
        if (path === "/api/v1/plans") return { currency: "INR", yearly_months_free: 2, plans: [{ id: 1, key: "pro", name: "Pro", tagline: null, price_monthly_paise: 0, price_yearly_paise: 0, trial_days: 0, contact_sales: false, featured: false, limits: {}, features: [{ key: "game_cards", label: "Hero card game", included: true }, { key: "game_hunt", label: "Scavenger hunt", included: true }] }] };
        if (path.endsWith("/games/settings")) return state.settings;
        if (path.endsWith("/games/screen")) return SCREEN;
        if (path.endsWith("/games/feed")) return state.feed;
        if (path.endsWith("/cards/config")) return state.config;
        if (path.endsWith("/cards/live")) return state.live;
        if (path.endsWith("/cards/heroes")) return state.heroes;
        // The points ride on GET hunt; there is no GET hunt/points.
        if (path.endsWith("/games/hunt")) return { ...state.hunt, points: state.points };
        if (path.endsWith("/hunt/live")) return HUNT_LIVE;
        if (path.endsWith("/games/players")) return options?.query?.public === "false" ? { items: [PLAYERS.items[1]], total: 1 } : PLAYERS;
        throw new Error(`unstubbed GET ${path}`);
      }),
      patch: vi.fn(async (path: string, body: Record<string, unknown>) => {
        calls.push({ method: "PATCH", path, body });
        if (path.endsWith("/games/settings")) return (state.settings = { ...state.settings, ...body, updated_at: new Date().toISOString() });
        if (path.endsWith("/cards/config")) return (state.config = { ...state.config, ...body });
        if (path.includes("/games/feed/")) return { id: Number(path.split("/").pop()), hidden: body.hidden };
        if (path.includes("/cards/heroes/")) return { ...HEROES[0], ...body };
        if (path.includes("/hunt/points/")) return { ...POINTS[0], ...body };
        return {};
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/screen/rotate")) return { url: "https://myotherapp.in/screen/s.42.2.xyz", token: "s.42.2.xyz", version: 2 };
        if (path.includes("/reset-pin")) return { registration_id: path.split("/").slice(-2)[0], url: "https://myotherapp.in/g/b.42.r2.1.mac", token: "b.42.r2.1.mac", pin: "7302" };
        if (path.endsWith("/settings/logo")) return { ...state.settings, logo_url: "https://cdn.example/logo.png" };
        if (path.endsWith("/cards/heroes")) return hero(6, "common", { id: "h6", ...(body as object) });
        if (path.endsWith("/art")) return hero(6, "common", { id: "h6", art_url: "https://cdn.example/art.png" });
        if (path.endsWith("/hunt/points")) return { ...POINTS[0], id: "p3", number: 3, ...(body as object) };
        if (/\/hunt\/(start|pause|resume|end|extend)$/.test(path)) return { ...state.hunt, status: path.endsWith("/start") || path.endsWith("/resume") ? "live" : path.endsWith("/pause") ? "paused" : path.endsWith("/end") ? "ended" : "live" };
        return {};
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (path.endsWith("/hunt")) return { ...state.hunt, ...(body as object) };
        return state.heroes;
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return {};
      }),
    },
  };
});

const access = { can: { edit_events: true, exports: true } as Record<string, boolean>, roleLabel: "Owner" };
vi.mock("@/features/access", () => ({ useAccess: () => access }));
vi.mock("@/features/events/queries", () => ({ useEventDetail: () => ({ data: undefined }) }));

const { render } = await import("@/test/render");
const { GamesPage, gamesLine } = await import("./components/games-page");
const { HeroEditor, checkArt, moved } = await import("./components/designer-panel");
const { applyPreset, draftOf, rulesPatch, rulesProblems } = await import("./components/cards-panel");
const { CluePhone } = await import("./components/hunt-panel");
const { nameProblem } = await import("./components/setup-panel");
const { HeroCard } = await import("./components/hero-card");
const S = await import("./schemas");
const { LIVE_MS } = await import("./queries");

const open = async (tab?: string) => {
  const view = render(<GamesPage eventId={EVENT} />);
  await screen.findByRole("tablist", { name: "Games sections" });
  if (tab) fireEvent.mouseDown(screen.getByRole("tab", { name: tab }), { button: 0 }), fireEvent.click(screen.getByRole("tab", { name: tab }));
  return view;
};
const sent = (method: string, suffix: string) => calls.filter((c) => c.method === method && c.path.endsWith(suffix));

beforeEach(() => {
  calls.length = 0;
  state.settings = structuredClone(SETTINGS);
  state.config = structuredClone(CONFIG);
  state.live = structuredClone(LIVE);
  state.heroes = structuredClone(HEROES);
  state.hunt = structuredClone(HUNT);
  state.points = structuredClone(POINTS);
  state.feed = structuredClone(FEED);
  state.routeMissing = false;
  state.entitlements = { enforced: false, features: {} };
  access.can = { edit_events: true, exports: true };
});

describe("the switches and names", () => {
  it("has both games off by default, each with its own switch", async () => {
    await open();
    expect(await screen.findByRole("switch", { name: "Hero Cards" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Scavenger Hunt" })).not.toBeChecked();
    expect(screen.getByText(/Off: players see no card game/)).toBeInTheDocument();
    expect(gamesLine(S.settingsSchema.parse(SETTINGS))).toBe("No game is on for this event");
  });

  it("switches each game on by itself", async () => {
    await open();
    fireEvent.click(await screen.findByRole("switch", { name: "Hero Cards" }));
    await waitFor(() => expect(sent("PATCH", "/games/settings")[0]).toMatchObject({ body: { cards_on: true } }));
    fireEvent.click(screen.getByRole("switch", { name: "Scavenger Hunt" }));
    await waitFor(() => expect(sent("PATCH", "/games/settings")[1]).toMatchObject({ body: { hunt_on: true } }));
    expect(Object.keys(sent("PATCH", "/games/settings")[0]!.body as object)).toEqual(["cards_on"]);
  });

  it("saves a new name, and refuses one over 40 characters", async () => {
    await open();
    const name = await screen.findByLabelText("Hero Cards name");
    const save = within(name.closest("form")!).getByRole("button", { name: "Save name" });
    expect(save).toBeDisabled();
    fireEvent.change(name, { target: { value: "x".repeat(41) } });
    expect(screen.getByText("At most 40 characters.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(name, { target: { value: "  " } });
    expect(screen.getByText("Give it a name.")).toBeInTheDocument();
    fireEvent.change(name, { target: { value: "Heroes of DevFest" } });
    fireEvent.click(save);
    await waitFor(() => expect(sent("PATCH", "/games/settings")[0]).toMatchObject({ body: { cards_name: "Heroes of DevFest" } }));
    expect(nameProblem("a".repeat(40))).toBeNull();
    expect(nameProblem("a".repeat(41))).toMatch(/At most 40/);
    // The tabs and the line under the heading follow the name.
    expect(await screen.findByRole("tab", { name: "Heroes of DevFest" })).toBeInTheDocument();
  });

  it("says when the API has no games yet", async () => {
    state.routeMissing = true;
    render(<GamesPage eventId={EVENT} />);
    expect(await screen.findByText("Games are not here yet")).toBeInTheDocument();
  });
});

describe("look and screens", () => {
  it("starts on Neon Arcade, with the podium and ten rows, and saves only what changed", async () => {
    await open();
    expect(await screen.findByRole("radio", { name: /Neon Arcade/ })).toBeChecked();
    expect(screen.getAllByRole("radio", { name: /Neon Arcade|Sunset Pop|Ocean Glow|Mono Night/ })).toHaveLength(4);
    const save = within(screen.getByRole("region", { name: "Save look" })).getByRole("button", { name: "Save look" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Sunset Pop/ }));
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    fireEvent.change(screen.getByLabelText("Rows on the board"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("switch", { name: "Ticker" }));
    expect(screen.getByRole("img", { name: /Sunset Pop, list, 7 rows/ })).toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() => expect(sent("PATCH", "/games/settings")[0]).toBeTruthy());
    expect(sent("PATCH", "/games/settings")[0]!.body).toEqual({ theme: "sunset_pop", board_layout: "list", board_rows: 7, ticker_on: false });
  });

  it("uploads a logo", async () => {
    await open();
    const input = await screen.findByLabelText("Logo file");
    fireEvent.change(input, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } });
    await waitFor(() => expect(sent("POST", "/settings/logo")).toHaveLength(1));
    expect(sent("POST", "/settings/logo")[0]!.body).toBeInstanceOf(FormData);
  });

  it("shows the venue screen link, and makes a new one only after asking", async () => {
    await open();
    expect(await screen.findByDisplayValue("https://myotherapp.in/screen/s.42.1.abc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy link/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Make a new link/ }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/stops working at once/)).toBeInTheDocument();
    expect(sent("POST", "/screen/rotate")).toHaveLength(0);
    fireEvent.click(within(confirm).getByRole("button", { name: "Make a new link" }));
    await waitFor(() => expect(sent("POST", "/screen/rotate")).toHaveLength(1));
    expect(await screen.findByDisplayValue("https://myotherapp.in/screen/s.42.2.xyz")).toBeInTheDocument();
  });
});

describe("Hero Cards rules", () => {
  it("fills the four shares from a preset, and saves it", async () => {
    await open("Hero Cards");
    const hard = await screen.findByRole("radio", { name: "Hard" });
    fireEvent.click(hard);
    expect(screen.getByLabelText("Common share")).toHaveValue(60);
    expect(screen.getByLabelText("Uncommon share")).toHaveValue(28);
    expect(screen.getByLabelText("Rare share")).toHaveValue(10);
    expect(screen.getByLabelText("Legendary share")).toHaveValue(2);
    expect(screen.getByText("Total 100%.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await waitFor(() => expect(sent("PATCH", "/cards/config")[0]).toBeTruthy());
    expect(sent("PATCH", "/cards/config")[0]!.body).toEqual({ shares: { common: 60, uncommon: 28, rare: 10, legendary: 2 }, preset: "hard" });
  });

  it("refuses shares that do not total 100", async () => {
    await open("Hero Cards");
    fireEvent.change(await screen.findByLabelText("Common share"), { target: { value: "50" } });
    expect(screen.getByText("The four shares total 98%. They must total 100%.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Uncommon share"), { target: { value: "32" } });
    expect(screen.getByText("Total 100%.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save rules" })).toBeEnabled();
    expect(sent("PATCH", "/cards/config")).toHaveLength(0);
  });

  it("checks the legendary minimum and sends the switches that changed", async () => {
    await open("Hero Cards");
    const floor = await screen.findByLabelText("Legendary minimum");
    fireEvent.change(floor, { target: { value: "0" } });
    expect(screen.getByText("A whole number, at least 1.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
    fireEvent.change(floor, { target: { value: "6" } });
    fireEvent.click(screen.getByRole("switch", { name: "Two-way collect" }));
    fireEvent.click(screen.getByRole("switch", { name: "Show how many hold a hero" }));
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await waitFor(() => expect(sent("PATCH", "/cards/config")[0]).toBeTruthy());
    expect(sent("PATCH", "/cards/config")[0]!.body).toEqual({ legendary_floor: 6, two_way: false, show_holders: false });
  });

  it("warns about Hard under 20 attendees, and not otherwise", async () => {
    state.config = { ...CONFIG, preset: "hard", shares: { common: 60, uncommon: 28, rare: 10, legendary: 2 } };
    state.live = { ...LIVE, registered: 12, checked_in: 0 };
    const view = await open("Hero Cards");
    expect(await screen.findByText(/with fewer than 20 attendees/)).toBeInTheDocument();
    view.unmount();
    state.live = { ...LIVE, registered: 300 };
    await open("Hero Cards");
    await screen.findByLabelText("Common share");
    expect(screen.queryByText(/with fewer than 20 attendees/)).toBeNull();
    expect(S.smallHardWarning("medium", 5)).toBeNull();
    expect(S.smallHardWarning("hard", 19)).not.toBeNull();
    expect(S.smallHardWarning("hard", 20)).toBeNull();
  });

  it("works the shares out in the pure helpers", () => {
    const c = S.cardConfigSchema.parse(CONFIG);
    expect(S.sharesTotal(c.shares)).toBe(100);
    expect(S.sharesTotalOk({ common: 33.33, uncommon: 33.33, rare: 33.34, legendary: 0 })).toBe(true);
    expect(S.sharesTotalOk({ common: 33.33, uncommon: 33.33, rare: 33.33, legendary: 0 })).toBe(false);
    expect(S.presetOf(S.PRESET_SHARES.easy)).toBe("easy");
    expect(S.presetOf({ common: 51, uncommon: 30, rare: 13, legendary: 6 })).toBe("custom");
    const d = applyPreset(draftOf(c), "easy");
    expect(rulesProblems(d).shares).toBeNull();
    expect(rulesPatch(c, d)).toEqual({ shares: S.PRESET_SHARES.easy, preset: "easy" });
    // The server may send four flat fields.
    expect(S.cardConfigSchema.parse({ preset: "easy", share_common: 40, share_uncommon: 30, share_rare: 20, share_legendary: 10 }).shares).toEqual(S.PRESET_SHARES.easy);
  });

  it("shows the live monitor's numbers and asks again every five seconds", async () => {
    await open("Hero Cards");
    const monitor = (await screen.findByText("Live monitor")).closest("section, div")!.parentElement!;
    expect(within(monitor).getAllByText("Revealed").length).toBeGreaterThan(0);
    expect(within(monitor).getByText("120")).toBeInTheDocument();
    expect(within(monitor).getByText("640")).toBeInTheDocument();
    expect(within(monitor).getByText("Full decks")).toBeInTheDocument();
    expect(within(monitor).getByText("Legendary revealed")).toBeInTheDocument();
    expect(within(monitor).getByText("Badge-to-badge scans")).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent(/Legendary\s*3\s*6/);
    expect(LIVE_MS).toBe(5000);
  });
});

describe("the card designer", () => {
  it("lists the heroes as cards in their tier frames, and shows what the shares still need", async () => {
    state.heroes = HEROES.filter((h) => h.tier !== "legendary");
    await open("Card designer");
    const list = await screen.findByRole("list", { name: "Heroes" });
    expect(within(list).getAllByRole("figure")).toHaveLength(4);
    expect(within(list).getAllByRole("figure")[3]).toHaveAttribute("data-tier", "rare");
    expect(screen.getByText("Legendary has a share of 5% but no hero: add one.")).toBeInTheDocument();
  });

  it("checks a hero as it is written: name 18, tagline 60", () => {
    const ok = { name: "Solar Warden", tagline: "Guards the dawn", tier: "rare" as const, emblem_key: "star" };
    expect(S.heroProblems(ok)).toEqual({});
    expect(S.heroProblems({ ...ok, name: "A".repeat(19) }).name).toMatch(/At most 18/);
    expect(S.heroProblems({ ...ok, name: "A".repeat(18) }).name).toBeUndefined();
    expect(S.heroProblems({ ...ok, name: "  " }).name).toMatch(/Give the hero a name/);
    expect(S.heroProblems({ ...ok, tagline: "t".repeat(61) }).tagline).toMatch(/At most 60/);
  });

  it("keeps a revealed hero's tier and refuses to delete it", async () => {
    await open("Card designer");
    const del = await screen.findByRole("button", { name: "Delete Hero 4" });
    expect(del).toBeDisabled();
    expect(screen.getByText(/Revealed by 9: tier is locked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Hero 5" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Edit Hero 4" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Tier")).toBeDisabled();
    expect(within(dialog).getByText(/so its tier can't change/)).toBeInTheDocument();
    // Name, tagline and picture stay open.
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Renamed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save hero" }));
    await waitFor(() => expect(sent("PATCH", "/cards/heroes/h4")[0]).toBeTruthy());
    expect(sent("PATCH", "/cards/heroes/h4")[0]!.body).toMatchObject({ name: "Renamed", tier: "rare" });
    expect(S.heroProblems({ name: "X", tagline: "", tier: "common", emblem_key: null }, S.heroSchema.parse(HEROES[3])).tier).toMatch(/tier can't change/);
    expect(S.heroProblems({ name: "X", tagline: "", tier: "common", emblem_key: null }, S.heroSchema.parse(HEROES[0])).tier).toBeUndefined();
  });

  it("deletes a hero nobody has revealed, after asking", async () => {
    await open("Card designer");
    fireEvent.click(await screen.findByRole("button", { name: "Delete Hero 5" }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete hero" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path.endsWith("/cards/heroes/h5"))).toBe(true));
  });

  it("reorders with the arrows", async () => {
    await open("Card designer");
    fireEvent.click(await screen.findByRole("button", { name: "Move Hero 2 earlier" }));
    await waitFor(() => expect(sent("PUT", "/cards/heroes/order")[0]).toBeTruthy());
    expect(sent("PUT", "/cards/heroes/order")[0]!.body).toEqual({ ids: ["h2", "h1", "h3", "h4", "h5"] });
    expect(moved(["a", "b", "c"], "a", -1)).toBeNull();
    expect(moved(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(screen.getByRole("button", { name: "Move Hero 1 earlier" })).toBeDisabled();
  });

  it("stops at 20 heroes", async () => {
    state.heroes = Array.from({ length: 20 }, (_, i) => hero(i + 1, "common"));
    await open("Card designer");
    await screen.findByRole("list", { name: "Heroes" });
    expect(screen.getByRole("button", { name: /Add a hero/ })).toBeDisabled();
  });

  it("checks a picture in the browser: type, size, pixels and the 3:4 shape", async () => {
    const png = (size: number) => ({ type: "image/png", size });
    expect(S.artProblem(png(1000), { width: 900, height: 1200 })).toBeNull();
    expect(S.artProblem(png(1000), { width: 1800, height: 2400 })).toBeNull();
    expect(S.artProblem({ type: "image/gif", size: 10 }, { width: 900, height: 1200 })).toMatch(/PNG, JPG or WebP/);
    expect(S.artProblem(png(6 * 1024 * 1024), { width: 900, height: 1200 })).toMatch(/over 5 MB/);
    expect(S.artProblem(png(1000), { width: 600, height: 800 })).toMatch(/at least 900 × 1200/);
    expect(S.artProblem(png(1000), { width: 1200, height: 1200 })).toMatch(/3:4/);
    expect(S.artProblem(png(1000), null)).toMatch(/can't be read/);
    const file = new File(["x"], "a.png", { type: "image/png" });
    expect(await checkArt(file, async () => ({ width: 800, height: 1000 }))).toMatch(/at least 900/);
    expect(await checkArt(file, async () => ({ width: 900, height: 1200 }))).toBeNull();
  });

  it("refuses a bad picture in the editor, and uploads a good one after the hero is made", async () => {
    const onClose = vi.fn();
    const sizes = [{ width: 600, height: 800 }, { width: 900, height: 1200 }];
    render(<HeroEditor eventId={EVENT} hero={null} theme="neon_arcade" onClose={onClose} measure={async () => sizes.shift() ?? null} />);
    const dialog = await screen.findByRole("dialog");
    const file = within(dialog).getByLabelText("Hero picture file");
    fireEvent.change(file, { target: { files: [new File(["x"], "small.png", { type: "image/png" })] } });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/at least 900 × 1200/);
    expect(within(dialog).getByRole("button", { name: "Add hero" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Solar Warden" } });
    fireEvent.change(file, { target: { files: [new File(["x"], "big.png", { type: "image/png" })] } });
    await waitFor(() => expect(within(dialog).queryByRole("alert")).toBeNull());
    fireEvent.click(within(dialog).getByRole("button", { name: "Add hero" }));
    await waitFor(() => expect(sent("POST", "/art")).toHaveLength(1));
    expect(sent("POST", "/cards/heroes")[0]!.body).toMatchObject({ name: "Solar Warden", tier: "common" });
    expect(onClose).toHaveBeenCalled();
  });

  it("previews the card as it is typed", async () => {
    render(<HeroEditor eventId={EVENT} hero={null} theme="ocean_glow" onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Tide Caller" } });
    fireEvent.change(within(dialog).getByLabelText("Tagline"), { target: { value: "Rides every wave" } });
    fireEvent.change(within(dialog).getByLabelText("Tier"), { target: { value: "legendary" } });
    const card = within(dialog).getByRole("figure");
    expect(card).toHaveAttribute("data-tier", "legendary");
    expect(card).toHaveTextContent("Tide Caller");
    expect(card).toHaveTextContent("Rides every wave");
  });

  it("draws a locked card without the hero", () => {
    render(<HeroCard hero={{ name: "Secret", tagline: "Hidden", tier: "rare", art_url: null, emblem_key: null, number: 3 }} locked />);
    const card = screen.getByRole("figure");
    expect(card).toHaveAttribute("data-locked", "true");
    expect(card).not.toHaveTextContent("Secret");
    expect(card).toHaveTextContent("No. 03");
  });
});

describe("the Scavenger Hunt", () => {
  it("lists the QR points with their scan counts, fresher from the live feed", async () => {
    await open("Scavenger Hunt");
    const table = await screen.findByRole("table", { name: "QR points" });
    expect(within(table).getByText("Registration pillar")).toBeInTheDocument();
    expect(within(table).getByText("Hall A")).toBeInTheDocument();
    await waitFor(() => expect(within(table).getAllByRole("row")[1]).toHaveTextContent("44"));
    expect(within(table).getAllByRole("row")[2]).toHaveTextContent("12");
    for (const h of ["No.", "Placed at", "Zone", "Points", "Scans"]) expect(within(table).getByRole("columnheader", { name: h })).toBeInTheDocument();
  });

  it("shows the clue on a phone as it is typed, and refuses one over 140", async () => {
    await open("Scavenger Hunt");
    fireEvent.click(await screen.findByRole("button", { name: "Open QR point 1" }));
    const phone = await screen.findByRole("group", { name: "Phone preview of the clue" });
    expect(phone).toHaveTextContent("Where you collected your badge.");
    expect(phone).toHaveTextContent("+30 pts");
    const clue = screen.getByLabelText("Clue");
    fireEvent.change(clue, { target: { value: "Behind the big red door." } });
    expect(phone).toHaveTextContent("Behind the big red door.");
    fireEvent.change(clue, { target: { value: "c".repeat(141) } });
    expect(screen.getByText("At most 140 characters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save QR point" })).toBeDisabled();
    fireEvent.change(clue, { target: { value: "Behind the big red door." } });
    fireEvent.change(screen.getByLabelText("Points"), { target: { value: "20" } });
    expect(screen.getByText("A whole number from 30 to 100.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Points"), { target: { value: "75" } });
    fireEvent.change(screen.getByLabelText("Hint"), { target: { value: "h".repeat(101) } });
    expect(screen.getByText("At most 100 characters.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Hint"), { target: { value: "Look left." } });
    fireEvent.click(screen.getByRole("button", { name: "Save QR point" }));
    await waitFor(() => expect(sent("PATCH", "/hunt/points/p1")[0]).toBeTruthy());
    expect(sent("PATCH", "/hunt/points/p1")[0]!.body).toEqual({ label: "Registration pillar", clue: "Behind the big red door.", zone: "Lobby", base_points: 75, hint: "Look left." });
  });

  it("adds a QR point", async () => {
    await open("Scavenger Hunt");
    fireEvent.click(await screen.findByRole("button", { name: /Add a QR point/ }));
    expect(screen.getByRole("button", { name: "Add QR point" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Placed at"), { target: { value: "Food court" } });
    fireEvent.change(screen.getByLabelText("Clue"), { target: { value: "Where the smell comes from." } });
    fireEvent.click(screen.getByRole("button", { name: "Add QR point" }));
    await waitFor(() => expect(sent("POST", "/hunt/points")[0]).toBeTruthy());
    expect(sent("POST", "/hunt/points")[0]!.body).toMatchObject({ label: "Food court", clue: "Where the smell comes from.", base_points: 30 });
  });

  it("offers the buttons each state allows", async () => {
    expect(S.huntActions("draft")).toEqual(["start"]);
    expect(S.huntActions("scheduled")).toEqual(["start"]);
    expect(S.huntActions("live")).toEqual(["pause", "extend", "end"]);
    expect(S.huntActions("paused")).toEqual(["resume", "extend", "end"]);
    expect(S.huntActions("ended")).toEqual(["extend"]);
    await open("Scavenger Hunt");
    expect(await screen.findByRole("button", { name: "Start the hunt" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start the hunt" }));
    await waitFor(() => expect(sent("POST", "/hunt/start")).toHaveLength(1));
    expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extend" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(sent("POST", "/hunt/pause")).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    await waitFor(() => expect(sent("POST", "/hunt/resume")).toHaveLength(1));
  });

  it("will not start without a QR point", async () => {
    state.points = [];
    await open("Scavenger Hunt");
    expect(await screen.findByRole("button", { name: "Start the hunt" })).toBeDisabled();
  });

  it("ends only after asking, and extends by a number of minutes", async () => {
    state.hunt = { ...HUNT, status: "live" };
    await open("Scavenger Hunt");
    fireEvent.click(await screen.findByRole("button", { name: "End the hunt" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(sent("POST", "/hunt/end")).toHaveLength(0);
    fireEvent.click(within(confirm).getByRole("button", { name: "End the hunt" }));
    await waitFor(() => expect(sent("POST", "/hunt/end")).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", { name: "Extend" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Minutes to add"), { target: { value: "0" } });
    expect(within(dialog).getByRole("button", { name: "Add time" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Minutes to add"), { target: { value: "15" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add time" }));
    await waitFor(() => expect(sent("POST", "/hunt/extend")[0]).toBeTruthy());
    expect(sent("POST", "/hunt/extend")[0]!.body).toEqual({ minutes: 15 });
  });

  it("saves the settings that changed", async () => {
    await open("Scavenger Hunt");
    fireEvent.change(await screen.findByLabelText("Length in minutes"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("radio", { name: "Any order" }));
    fireEvent.change(screen.getByLabelText("Early bonus: first"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Early bonus: points"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Hint cost"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(sent("PUT", "/games/hunt")[0]).toBeTruthy());
    expect(sent("PUT", "/games/hunt")[0]!.body).toEqual({ duration_minutes: 120, mode: "free", bonus_n: 5, bonus_pts: 25, hint_cost: 15 });
    fireEvent.change(screen.getByLabelText("Length in minutes"), { target: { value: "2" } });
    expect(screen.getByText(/A whole number of minutes, 5 to 720/)).toBeInTheDocument();
  });

  it("links the printable QR codes and shows live scans and flagged fast claims", async () => {
    await open("Scavenger Hunt");
    const print = await screen.findByRole("link", { name: /Print QR codes/ });
    expect(print.getAttribute("href")).toMatch(/\/events\/42\/games\/hunt\/points\.pdf$/);
    const flags = await screen.findByRole("region", { name: "Flagged claims" });
    expect(flags).toHaveTextContent("Asha K.");
    expect(flags).toHaveTextContent("3 finds");
    expect(flags).toHaveTextContent("Lobby, Hall A, Hall C");
    expect(screen.getByRole("region", { name: "Recent finds" })).toHaveTextContent("Ben T. found a code");
    expect(screen.getByText("Finished every point")).toBeInTheDocument();
  });

  it("draws a clue phone on its own", () => {
    render(<CluePhone clue="" number={null} points={30} theme="mono_night" />);
    expect(screen.getByRole("group", { name: "Phone preview of the clue" })).toHaveTextContent("The clue you write shows here.");
  });

  it("reads a hunt's length from its start and end when the server sends no minutes", () => {
    expect(S.durationOf({ duration_minutes: null, starts_at: "2026-11-28T04:00:00Z", ends_at: "2026-11-28T05:30:00Z" })).toBe(90);
    expect(S.durationOf({ duration_minutes: 45, starts_at: null, ends_at: null })).toBe(45);
  });
});

describe("players", () => {
  it("searches, and shows opt-outs as Player #n", async () => {
    await open("Players");
    expect(await screen.findByText("Ben Thomas")).toBeInTheDocument();
    expect(screen.getByText(/shown as Asha K\./)).toBeInTheDocument();
    expect(screen.getByText(/shown as Player #247/)).toBeInTheDocument();
    expect(screen.getByText("Opted out")).toBeInTheDocument();
    expect(screen.getByText("PIN locked")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search players"), { target: { value: "asha" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/games/players") && c.options?.query?.q === "asha")).toBe(true));
  });

  it("filters to opt-outs", async () => {
    await open("Players");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Only players who opted out" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/games/players") && c.options?.query?.public === "false")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Asha Kumar")).toBeNull());
  });

  it("resets a PIN only after asking", async () => {
    const { toast } = await import("@moa/ui");
    const success = vi.spyOn(toast, "success");
    await open("Players");
    fireEvent.click(await screen.findByRole("button", { name: "Reset PIN for Ben Thomas" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/old badge code and any open game session stop working/)).toBeInTheDocument();
    expect(sent("POST", "/reset-pin")).toHaveLength(0);
    fireEvent.click(within(confirm).getByRole("button", { name: "Reset PIN" }));
    await waitFor(() => expect(sent("POST", "/reset-pin")).toHaveLength(1));
    expect(sent("POST", "/reset-pin")[0]!.path).toBe(`/api/v1/events/${EVENT}/games/players/r2/reset-pin`);
    // The answer's new PIN is read out to the desk.
    await waitFor(() => expect(success).toHaveBeenCalledWith("PIN reset", { description: expect.stringContaining("New PIN for Ben Thomas: 7302") }));
  });

  it("shows each player's heroes and points", async () => {
    await open("Players");
    expect(await screen.findByText("3 heroes · 120 points")).toBeInTheDocument();
    expect(screen.getByText("1 hero · 0 points")).toBeInTheDocument();
  });

  it("downloads each board as CSV, top 20 or everyone", async () => {
    await open("Players");
    const href = async (name: string) => (await screen.findByRole("link", { name })).getAttribute("href");
    expect(await href("Download top 20 for Hero Cards as CSV")).toMatch(/\/games\/export\.csv\?game=cards$/);
    expect(await href("Download everyone for Hero Cards as CSV")).toMatch(/\/games\/export\.csv\?game=cards&all=1$/);
    expect(await href("Download top 20 for Scavenger Hunt as CSV")).toMatch(/\?game=hunt$/);
    expect(await href("Download everyone for Scavenger Hunt as CSV")).toMatch(/\?game=hunt&all=1$/);
  });
});

describe("the plan and who may change things", () => {
  it("says a game is available on a plan the club lacks, and leaves its switch alone", async () => {
    state.entitlements = { enforced: true, features: { game_cards: false, game_hunt: true } };
    await open();
    expect(await screen.findByText(/Hero card game is available on Pro and up/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Hero Cards" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Scavenger Hunt" })).toBeEnabled();
    expect(screen.queryByText(/Scavenger hunt is available on/)).toBeNull();
  });

  it("puts the notice on the Hero Cards pages too, readable but locked", async () => {
    state.entitlements = { enforced: true, features: { game_cards: false, game_hunt: true } };
    await open("Card designer");
    expect(await screen.findByText(/Hero card game is available on Pro and up/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add a hero/ })).toBeNull();
    expect(await screen.findByRole("list", { name: "Heroes" })).toBeInTheDocument();
  });

  it("shows no notice when the plan has both, or plans are not enforced", async () => {
    await open();
    await screen.findByRole("switch", { name: "Hero Cards" });
    expect(screen.queryByText(/is available on/)).toBeNull();
  });

  it("lets staff watch but not change anything", async () => {
    access.can = { edit_events: false, exports: false };
    await open();
    expect(await screen.findByText("Read only")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Hero Cards" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save look" })).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Hero Cards" }), { button: 0 });
    fireEvent.click(screen.getByRole("tab", { name: "Hero Cards" }));
    expect(await screen.findByText("Live monitor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save rules" })).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Players" }), { button: 0 });
    fireEvent.click(screen.getByRole("tab", { name: "Players" }));
    await screen.findByText("Ben Thomas");
    expect(screen.queryByRole("button", { name: /Reset PIN/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /as CSV/ })).toBeNull();
  });
});

describe("the ID card designer's field list", () => {
  it("offers Game QR and Game PIN on a badge, and on nothing else", async () => {
    const { DESIGN_TOKENS } = await import("@moa/layout");
    for (const [key, label] of [["game_qr", "Game QR"], ["game_pin", "Game PIN"]] as const) {
      const t = DESIGN_TOKENS.find((x) => x.key === key);
      expect(t).toMatchObject({ label, kinds: ["badge"] });
    }
  });
});

describe("aligned with the backend as built", () => {
  it("reads the screen's {url, token, version}", () => {
    expect(S.screenSchema.parse(SCREEN)).toEqual({ url: SCREEN.url, token: "s.42.1.abc", version: 1 });
  });

  it("reads a hero's art, art_url and revealed, and takes revealed as the lock", () => {
    const h = S.heroSchema.parse(hero(4, "rare", { art: "heroes/42/h4.webp", art_url: "https://cdn.example/h4.webp", reveals: 9, holders: 12, revealed: true }));
    expect(h).toMatchObject({ art: "heroes/42/h4.webp", art_url: "https://cdn.example/h4.webp", revealed: true });
    expect(S.isRevealed(h)).toBe(true);
    expect(S.isRevealed(S.heroSchema.parse(hero(5, "common", { reveals: 5, revealed: false })))).toBe(false);
    expect(S.isRevealed(S.heroSchema.parse(hero(5, "common", { reveals: 5, revealed: undefined })))).toBe(true);
  });

  it("reads the live monitor's floor, heroes and tier shares", () => {
    const l = S.cardLiveSchema.parse(LIVE);
    expect(l).toMatchObject({ legendary_floor: 4, heroes: 5 });
    expect(l.tiers[0]).toMatchObject({ tier: "common", share: 52 });
  });

  it("reads the hunt's live feed in its documented fields", () => {
    const l = S.huntLiveSchema.parse(HUNT_LIVE);
    expect(l.points).toEqual([{ id: "p1", number: 1, label: "Registration pillar", zone: "Lobby", scans: 44 }]);
    expect(l.finishers).toBe(2);
    expect(l.flags[0]).toMatchObject({ registration_id: "r9", claims: 3, first_at: "2026-11-28T05:00:00Z" });
    expect(l.recent).toEqual([{ name: "Ben T.", at: "2026-11-28T05:01:00Z" }]);
    expect(S.huntLiveSchema.parse({ ...HUNT_LIVE, finishers: [{ name: "a" }, { name: "b" }, { name: "c" }] }).finishers).toBe(3);
  });

  it("reads the hunt's points from GET hunt, with their QR code", async () => {
    await open("Scavenger Hunt");
    expect(await screen.findByText("Registration pillar")).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/hunt/points") && c.method === "GET")).toBe(false);
    expect(S.huntSchema.parse({ ...HUNT, points: POINTS }).points).toHaveLength(2);
    expect(S.pointSchema.parse(POINTS[0]).code).toBe("p.42.abc.mac");
  });

  it("reads players' heroes, points and last seen", () => {
    expect(S.playersSchema.parse(PLAYERS).items[0]).toMatchObject({ heroes: 3, points: 120, last_seen_at: "2026-11-28T05:00:00Z" });
  });

  it("shows the server's own warnings about the saved rules", async () => {
    state.config = { ...CONFIG, preset: "hard", shares: { common: 60, uncommon: 28, rare: 10, legendary: 2 }, warnings: [{ code: "SMALL_EVENT_HARD", message: "Hard needs a crowd: only 12 are registered." }] };
    await open("Hero Cards");
    expect(await screen.findByText("Hard needs a crowd: only 12 are registered.")).toBeInTheDocument();
  });

  it("says each hero, art, hunt and rules refusal in plain words", async () => {
    const { ApiError } = await import("@moa/api");
    const { errorText } = await import("./lib/errors");
    const refuse = (error_code: string, errors: unknown = null, status = 409) =>
      errorText(new ApiError({ status, errorCode: error_code, message: "server words", fieldErrors: errors as never }));
    expect(refuse("HERO_REVEALED")).toMatch(/already revealed this hero/);
    expect(refuse("MIN_HEROES", null, 422)).toMatch(/at least 4 heroes/);
    expect(refuse("MAX_HEROES", null, 422)).toMatch(/at most 20 heroes/);
    expect(refuse("ART_TOO_SMALL", null, 422)).toMatch(/900 × 1200/);
    expect(refuse("ART_SHAPE", null, 422)).toMatch(/3:4 portrait/);
    expect(refuse("ART_TOO_BIG", null, 422)).toMatch(/over 5 MB/);
    expect(refuse("ART_NOT_IMAGE", null, 422)).toMatch(/can't be read as a picture/);
    expect(refuse("ART_FORMAT", null, 422)).toMatch(/PNG, JPG or WebP/);
    expect(refuse("HUNT_STARTED")).toMatch(/hunt has started/);
    expect(refuse("HUNT_HAS_CLAIMS")).toMatch(/already found codes/);
    expect(refuse("NO_POINTS", null, 422)).toMatch(/at least one QR point/);
    expect(refuse("SHARES_NOT_100", { total: 98 } as never, 422)).toBe("The four shares total 98%. They must total 100%.");
    expect(refuse("TIER_NEEDS_HERO", null, 422)).toMatch(/needs at least one hero/);
    // Anything else keeps the server's words.
    expect(refuse("SOMETHING_ELSE")).toBe("server words");
  });

  it("shows a refused save in plain words (SHARES_NOT_100)", async () => {
    const { api } = await import("@moa/app-kit");
    const { ApiError } = await import("@moa/api");
    const { toast } = await import("@moa/ui");
    const error = vi.spyOn(toast, "error");
    vi.mocked(api.patch).mockImplementationOnce(async () => {
      throw new ApiError({ status: 422, errorCode: "SHARES_NOT_100", message: "server words", fieldErrors: { total: 99 } as never });
    });
    await open("Hero Cards");
    fireEvent.change(await screen.findByLabelText("Common share"), { target: { value: "51" } });
    fireEvent.change(screen.getByLabelText("Uncommon share"), { target: { value: "31" } });
    fireEvent.change(screen.getByLabelText("Rare share"), { target: { value: "13" } });
    fireEvent.change(screen.getByLabelText("Legendary share"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("The four shares total 99%. They must total 100%."));
  });

  it("reads the 403 PLAN_FEATURE_LOCKED shape into an upgrade lock", async () => {
    const { ApiError } = await import("@moa/api");
    const { planLockFromError, isPlanLockError } = await import("@/features/plan/errors");
    const err = new ApiError({
      status: 403,
      errorCode: "PLAN_FEATURE_LOCKED",
      message: "Hero Cards needs the Pro plan.",
      fieldErrors: { feature: "game_cards", label: "Hero card game", required_plan: "pro", upgrade_url: "/billing" } as never,
    });
    expect(isPlanLockError(err)).toBe(true);
    expect(planLockFromError(err)).toMatchObject({ kind: "feature", key: "game_cards", label: "Hero card game", requiredPlan: "pro" });
  });

  it("lists the latest screen events, hides one and shows it again", async () => {
    await open();
    const feed = await screen.findByRole("list", { name: "Screen feed" });
    expect(within(feed).getByText("Asha K. pulled a Rare card")).toBeInTheDocument();
    expect(within(feed).getByText("Hidden")).toBeInTheDocument();
    fireEvent.click(within(feed).getByRole("button", { name: "Hide: Asha K. pulled a Rare card" }));
    await waitFor(() => expect(sent("PATCH", "/games/feed/31")).toHaveLength(1));
    expect(sent("PATCH", "/games/feed/31")[0]!.body).toEqual({ hidden: true });
    fireEvent.click(within(feed).getByRole("button", { name: "Show: Ben T. found a code" }));
    await waitFor(() => expect(sent("PATCH", "/games/feed/30")).toHaveLength(1));
    expect(sent("PATCH", "/games/feed/30")[0]!.body).toEqual({ hidden: false });
  });

  it("gives staff the feed to read, without the buttons", async () => {
    access.can = { edit_events: false, exports: false };
    await open();
    const feed = await screen.findByRole("list", { name: "Screen feed" });
    expect(within(feed).getByText("Ben T. found a code")).toBeInTheDocument();
    expect(within(feed).queryByRole("button")).toBeNull();
  });
});
