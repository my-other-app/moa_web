import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { toApiError } from "@moa/api";

/**
 * A club's own WhatsApp number on the admin's club page:
 * GET /admin/club-whatsapp/{club_id} answers whether it is connected, its
 * status, quality and limit -- and nothing a message said.
 */

let answer: unknown = null;
let fallbacks: unknown = null;
const calls: string[] = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push(path);
        if (path === "/api/v1/admin/club-whatsapp/5") {
          if (answer instanceof Error) throw answer;
          return answer;
        }
        if (path === "/api/v1/admin/club-whatsapp/fallbacks") {
          if (fallbacks instanceof Error) throw fallbacks;
          return fallbacks;
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubWhatsAppCard, WhatsAppFallbacksCard, clubWhatsAppSchema, tierWords } = await import("./index");

const CONNECTED = {
  club_id: 5,
  connected: true,
  status: "active",
  display_phone_number: "+91 98470 12345",
  verified_name: "Circuit Society",
  quality_rating: "YELLOW",
  messaging_limit_tier: "TIER_10K",
  quality_checked_at: "2026-10-24T08:00:00Z",
  verified_at: "2026-10-20T08:00:00Z",
  last_webhook_at: "2026-10-24T09:00:00Z",
  last_error: null,
  routing: true,
  connected_at: "2026-10-01T08:00:00Z",
  conversations: 42,
  plan_allows: true,
};

beforeEach(() => {
  calls.length = 0;
  answer = CONNECTED;
  fallbacks = { since: "2026-09-30T18:30:00Z", items: [] };
});

describe("a club's own WhatsApp, for an admin", () => {
  it("reads the server's shape, tolerating what it does not know", () => {
    const w = clubWhatsAppSchema.parse({ club_id: 5, status: "paused", conversations: "many" });
    expect(w).toMatchObject({ club_id: 5, connected: false, status: null, conversations: 0, plan_allows: false });
    expect(tierWords("TIER_10K")).toBe("10,000 a day");
  });

  it("shows the number, its status, quality and limit, and no message", async () => {
    render(<ClubWhatsAppCard clubId={5} />);
    const card = await screen.findByRole("region", { name: "WhatsApp" });
    expect(await within(card).findByText("+91 98470 12345")).toBeInTheDocument();
    expect(within(card).getByText("Connected")).toBeInTheDocument();
    expect(within(card).getByText("Quality: Medium")).toBeInTheDocument();
    expect(within(card).getByText("10,000 a day")).toBeInTheDocument();
    expect(within(card).getByText("The business portfolio's, shared by all its numbers")).toBeInTheDocument();
    expect(within(card).getByText("42")).toBeInTheDocument();
    expect(calls).toEqual(["/api/v1/admin/club-whatsapp/5"]);
  });

  it("says when the club has no number of its own, and whether its plan includes one", async () => {
    answer = { ...CONNECTED, connected: false, status: null, display_phone_number: null, conversations: 0, plan_allows: false };
    render(<ClubWhatsAppCard clubId={5} />);
    expect(await screen.findByText(/No WhatsApp number of its own/)).toHaveTextContent("Its plan doesn't include one (Enterprise).");
  });

  it("counts this month's sends from its own number and the fallbacks to MyOtherApp's", async () => {
    answer = { ...CONNECTED, club_sends_this_month: 120, fallbacks_this_month: 7 };
    render(<ClubWhatsAppCard clubId={5} />);
    const card = await screen.findByRole("region", { name: "WhatsApp" });
    expect(await within(card).findByText(/120 from its own number/)).toBeInTheDocument();
    expect(within(card).getByText(/7 fell back to MyOtherApp's/)).toBeInTheDocument();
  });

  it("leaves the month's line off for a server that doesn't count it", async () => {
    render(<ClubWhatsAppCard clubId={5} />);
    const card = await screen.findByRole("region", { name: "WhatsApp" });
    await within(card).findByText("+91 98470 12345");
    expect(within(card).queryByText("This month")).toBeNull();
  });

  it("shows what Meta said when the number stopped working", async () => {
    answer = { ...CONNECTED, status: "failed", last_error: "Meta didn't accept the access token." };
    render(<ClubWhatsAppCard clubId={5} />);
    expect(await screen.findByText("Not working")).toBeInTheDocument();
    expect(screen.getByText("Meta: Meta didn't accept the access token.")).toBeInTheDocument();
  });
});

/** What the API answers, as the gateway passes it on, made into the error the client throws. */
function answered(status: number, body: unknown) {
  return toApiError(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("ahead of its backend", () => {
  it("is left off the club's page while the API has no such route (FastAPI's bare 404)", async () => {
    answer = await answered(404, { detail: "Not Found" });
    const { container } = render(<ClubWhatsAppCard clubId={5} />);
    await waitFor(() => expect(calls).toEqual(["/api/v1/admin/club-whatsapp/5"]));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText(/Could not load/)).toBeNull();
  });

  it("still says it could not load on a 404 the backend raised itself, or a 500", async () => {
    for (const failure of [
      await answered(404, { message: "Club not found", errors: null, error_code: null, track_id: null }),
      await answered(500, { message: "Internal Server Error", errors: { error: "x" }, error_code: null, track_id: "t" }),
    ]) {
      answer = failure;
      const view = render(<ClubWhatsAppCard clubId={5} />);
      expect(await screen.findByText("Could not load the club's WhatsApp number.")).toBeInTheDocument();
      view.unmount();
    }
  });
});

describe("the clubs whose WhatsApp fell back most", () => {
  it("lists them with their commonest reason, each linking to the club", async () => {
    fallbacks = {
      since: "2026-09-30T18:30:00Z",
      items: [
        { club_id: 5, club_name: "Circuit Society", fallbacks: 14, top_code: "132015", top_reason: "The template is paused for poor quality (132015)" },
        { club_id: 9, club_name: "Robotics Guild", fallbacks: 3, top_code: "NO_TEMPLATE", top_reason: "No approved ticket_confirmed template" },
      ],
    };
    render(<WhatsAppFallbacksCard />);
    const list = await screen.findByRole("region", { name: "WhatsApp fallbacks this month" });
    expect(within(list).getByRole("link", { name: "Circuit Society" })).toHaveAttribute("href", "/clubs/5");
    expect(within(list).getByText("14")).toBeInTheDocument();
    expect(within(list).getByText(/mostly: The template is paused for poor quality \(132015\)/)).toBeInTheDocument();
    expect(within(list).getByText(/mostly: No approved ticket_confirmed template \(NO_TEMPLATE\)/)).toBeInTheDocument();
    expect(calls).toContain("/api/v1/admin/club-whatsapp/fallbacks");
  });

  it("isn't shown with nothing to show, nor against a backend without it", async () => {
    const view = render(<WhatsAppFallbacksCard />);
    await waitFor(() => expect(calls).toContain("/api/v1/admin/club-whatsapp/fallbacks"));
    expect(view.container).toBeEmptyDOMElement();
    view.unmount();
    calls.length = 0;
    fallbacks = await answered(404, { detail: "Not Found" });
    const again = render(<WhatsAppFallbacksCard />);
    await waitFor(() => expect(calls).toContain("/api/v1/admin/club-whatsapp/fallbacks"));
    expect(again.container).toBeEmptyDOMElement();
  });
});
