import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test/render";

import { PostersPage } from "./components/posters-page";
import { captionPreview, momentProblems } from "./components/posters-page";
import { posterSettingsSchema, posterStatsSchema } from "./schemas";

/**
 * The Posters page (posters contract §10): the switch, off by default, and
 * what guests see; the moments with their phrases and captions (tokens
 * checked, a live preview); the formats; the designs; the numbers; and the
 * same page, read only, for door staff. The API is stubbed in its shapes.
 */

const SETTINGS = {
  enabled: false,
  formats: ["square", "portrait", "story"],
  moments: {
    before: { enabled: true, phrase: "I'm attending", caption: "{{moment_phrase}} {{event_name}}! Join me: {{share_url}}" },
    during: { enabled: false, phrase: "I'm here at", caption: "{{moment_phrase}} {{event_name}}! Join me: {{share_url}}" },
    after: { enabled: false, phrase: "I attended", caption: "{{moment_phrase}} {{event_name}}! Join me: {{share_url}}" },
  },
  available_formats: [
    { key: "square", width: 1080, height: 1080, label: "Square" },
    { key: "portrait", width: 1080, height: 1350, label: "Portrait" },
    { key: "story", width: 1080, height: 1920, label: "Story" },
  ],
  poster_url_token: "{{poster_url}}",
  updated_at: null,
};
const STATS = {
  enabled: true,
  guests_eligible: 412,
  posters_made: 133,
  with_photo: 120,
  renders: 210,
  downloads: 98,
  shares: 61,
  copies: 12,
  link_clicks: 340,
  link_uniques: 290,
  registrations: 18,
  requests: 25,
  checked_in: 0,
  by_moment: { before: 133, during: 0, after: 0 },
  by_format: { square: 80, portrait: 30, story: 60 },
  top: [{ name: "Meera Pillai", role: "speaker", clicks: 40, registrations: 4, requests: 6 }],
  tracking_link_id: "0b6c3d8e-1111-2222-3333-444455556666",
};

const api = {
  settings: vi.fn(async (): Promise<unknown> => SETTINGS),
  save: vi.fn(async (_id: number, patch: Record<string, unknown>): Promise<unknown> => ({ ...SETTINGS, ...patch })),
  stats: vi.fn(async (): Promise<unknown> => STATS),
};
const access = { can: { edit_events: true } as Record<string, boolean>, roleLabel: "Owner" };
const removeVariant = vi.fn();

vi.mock("./api", () => ({
  fetchPosterSettings: async () => posterSettingsSchema.parse(await api.settings()),
  savePosterSettings: async (id: number, patch: Record<string, unknown>) => posterSettingsSchema.parse(await api.save(id, patch)),
  fetchPosterStats: async () => posterStatsSchema.parse(await api.stats()),
}));
vi.mock("@/features/access", () => ({ useAccess: () => access }));
vi.mock("@/features/events", () => ({ useEventDetail: (id: number) => ({ data: id ? { id, name: "DevFest 2026" } : undefined }) }));
vi.mock("@/features/designer", async () => {
  const { savedFormatsNote } = await import("@/features/designer/components/poster-tab");
  return {
    PosterThumb: ({ format, values }: { format: string; values?: Record<string, string> }) => (
      <div data-testid="poster-thumb" data-format={format}>
        {values?.moment_phrase}
      </div>
    ),
    SAMPLE_SHARE_URL: "https://myotherapp.in/l/samplecd",
    savedFormatsNote,
    usePosterVariants: () => ({
      isPending: false,
      data: {
        variants: [
          { variant: "default", label: "Everyone", formats: { square: { saved: true }, portrait: { saved: true }, story: { saved: true } } },
          { variant: "role:speaker", label: "Speakers", formats: { square: { saved: true }, portrait: { saved: false }, story: { saved: false } } },
        ],
        options: [
          { variant: "default", label: "Everyone" },
          { variant: "role:speaker", label: "Speakers" },
          { variant: "role:volunteer", label: "Volunteers" },
          { variant: "type:12", label: "Ticket: VIP" },
        ],
      },
    }),
    useDeletePosterVariant: () => ({ mutateAsync: removeVariant, isPending: false }),
  };
});

const saveBar = () => screen.getByRole("region", { name: "Save" });

beforeEach(() => {
  api.settings.mockClear();
  api.save.mockClear();
  api.stats.mockClear();
  api.settings.mockImplementation(async () => SETTINGS);
  api.stats.mockImplementation(async () => STATS);
  access.can = { edit_events: true };
  removeVariant.mockReset();
});

describe("the switch", () => {
  it("is off by default, says so, and shows no numbers yet", async () => {
    api.stats.mockImplementation(async () => ({ ...STATS, enabled: false, posters_made: 0 }));
    render(<PostersPage eventId={42} />);
    const sw = await screen.findByRole("switch", { name: "Guest posters" });
    expect(sw).not.toBeChecked();
    expect(screen.getByText(/Off: guests see nothing about posters/)).toBeInTheDocument();
    expect(screen.queryByText("Posters made")).not.toBeInTheDocument();
    // What guests would see: the default design with the sample guest, and the caption shared with it.
    expect(screen.getByTestId("poster-thumb")).toHaveAttribute("data-format", "square");
    expect(screen.getAllByText("I'm attending DevFest 2026! Join me: https://myotherapp.in/l/samplecd").length).toBeGreaterThan(0);
  });

  it("switches on at once", async () => {
    render(<PostersPage eventId={42} />);
    fireEvent.click(await screen.findByRole("switch", { name: "Guest posters" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(42, { enabled: true }));
    expect(await screen.findByText(/Guests whose ticket was sent see “Make your poster”/)).toBeInTheDocument();
    // The poster link for the ticket email.
    expect(screen.getByRole("button", { name: "Copy {{poster_url}}" })).toBeInTheDocument();
  });

  it("asks before switching off", async () => {
    api.settings.mockImplementation(async () => ({ ...SETTINGS, enabled: true }));
    render(<PostersPage eventId={42} />);
    fireEvent.click(await screen.findByRole("switch", { name: "Guest posters" }));
    const dialog = await screen.findByRole("dialog");
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: /Switch off/ }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(42, { enabled: false }));
  });
});

describe("the moments", () => {
  it("shows each moment's rule, and opens a moment's phrase and caption when it is switched on", async () => {
    render(<PostersPage eventId={42} />);
    expect(await screen.findByText("Once their ticket is sent.")).toBeInTheDocument();
    expect(screen.getByText("Once they are checked in, until the event ends.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Phrase on the poster", { selector: "#poster-during-phrase" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Posters during the event" }));
    expect(screen.getByDisplayValue("I'm here at")).toBeInTheDocument();
  });

  it("previews the caption as it is written, and saves the phrase trimmed", async () => {
    render(<PostersPage eventId={42} />);
    const phrase = await screen.findByDisplayValue("I'm attending");
    fireEvent.change(phrase, { target: { value: "  I'm speaking at " } });
    const caption = screen.getByLabelText("Caption shared with it");
    fireEvent.change(caption, { target: { value: "{{moment_phrase}} {{event_name}} #DevFest {{share_url}}" } });
    expect(screen.getAllByText(/I'm speaking at DevFest 2026 #DevFest https:\/\/myotherapp\.in\/l\/samplecd/).length).toBeGreaterThan(0);
    fireEvent.click(within(saveBar()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    const [, patch] = api.save.mock.calls.at(-1)!;
    expect(patch).toMatchObject({
      formats: ["square", "portrait", "story"],
      moments: { before: { enabled: true, phrase: "I'm speaking at", caption: "{{moment_phrase}} {{event_name}} #DevFest {{share_url}}" } },
    });
  });

  it("inserts a token where the cursor is", async () => {
    render(<PostersPage eventId={42} />);
    const caption = (await screen.findByLabelText("Caption shared with it")) as HTMLTextAreaElement;
    fireEvent.change(caption, { target: { value: "Hi " } });
    caption.setSelectionRange(3, 3);
    fireEvent.click(within(screen.getByRole("group", { name: "Insert into the caption" })).getByRole("button", { name: "{{first_name}}" }));
    expect(caption).toHaveValue("Hi {{first_name}}");
  });

  it("refuses a caption with a token that is not one, and an empty phrase, before saving", async () => {
    render(<PostersPage eventId={42} />);
    fireEvent.change(await screen.findByLabelText("Caption shared with it"), { target: { value: "Join me {{shareurl}}" } });
    expect(screen.getByText(/\{\{shareurl\}\} is not a token/)).toBeInTheDocument();
    expect(within(saveBar()).getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Caption shared with it"), { target: { value: "Join me {{share_url}}" } });
    fireEvent.change(screen.getByDisplayValue("I'm attending"), { target: { value: "   " } });
    expect(screen.getByText(/Write a phrase/)).toBeInTheDocument();
    expect(within(saveBar()).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("warns when every moment is off", async () => {
    render(<PostersPage eventId={42} />);
    fireEvent.click(await screen.findByRole("switch", { name: "Posters before the event" }));
    expect(screen.getByText(/With every moment off, no guest can make a poster/)).toBeInTheDocument();
  });

  it("discards changes", async () => {
    render(<PostersPage eventId={42} />);
    fireEvent.change(await screen.findByDisplayValue("I'm attending"), { target: { value: "Going to" } });
    fireEvent.click(within(saveBar()).getByRole("button", { name: "Discard" }));
    expect(screen.getByDisplayValue("I'm attending")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Save" })).not.toBeInTheDocument();
  });
});

describe("the formats", () => {
  it("keeps at least one, and saves the ones on", async () => {
    render(<PostersPage eventId={42} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Portrait/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Story/ }));
    expect(screen.getByRole("checkbox", { name: /Square/ })).toBeDisabled();
    fireEvent.click(within(saveBar()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls.at(-1)![1]).toMatchObject({ formats: ["square"] });
  });
});

describe("the designs", () => {
  it("lists the variants with their formats, links each to the board, and offers the rest", async () => {
    render(<PostersPage eventId={42} />);
    expect(await screen.findByText("Its own square, portrait and story layouts.")).toBeInTheDocument();
    expect(screen.getByText("Its own square layout; portrait and story follow the next design in line.")).toBeInTheDocument();
    const edits = screen.getAllByRole("link", { name: "Edit" });
    expect(edits.map((a) => a.getAttribute("href"))).toEqual(["/events/42/design?kind=poster&variant=default", "/events/42/design?kind=poster&variant=role%3Aspeaker"]);
    const add = screen.getByLabelText("A design of their own for") as HTMLSelectElement;
    expect([...add.options].map((o) => o.textContent)).toEqual(["Choose…", "Volunteers", "Ticket: VIP"]);
    fireEvent.change(add, { target: { value: "type:12" } });
    expect(screen.getByRole("link", { name: /Design it/ })).toHaveAttribute("href", "/events/42/design?kind=poster&variant=type%3A12");
  });

  it("removes a variant after asking", async () => {
    removeVariant.mockResolvedValue({});
    render(<PostersPage eventId={42} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove the design for Speakers" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Remove/ }));
    await waitFor(() => expect(removeVariant).toHaveBeenCalledWith("role:speaker"));
  });
});

describe("the numbers", () => {
  it("shows posters made, shared, clicks and registrations brought in, and the best sharers", async () => {
    api.settings.mockImplementation(async () => ({ ...SETTINGS, enabled: true }));
    render(<PostersPage eventId={42} />);
    expect(await screen.findByText("Posters made")).toBeInTheDocument();
    expect(screen.getByText(/of 412 guests who can make one · 120 with a photo/)).toBeInTheDocument();
    expect(screen.getByText("159")).toBeInTheDocument(); // 61 shared + 98 downloaded
    expect(screen.getByText("340")).toBeInTheDocument();
    expect(screen.getByText("43")).toBeInTheDocument(); // 18 registered + 25 requests
    expect(screen.getByText("18 registered · 25 asked to join")).toBeInTheDocument();
    const row = screen.getByText("Meera Pillai").closest("tr")!;
    expect(row).toHaveTextContent("Speaker");
    expect(row).toHaveTextContent("10");
  });
});

describe("for door staff", () => {
  it("is read only", async () => {
    access.can = { edit_events: false };
    render(<PostersPage eventId={42} />);
    expect(await screen.findByText(/Your role can see the posters' settings and numbers/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Guest posters" })).toBeDisabled();
    expect(screen.getByDisplayValue("I'm attending")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Remove the design/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("A design of their own for")).not.toBeInTheDocument();
  });
});

describe("an API without posters", () => {
  it("says they are not here yet", async () => {
    const { ApiError } = await import("@moa/api");
    api.settings.mockImplementation(async () => {
      throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
    });
    render(<PostersPage eventId={42} />);
    expect(await screen.findByText("Posters are not here yet")).toBeInTheDocument();
  });
});

describe("the checks", () => {
  it("are the API's: a phrase of 1–60, a caption of tokens that exist", () => {
    expect(momentProblems({ enabled: true, phrase: "x".repeat(61), caption: "" }).phrase).toBe("At most 60 characters.");
    expect(momentProblems({ enabled: true, phrase: "Hi", caption: "{{talk_title}} {{organisation}} {{event_day}}" })).toEqual({});
    expect(momentProblems({ enabled: true, phrase: "Hi", caption: "x".repeat(501) }).caption).toBe("At most 500 characters.");
    expect(captionPreview({ enabled: true, phrase: "", caption: "{{moment_phrase}}!" }, undefined)).toBe("I'm attending!");
  });
});
