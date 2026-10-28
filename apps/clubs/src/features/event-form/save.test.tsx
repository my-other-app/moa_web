import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@moa/api";

import topicsFixture from "../__fixtures__/topics.json";
import clubInfoFixture from "../__fixtures__/club-info.json";

/**
 * Saving an edit to an event. The owner reported Save changes as invisible:
 * the button carried `btn-secondary` and `btn-primary` at once, so it took
 * the secondary's fill and the primary's text colour (white on white in
 * light mode, near-black on charcoal in dark). Once something changes it is
 * one primary button, in the header and in the bar at the foot, and every
 * outcome is said: saving, saved (the toast, then the event page), refused.
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const state: { put: () => unknown } = { put: () => ({}) };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/events/categories/list") return [{ id: 1, name: "Workshop" }, { id: 2, name: "Hackathon" }];
        if (path === "/api/v1/interests/list") return topicsFixture;
        if (path === "/api/v1/clubs/info") return clubInfoFixture;
        throw new ApiError({ status: 404, message: "Not here" });
      }),
      post: vi.fn(),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return state.put();
      }),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventForm, emptyEventForm } = await import("./components/event-form");

const saved = {
  ...emptyEventForm,
  name: "Hack Night",
  category_id: 1,
  event_datetime: "2026-11-08T18:00",
  duration: 3,
  location_name: "Seminar Hall, CET",
};

function renderEdit() {
  return render(<EventForm mode="edit" eventId={37} defaultValues={saved} context={{ status: "published", registered: 0 }} />);
}

/** The event's own name; the People section has a contact "Name" too. */
async function nameField() {
  await waitFor(() => expect(document.querySelector('input[name="name"]')).not.toBeNull());
  return document.querySelector<HTMLInputElement>('input[name="name"]')!;
}

const tones = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => /^btn-(primary|secondary|ghost|quiet|destructive)$/.test(c));

beforeEach(() => {
  calls.length = 0;
  state.put = () => ({ id: 37, name: "Hack Night 2" });
});

describe("saving an edit to an event", () => {
  it("is one quiet, disabled button until something changes, then one primary button, top and bottom", async () => {
    renderEdit();
    const idle = await screen.findAllByRole("button", { name: /All changes saved/ });
    expect(idle).toHaveLength(2);
    for (const b of idle) {
      expect(b).toBeDisabled();
      expect(tones(b)).toEqual(["btn-secondary"]);
    }

    fireEvent.change(await nameField(), { target: { value: "Hack Night 2" } });
    const save = await screen.findAllByRole("button", { name: /Save changes/ });
    expect(save).toHaveLength(2);
    for (const b of save) {
      expect(b).toBeEnabled();
      expect(tones(b)).toEqual(["btn-primary"]);
    }
  });

  it("saves the change, saying so while it goes", async () => {
    let release: (v: unknown) => void = () => {};
    state.put = () => new Promise((r) => (release = r));
    renderEdit();
    fireEvent.change(await nameField(), { target: { value: "Hack Night 2" } });
    fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);

    expect(await screen.findAllByRole("button", { name: /Saving…/ })).toHaveLength(2);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.path).toBe("/api/v1/events/update/37");
    expect((put.body as FormData).get("name")).toBe("Hack Night 2");
    release({ id: 37, name: "Hack Night 2" });
    await waitFor(() => expect(screen.queryAllByRole("button", { name: /Saving…/ })).toHaveLength(0));
  });

  it("says why when the server refuses, and keeps the change to try again", async () => {
    state.put = () => {
      throw new ApiError({ status: 500, message: "The server could not save the event just now." });
    };
    renderEdit();
    fireEvent.change(await nameField(), { target: { value: "Hack Night 2" } });
    fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);

    expect(await screen.findByRole("alert")).toHaveTextContent("The server could not save the event just now.");
    expect(screen.getAllByRole("button", { name: /Save changes/ })[0]).toBeEnabled();
    expect(await nameField()).toHaveValue("Hack Night 2");
  });

  it("does not send a form with a problem in it, and points at the problem", async () => {
    renderEdit();
    fireEvent.change(await nameField(), { target: { value: "Hi" } });
    fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);

    expect(await screen.findByText("At least 3 characters")).toBeInTheDocument();
    expect(screen.getByText("Something to fix above.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });
});
