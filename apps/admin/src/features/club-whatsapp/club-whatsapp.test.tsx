import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

/**
 * A club's own WhatsApp number on the admin's club page:
 * GET /admin/club-whatsapp/{club_id} answers whether it is connected, its
 * status, quality and limit -- and nothing a message said.
 */

let answer: unknown = null;
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
const { ClubWhatsAppCard, clubWhatsAppSchema, tierWords } = await import("./index");

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
    expect(within(card).getByText("42")).toBeInTheDocument();
    expect(calls).toEqual(["/api/v1/admin/club-whatsapp/5"]);
  });

  it("says when the club has no number of its own, and whether its plan includes one", async () => {
    answer = { ...CONNECTED, connected: false, status: null, display_phone_number: null, conversations: 0, plan_allows: false };
    render(<ClubWhatsAppCard clubId={5} />);
    expect(await screen.findByText(/No WhatsApp number of its own/)).toHaveTextContent("Its plan doesn't include one (Enterprise).");
  });

  it("shows what Meta said when the number stopped working", async () => {
    answer = { ...CONNECTED, status: "failed", last_error: "Meta didn't accept the access token." };
    render(<ClubWhatsAppCard clubId={5} />);
    expect(await screen.findByText("Not working")).toBeInTheDocument();
    expect(screen.getByText("Meta: Meta didn't accept the access token.")).toBeInTheDocument();
  });
});
