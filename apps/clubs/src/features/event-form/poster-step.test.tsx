import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { Form } from "@moa/ui";

/**
 * The poster in the event editor: 4:5, said in plain words, never cropped;
 * one of another shape still goes, with a gentle word about how it shows.
 */
vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/events/categories/list")) return [{ id: 1, name: "Hackathon" }];
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
const { EventStep } = await import("./components/steps/event-step");
const { emptyEventForm } = await import("./components/event-form");
const { POSTER_SHAPE_NOTE } = await import("@moa/app-kit");
type Values = import("./schemas").EventFormValues;

function Harness({ posterUrl }: { posterUrl?: string }) {
  const f = useForm<Values>({ defaultValues: emptyEventForm });
  return (
    <Form {...f}>
      <form>
        <EventStep posterUrl={posterUrl} />
      </form>
    </Form>
  );
}

function loaded(img: HTMLImageElement, width: number, height: number) {
  Object.defineProperty(img, "naturalWidth", { value: width, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: height, configurable: true });
  Object.defineProperty(img, "complete", { value: true, configurable: true });
  fireEvent.load(img);
}

describe("the event's poster", () => {
  it("says its shape and size before one is picked", () => {
    render(<Harness />);
    expect(screen.getByText("Portrait 4:5 · 1080×1350")).toBeInTheDocument();
    expect(screen.getByText(/Portrait 4:5 · 1080×1350 · like an Instagram portrait post\./)).toBeInTheDocument();
    expect(screen.queryByText("Portrait, 4:5")).toBeNull();
  });

  it("shows the poster whole in a 4:5 frame", () => {
    const { container } = render(<Harness posterUrl="https://cdn.test/poster.jpg" />);
    const frame = container.querySelector('[data-frame="poster"]')!;
    expect(frame).toHaveClass("aspect-[4/5]");
    expect(frame.querySelector('[data-part="poster"]')).toHaveClass("object-contain");
  });

  it("says, gently, how a poster that is not 4:5 will show", () => {
    const { container } = render(<Harness posterUrl="https://cdn.test/landscape.jpg" />);
    expect(screen.queryByText(POSTER_SHAPE_NOTE)).toBeNull();
    loaded(container.querySelector('[data-part="poster"]') as HTMLImageElement, 1600, 900);
    expect(screen.getByRole("status")).toHaveTextContent(POSTER_SHAPE_NOTE);
  });

  it("says nothing more about a 4:5 poster", () => {
    const { container } = render(<Harness posterUrl="https://cdn.test/portrait.jpg" />);
    loaded(container.querySelector('[data-part="poster"]') as HTMLImageElement, 1080, 1350);
    expect(screen.queryByText(POSTER_SHAPE_NOTE)).toBeNull();
  });
});
