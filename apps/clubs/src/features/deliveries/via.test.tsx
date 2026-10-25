import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

/**
 * Which number a WhatsApp send went from (the backend's `via`, and the
 * fallback's code and words): "From your number", or "From MyOtherApp
 * (fallback: <reason>)" -- on the event's delivery log and on a guest's card.
 * An older server says nothing of it, and nothing is shown.
 */

const tally = { sent: 3, delivered: 2, awaiting: 1, bounced: 0, complained: 0, failed: 0, skipped: 0, pending: 0 };
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, registration_id: `reg-${id}`, ticket_id: `MOA-${id}`, name: `Guest ${id}`, address: "+919800000000", kind: "reminder", what: "Day-before reminder",
  channel: "whatsapp", status: "sent", outcome: "delivered", reason: null, attempts: 1, sent_at: "2026-10-15T10:00:00+00:00", outcome_at: null, ...over,
});
const ITEMS = [
  row("club", { via: "club" }),
  row("fell", { via: "platform", fallback_code: "132015", fallback_reason: "The template is paused for poor quality (132015)" }),
  row("chose", { via: "platform" }),
  row("old"),
  row("mail", { channel: "email", address: "a@example.com" }),
];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        if (path.endsWith("/deliveries/summary")) return { kind: "ticket", registrations: 5, revoked: 0, providers: [], channels: [] };
        if (path.endsWith("/certificates/summary")) return { issued: 0, revoked: 0, attended: 0, registrations: 5, outdated: 0, design_version: 1, channels: [] };
        if (path.endsWith("/deliveries")) {
          const q = options?.query ?? {};
          if (q.page_size === 1) return { items: [], total: 0, page: 1, page_size: 1, tally };
          return { items: ITEMS, total: ITEMS.length, page: 1, page_size: 20, tally };
        }
        if (/\/events\/registration\/42\/info\/r1$/.test(path)) {
          return {
            id: "r1", ticket_id: "MOA-1", full_name: "Ananya Iyer", email: "ananya@example.com", phone: "+919800000000", role: "attendee",
            created_at: "2026-10-10T10:00:00+00:00", is_paid: true, is_attended: false, is_won: false, additional_details: {},
            ticket_deliveries: [
              { channel: "email", status: "sent", outcome: "delivered", attempts: 1, sent_at: "2026-10-10T10:01:00+00:00" },
              { channel: "whatsapp", status: "sent", outcome: "read", attempts: 1, sent_at: "2026-10-10T10:01:00+00:00", via: "platform",
                fallback_code: "NO_TEMPLATE", fallback_reason: "Your account has no approved ticket_confirmed template" },
            ],
            certificate_deliveries: [{ channel: "whatsapp", status: "sent", outcome: null, attempts: 1, sent_at: null, via: "club" }],
          };
        }
        if (/\/events\/info\/42$/.test(path)) return { id: 42, name: "Build Night", additional_details: [] };
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
const { DeliveryLog } = await import("./components/delivery-log");
const { viaText } = await import("./schemas");
const { AttendeeDetailDialog } = await import("@/features/registrations/components/attendee-detail-dialog");

beforeEach(() => vi.clearAllMocks());

describe("which number a WhatsApp send went from", () => {
  it("is said in words, with why it fell back", () => {
    expect(viaText({ via: "club" })).toBe("From your number");
    expect(viaText({ via: "platform", fallback_code: "131042", fallback_reason: "The WhatsApp account has a payment problem (131042)" })).toBe(
      "From MyOtherApp (fallback: The WhatsApp account has a payment problem (131042))",
    );
    expect(viaText({ via: "platform", fallback_code: "PLAN" })).toBe("From MyOtherApp (fallback: PLAN)");
    expect(viaText({ via: "platform" })).toBe("From MyOtherApp");
    expect(viaText({})).toBeNull();
  });

  it("shows on the event's delivery log, and not for an email or an older server", async () => {
    render(<DeliveryLog eventId={42} />);
    const club = (await screen.findByText("Guest club")).closest("li")!;
    expect(within(club).getByText("From your number")).toBeInTheDocument();
    const fell = screen.getByText("Guest fell").closest("li")!;
    expect(within(fell).getByText("From MyOtherApp (fallback: The template is paused for poor quality (132015))")).toBeInTheDocument();
    expect(within(screen.getByText("Guest chose").closest("li")!).getByText("From MyOtherApp")).toBeInTheDocument();
    expect(within(screen.getByText("Guest old").closest("li")!).queryByText(/From /)).not.toBeInTheDocument();
    expect(within(screen.getByText("Guest mail").closest("li")!).queryByText(/From /)).not.toBeInTheDocument();
  });

  it("shows on a guest's card, for each WhatsApp send", async () => {
    render(<AttendeeDetailDialog eventId={42} registrationId="r1" fields={[]} open onOpenChange={() => {}} onEdit={() => {}} onRemove={() => {}} />);
    expect(await screen.findByText("From MyOtherApp (fallback: Your account has no approved ticket_confirmed template)")).toBeInTheDocument();
    expect(screen.getByText("From your number")).toBeInTheDocument();
  });
});
