import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * The Look tab: presets, colours under the contrast rule (instant from the
 * editor's own arithmetic, then the server's verdict), pictures, the rest
 * of the look's controls, saving it whole, going back to the room's own
 * look, the live preview, and the big screen's controls.
 */

type Call = { method: string; path: string; body?: unknown; headers?: Record<string, string> };
const calls: Call[] = [];

const { presetDraft, resolveDraft, judge } = await import("./theme");
type Draft = ReturnType<typeof presetDraft>;

const out = (custom: boolean, draft: Draft = presetDraft("meridian_dark")) => ({ custom, theme: resolveDraft(draft, {}, null), version: custom ? "c0ffee00" : "0d0d0d0d", warnings: [], updated_at: custom ? "2026-11-21T10:00:00Z" : null });
const CLUB_LOGO = { id: null, kind: "logo", thumbnail: "https://cdn.test/club-t.png", medium: "https://cdn.test/club-m.png", large: "https://cdn.test/club-l.png", original: "https://cdn.test/club.png" };

const state: {
  theme: ReturnType<typeof out> | "missing";
  control: Record<string, unknown>;
  checkErrors: Array<Record<string, unknown>> | null;
  media: unknown[];
} = { theme: out(false), control: {}, checkErrors: null, media: [] };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const write = (method: string) =>
    vi.fn(async (path: string, body?: unknown, options?: { headers?: Record<string, string> }) => {
      calls.push({ method, path, body, headers: options?.headers });
      const rest = path.replace("/api/v1/events/37/live", "");
      if (rest === "/theme/check") {
        const d = body as Draft;
        const v = judge(d);
        const errors = state.checkErrors ?? v.errors;
        return { ok: errors.length === 0, errors, warnings: v.warnings, theme: resolveDraft(d, {}, null), version: "check000" };
      }
      if (method === "PUT" && rest === "/theme") return { ...out(true, body as Draft), warnings: judge(body as Draft).warnings };
      if (method === "DELETE" && rest === "/theme") return out(false);
      if (method === "PUT" && rest === "/screen/control") return (state.control = { ...state.control, ...(body as object) });
      if (method === "POST" && rest === "/media") return { id: "6f1c2a9e-0000-4000-8000-000000000001", kind: (body as FormData).get("kind"), thumbnail: "https://cdn.test/new-t.png", medium: "https://cdn.test/new-m.png", large: "https://cdn.test/new-l.png", original: "https://cdn.test/new.png" };
      return {};
    });
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { headers?: Record<string, string> }) => {
        calls.push({ method: "GET", path, headers: options?.headers });
        const rest = path.replace("/api/v1/events/37/live", "");
        if (rest === "/theme") {
          if (state.theme === "missing") throw new ApiError({ message: "Not Found", status: 404, routeMissing: true });
          return state.theme;
        }
        if (rest === "/theme/presets")
          return (["meridian_light", "meridian_dark", "high_contrast", "club"] as const).map((key) => ({
            key,
            name: key,
            theme: key === "club" ? resolveDraft(presetDraft("club", { brand_primary: "#F2AA4C", logo: true }), {}, CLUB_LOGO) : resolveDraft(presetDraft(key), {}, null),
          }));
        if (rest === "/media") return state.media;
        if (rest === "/screen/control") return state.control;
        if (path === "/api/v1/events/info/37") return { id: 37, name: "Space Night", slug: "space-night" };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: write("POST"),
      put: write("PUT"),
      patch: write("PATCH"),
      del: write("DELETE"),
    },
  };
});

const qr = vi.hoisted(() => ({ toDataURL: vi.fn(async (url: string) => `data:image/png;base64,${btoa(url)}`) }));
vi.mock("qrcode", () => ({ default: qr }));

const { toast } = await import("@moa/ui");
const { render } = await import("@/test/render");
const { LookPanel, ScreenModeSelect } = await import("./components/look-panel");

beforeEach(() => {
  calls.length = 0;
  state.theme = out(false);
  state.control = { mode: "auto", results: "live", ticker: false, idle_slides: [], slide_seconds: 12, wall_size: 6 };
  state.checkErrors = null;
  state.media = [];
  vi.restoreAllMocks();
});

const sent = (method: string, suffix: string) => calls.filter((c) => c.method === method && c.path.endsWith(suffix));
const stage = () => document.querySelector<HTMLElement>("[data-theme]")!;

describe("the look", () => {
  it("starts from the room's own look, and a preset changes the colours and the preview", async () => {
    render(<LookPanel eventId={37} />);
    expect(await screen.findByText("This event uses the room's own look. Pick a preset to give it yours.")).toBeInTheDocument();
    expect(screen.getByLabelText("Background")).toHaveValue("#0B0E0D");
    expect(stage()).toHaveAttribute("data-theme", "meridian_dark");
    // The phone beside the big screen draws the same look.
    expect(screen.getByLabelText("A guest's phone")).toBeInTheDocument();
    expect(screen.getAllByText("Which planet has the most known moons?")).toHaveLength(2);

    fireEvent.click(await screen.findByRole("radio", { name: /Meridian light/ }));
    expect(screen.getByLabelText("Background")).toHaveValue("#F4F5F2");
    expect(stage()).toHaveAttribute("data-theme", "meridian_light");
    // The club's colours come from the server, with its logo.
    fireEvent.click(screen.getByRole("radio", { name: /Club colours/ }));
    expect(screen.getByLabelText("Accent")).toHaveValue("#F2AA4C");
    expect(screen.getByRole("radio", { name: "The club's logo" })).toHaveAttribute("aria-checked", "true");
  });

  it("refuses an accent the room could not see, says why, and keeps Save off", async () => {
    render(<LookPanel eventId={37} />);
    const accent = await screen.findByLabelText("Accent");
    fireEvent.change(accent, { target: { value: "#1F2A2A" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/The accent needs more contrast with the background \(1\.\d+:1, at least 3:1\)/);
    expect(accent).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Use this look" })).toBeDisabled();
    expect(screen.getByText("Fix the colours above to save.")).toBeInTheDocument();
  });

  it("warns about an answer that blends in, still saves, and sends the whole look as this release's console", async () => {
    const said = vi.spyOn(toast, "success");
    render(<LookPanel eventId={37} />);
    fireEvent.change(await screen.findByLabelText("Answer D"), { target: { value: "#101413" } });
    expect(await screen.findByText("Answer D's colour is close to the background.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Colour + letter" }));
    fireEvent.click(screen.getByRole("radio", { name: "Ring" }));
    fireEvent.click(screen.getByRole("radio", { name: "Lobby, full screen" }));
    fireEvent.change(screen.getByLabelText("Heading font"), { target: { value: "bebas_neue" } });
    expect(screen.getByText("Capitals only: used for headings, never body text.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use this look" }));
    await waitFor(() => expect(sent("PUT", "/live/theme")).toHaveLength(1));
    const put = sent("PUT", "/live/theme")[0]!;
    expect(put.headers).toEqual({ "X-Live-Version": "2" });
    expect(put.body).toMatchObject({
      preset: "meridian_dark",
      colors: { background: "#0B0E0D", accent: "#4FCDB0" },
      answers: { style: "letters" },
      timer: "ring",
      font: { display: "bebas_neue", body: "dm_sans" },
      logo: null,
      screen: { join: "lobby", text_scale: 1, logo: true, sponsors: false, answer_layout: "grid" },
      guest: { background: "plain", answer_layout: "column", logo: true, text_scale: 1 },
      leaderboard: { size: 5, podium: true, animate: true, own_rank: true },
      background: { kind: "color", gradient: null, image: null, dim: 0.45 },
    });
    expect((put.body as Draft).colors.answers[3]).toBe("#101413");
    expect(put.body).not.toHaveProperty("text");
    await waitFor(() => expect(said).toHaveBeenCalledWith("Look saved — with a note on its colours"));
  });

  it("follows the server's verdict once it answers", async () => {
    state.checkErrors = [{ field: "background.gradient", code: "THEME_CONTRAST", message: "Text cannot be read on both ends of this gradient; bring its colours closer." }];
    render(<LookPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Gradient" }));
    expect(await screen.findByText("Text cannot be read on both ends of this gradient; bring its colours closer.", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use this look" })).toBeDisabled();
    expect(sent("POST", "/live/theme/check").length).toBeGreaterThan(0);
  });

  it("sets a gradient, the text sizes, the layouts and the board, and the phones' own background", async () => {
    render(<LookPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Gradient" }));
    fireEvent.change(screen.getByLabelText("Gradient to"), { target: { value: "#29335C" } });
    fireEvent.change(screen.getByLabelText("Gradient direction"), { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText("Big screen text size"), { target: { value: "1.3" } });
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Answer layout on phones" })).getByRole("radio", { name: "Grid" }));
    fireEvent.click(screen.getByRole("radio", { name: "Top 10" }));
    fireEvent.click(screen.getByRole("radio", { name: "This background" }));
    fireEvent.click(screen.getByRole("switch", { name: "Sponsor strip along the bottom" }));
    fireEvent.click(screen.getByRole("button", { name: "Use this look" }));
    await waitFor(() => expect(sent("PUT", "/live/theme")).toHaveLength(1));
    expect(sent("PUT", "/live/theme")[0]!.body).toMatchObject({
      background: { kind: "gradient", gradient: { from: "#0B0E0D", to: "#29335C", angle: 90 } },
      screen: { text_scale: 1.3, sponsors: true },
      guest: { background: "theme", answer_layout: "grid" },
      leaderboard: { size: 10 },
    });
  });

  it("uploads a logo and uses it", async () => {
    render(<LookPanel eventId={37} />);
    await screen.findByText("The look");
    const logo = screen.getByRole("radiogroup", { name: "Logo" });
    const input = logo.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(sent("POST", "/live/media")).toHaveLength(1));
    const form = sent("POST", "/live/media")[0]!.body as FormData;
    expect(form.get("kind")).toBe("logo");
    expect((form.get("file") as File).name).toBe("logo.png");
    fireEvent.click(screen.getByRole("button", { name: "Use this look" }));
    await waitFor(() => expect(sent("PUT", "/live/theme")).toHaveLength(1));
    expect(sent("PUT", "/live/theme")[0]!.body).toMatchObject({ logo: "6f1c2a9e-0000-4000-8000-000000000001" });
  });

  it("offers the pictures already uploaded, and deletes one", async () => {
    state.media = [{ id: "bg1", kind: "background", thumbnail: "https://cdn.test/bg-t.png", medium: "https://cdn.test/bg-m.png", large: "https://cdn.test/bg-l.png", original: null }];
    render(<LookPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("radio", { name: "Picture" }));
    fireEvent.click(screen.getByRole("radio", { name: "Uploaded picture" }));
    expect(screen.getByLabelText("How much the picture is dimmed")).toHaveValue("0.45");
    // The preview draws the picture under its dim.
    expect(document.querySelector<HTMLElement>("[data-theme] > div")!.style.backgroundImage).toContain("bg-l.png");
    fireEvent.click(screen.getByRole("button", { name: "Delete this picture" }));
    await waitFor(() => expect(sent("DELETE", "/live/media/bg1")).toHaveLength(1));
  });

  it("goes back to the room's own look once the host confirms", async () => {
    state.theme = out(true, presetDraft("high_contrast"));
    render(<LookPanel eventId={37} />);
    expect(await screen.findByText("This event has its own look on the big screen and every phone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save look" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use the room's own look" }));
    expect(sent("DELETE", "/live/theme")).toHaveLength(0);
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Use the room's own look" }));
    await waitFor(() => expect(sent("DELETE", "/live/theme")).toHaveLength(1));
  });

  it("says the look waits for the server's update on a server from before", async () => {
    state.theme = "missing";
    render(<LookPanel eventId={37} />);
    expect(await screen.findByText(/once this server has the update that brings it/)).toBeInTheDocument();
  });
});

describe("the big screen's controls", () => {
  it("change the screen at once", async () => {
    render(<LookPanel eventId={37} />);
    const shows = await screen.findByRole("radiogroup", { name: "What the big screen shows" });
    fireEvent.click(within(shows).getByRole("button", { name: "Q&A wall" }));
    await waitFor(() => expect(sent("PUT", "/live/screen/control")[0]?.body).toEqual({ mode: "qa" }));
    fireEvent.click(screen.getByRole("radio", { name: "Question only" }));
    await waitFor(() => expect(sent("PUT", "/live/screen/control")[1]?.body).toEqual({ results: "hidden" }));
    fireEvent.click(screen.getByRole("switch", { name: "Updates as a running ticker" }));
    await waitFor(() => expect(sent("PUT", "/live/screen/control")[2]?.body).toEqual({ ticker: true }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Sponsors" }));
    await waitFor(() => expect(sent("PUT", "/live/screen/control")[3]?.body).toEqual({ idle_slides: ["sponsors"] }));
    fireEvent.click(screen.getByRole("checkbox", { name: "What's on now and next" }));
    // Kept in the slides' own order whatever order they were ticked in.
    await waitFor(() => expect(sent("PUT", "/live/screen/control")[4]?.body).toEqual({ idle_slides: ["agenda", "sponsors"] }));
    fireEvent.change(screen.getByLabelText("Seconds per slide"), { target: { value: "20" } });
    await waitFor(() => expect(sent("PUT", "/live/screen/control")[5]?.body).toEqual({ slide_seconds: 20 }));
  });

  it("can be switched from the console's band", async () => {
    render(<ScreenModeSelect eventId={37} />);
    const select = await screen.findByLabelText("What the big screen shows");
    fireEvent.change(select, { target: { value: "leaderboard" } });
    await waitFor(() => expect(sent("PUT", "/live/screen/control")[0]?.body).toEqual({ mode: "leaderboard" }));
  });
});
