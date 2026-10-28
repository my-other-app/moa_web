import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

import analyticsFixture from "../__fixtures__/event-analytics-admin.json";
import detailFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/event-registrations-admin.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * An event's own sponsors and partners on the admin's event detail: read-only,
 * sponsors first, each in the club's order, and nothing at all when the event
 * names none or the server is older and sends neither list.
 */
let detail: Record<string, unknown> = detailFixture;

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "a", email: "a@b.c", full_name: "A", user_type: "admin", admin_role: "owner" } }),
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/analytics")) return analyticsFixture;
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path.includes("/registration/") && path.includes("/list")) return registrationsFixture;
        if (path.includes("/events/info/")) return detail;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventDetail } = await import("./components/event-detail");
const { adminEventDetailSchema } = await import("./schemas");

const LOGO = { thumbnail: "https://media.test/events/partners/v-a.thumbnail.png", medium: "https://media.test/events/partners/v-a.medium.png" };

beforeEach(() => {
  detail = detailFixture;
});

describe("sponsors and partners on the admin's event detail", () => {
  it("lists sponsors then partners, each in order, logos whole, with label and link", async () => {
    detail = {
      ...detailFixture,
      sponsors: [
        { id: 12, kind: "sponsor", name: "Arc Foundry", label: null, link: null, position: 1, logo: null },
        { id: 11, kind: "sponsor", name: "Kinetic Labs", label: "Title sponsor", link: "https://www.kinetic.example/fest", position: 0, logo: LOGO },
      ],
      partners: [{ id: 21, kind: "partner", name: "Radio City", label: "Media partner", link: null, position: 0, logo: null }],
    };
    render(<EventDetail eventId={42} />);
    const section = await screen.findByRole("region", { name: "Sponsors and partners" });
    const sponsors = within(section).getByRole("list", { name: "Sponsors" });
    expect(within(sponsors).getAllByRole("listitem").map((li) => li.textContent)).toEqual([expect.stringContaining("Kinetic Labs"), expect.stringContaining("Arc Foundry")]);
    expect(within(sponsors).getByText("Title sponsor")).toBeInTheDocument();
    const link = within(sponsors).getByRole("link", { name: /kinetic\.example/ });
    expect(link).toHaveAttribute("href", "https://www.kinetic.example/fest");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const img = sponsors.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(LOGO.medium);
    expect(img.className).toContain("object-contain");
    expect(within(within(section).getByRole("list", { name: "Partners" })).getByText("Media partner")).toBeInTheDocument();
    // Read-only: nothing to change them with.
    expect(within(section).queryByRole("button")).toBeNull();
  });

  it("shows nothing when the event names none, or the server sends neither list", async () => {
    detail = { ...detailFixture, sponsors: [], partners: [] };
    const { unmount } = render(<EventDetail eventId={42} />);
    expect(await screen.findByText("Performance")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sponsors and partners" })).toBeNull();
    unmount();

    detail = detailFixture;
    render(<EventDetail eventId={42} />);
    expect(await screen.findByText("Performance")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sponsors and partners" })).toBeNull();
  });

  it("reads an older server's detail as no sponsors or partners", () => {
    const parsed = adminEventDetailSchema.parse(detailFixture);
    expect(parsed.sponsors).toEqual([]);
    expect(parsed.partners).toEqual([]);
    expect(adminEventDetailSchema.parse({ ...detailFixture, sponsors: "nonsense" }).sponsors).toEqual([]);
  });
});
