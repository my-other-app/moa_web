import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

/**
 * The designer rendered against the real schemas, with the API stubbed at the
 * client boundary.
 *
 * tsc cannot see a component that throws on render, and this one assembles
 * pieces from two features -- the layer editor, the shared config tabs and
 * the preview -- so a mismatch between them only shows up here.
 *
 * What it asserts beyond that is the fork messaging: whether the organiser is
 * told they are about to copy a club template or edit a design the event
 * already owns.
 */
const design = {
  club: {
    config: { bg_color: "#101014", layers: [], canvas: { width: 0, height: 0 } },
    audience: "event_default",
    source: "club_default",
    is_own: false,
    template_id: 3,
  },
  own: {
    config: { bg_color: "#ff5a1f", layers: [], canvas: { width: 0, height: 0 } },
    audience: "event_default",
    source: "event_default",
    is_own: true,
    template_id: 9,
  },
};

let current: (typeof design)["club"] | (typeof design)["own"] = design.club;

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/designs/")) return current;
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async () => current),
      post: vi.fn(),
      del: vi.fn(async () => design.club),
    },
  };
});

const { render } = await import("@/test/render");
const { EventDesignWorkspace } = await import("./components/event-design-workspace");

describe("the event design workspace", () => {
  it("renders without throwing", () => {
    current = design.club;

    expect(() => render(<EventDesignWorkspace eventId={1} />)).not.toThrow();
  });

  it("offers both documents and every audience", async () => {
    current = design.club;
    render(<EventDesignWorkspace eventId={1} />);

    expect(await screen.findByRole("tab", { name: "Ticket" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Certificate" })).toBeInTheDocument();
    for (const label of ["Everyone", "Attendees", "Speakers", "Staff"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
  });

  it("warns that saving will copy the club's template", async () => {
    current = design.club;
    render(<EventDesignWorkspace eventId={1} />);

    expect(await screen.findByText(/not customised yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save for this event/i })
    ).toBeInTheDocument();
  });

  it("does not offer a reset when there is nothing to reset", async () => {
    current = design.club;
    render(<EventDesignWorkspace eventId={1} />);

    await screen.findByText(/not customised yet/i);
    expect(
      screen.queryByRole("button", { name: /use club default/i })
    ).not.toBeInTheDocument();
  });

  it("offers a reset once the event owns its design", async () => {
    current = design.own;
    render(<EventDesignWorkspace eventId={1} />);

    expect(
      await screen.findByText("This event has its own design")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /use club default/i })
    ).toBeInTheDocument();
  });

  it("does not report unsaved work before anything is touched", async () => {
    /*
     * The layer editor measures the artwork on mount and reports its size
     * back through the same setter the controls use, which marked the design
     * dirty the moment the page opened.
     */
    current = design.own;
    render(<EventDesignWorkspace eventId={1} />);

    await screen.findByText("This event has its own design");
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });
});
