import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";

import { render } from "@/test/render";

import type { Place } from "./api";
import { PinPreview } from "./components/pin-preview";
import { VenuePicker } from "./components/venue-picker";
import { pinAt, type PinState } from "./pin";

/** One Photon feature. Photon puts longitude first. */
function feature(name: string, lat: number, lng: number, props: Record<string, unknown> = {}) {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { osm_type: "N", osm_id: `${lat}${lng}`.replace(/\D/g, ""), name, ...props } };
}

const answer = (...features: unknown[]) => ({ ok: true, status: 200, json: async () => ({ type: "FeatureCollection", features }) });

/** A fetch whose answers the test hands out, in whatever order it likes. */
function deferredFetch() {
  const calls: Array<{ url: URL; signal?: AbortSignal; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  const fn = vi.fn(
    (input: string, init?: RequestInit) =>
      new Promise((resolve, reject) => {
        calls.push({ url: new URL(input), signal: init?.signal ?? undefined, resolve, reject });
      }),
  );
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

/** Lets a resolved fetch work through res.json() and into state. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

function Picker({ onPick, initial = "" }: { onPick: (p: Place) => void; initial?: string }) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <label htmlFor="venue">Venue</label>
      <VenuePicker id="venue" value={value} onChange={setValue} onPick={onPick} />
    </>
  );
}

const field = () => screen.getByRole("combobox", { name: "Venue" });
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });

describe("VenuePicker", () => {
  beforeEach(() => {
    // Only the timers: React, RTL's polling and the promises stay real.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for typing to pause 300 ms, then asks Photon once for what was typed", () => {
    const photon = deferredFetch();
    render(<Picker onPick={vi.fn()} />);
    for (const text of ["Tec", "Tech", "Techn", "Techno"]) {
      type(text);
      wait(100);
    }
    wait(199);
    expect(photon.fn).not.toHaveBeenCalled();
    wait(1);
    expect(photon.fn).toHaveBeenCalledTimes(1);
    const { url } = photon.calls[0]!;
    expect(`${url.origin}${url.pathname}`).toBe("https://photon.komoot.io/api/");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "Techno", limit: "6", lang: "en", lat: "20.59", lon: "78.96" });
  });

  it("asks nothing for under three letters, or for a name it was given rather than typed", () => {
    const photon = deferredFetch();
    render(<Picker onPick={vi.fn()} initial="Main Auditorium" />);
    wait(1000);
    type("Ma");
    wait(1000);
    expect(photon.fn).not.toHaveBeenCalled();
  });

  it("drops an answer that arrives after a newer one", async () => {
    const photon = deferredFetch();
    render(<Picker onPick={vi.fn()} />);
    type("Tech");
    wait(300);
    type("Technopark");
    wait(300);
    expect(photon.fn).toHaveBeenCalledTimes(2);
    // Moving on aborted the first request.
    expect(photon.calls[0]!.signal?.aborted).toBe(true);

    photon.calls[1]!.resolve(answer(feature("Technopark Phase 1", 8.5581, 76.8816)));
    await settle();
    expect(screen.getByRole("option", { name: /Technopark Phase 1/ })).toBeInTheDocument();

    // The slow answer to "Tech" turns up last, and changes nothing.
    photon.calls[0]!.resolve(answer(feature("Tech Mahindra", 18.5, 73.8)));
    await settle();
    expect(screen.queryByRole("option", { name: /Tech Mahindra/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("shows each suggestion's name, street and city", async () => {
    const photon = deferredFetch();
    render(<Picker onPick={vi.fn()} />);
    type("Technopark");
    wait(300);
    photon.calls[0]!.resolve(answer(feature("Technopark Phase 1", 8.5581, 76.8816, { street: "Technopark Road", city: "Thiruvananthapuram" }), feature("Technopark Phase 3", 8.56, 76.88, { city: "Kazhakkoottam" })));
    await settle();
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Technopark Phase 1");
    expect(options[0]).toHaveTextContent("Technopark Road · Thiruvananthapuram");
    expect(options[1]).toHaveTextContent("Kazhakkoottam");
    expect(screen.getByText("Places © OpenStreetMap contributors")).toBeInTheDocument();
  });

  it("is a combobox: arrows move through the listbox, Enter picks, and the name stays editable", async () => {
    const photon = deferredFetch();
    const onPick = vi.fn();
    render(<Picker onPick={onPick} />);
    const input = field();
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");

    type("Technopark");
    wait(300);
    photon.calls[0]!.resolve(answer(feature("Technopark Phase 1", 8.5581, 76.8816, { city: "Thiruvananthapuram" }), feature("Technopark Phase 3", 8.56, 76.88)));
    await settle();

    const listbox = screen.getByRole("listbox", { name: "Places" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    // Nothing is highlighted until the arrows are used, so Enter alone picks nothing.
    expect(input).not.toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();

    const [first, second] = screen.getAllByRole("option");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", first!.id);
    expect(first).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", second!.id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveAttribute("aria-activedescendant", first!.id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith({ id: expect.any(String), name: "Technopark Phase 1", street: null, city: "Thiruvananthapuram", point: { lat: 8.5581, lng: 76.8816 } });
    expect(input).toHaveValue("Technopark Phase 1");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    // Picked, then made more exact.
    type("Technopark Phase 1, Bhavani, 3rd floor");
    expect(input).toHaveValue("Technopark Phase 1, Bhavani, 3rd floor");
  });

  it("picks with a click too, and Escape closes the list without picking", async () => {
    const photon = deferredFetch();
    const onPick = vi.fn();
    render(<Picker onPick={onPick} />);
    type("Main Audi");
    wait(300);
    photon.calls[0]!.resolve(answer(feature("Main Auditorium", 10.0, 76.3, { city: "Kochi" })));
    await settle();

    fireEvent.keyDown(field(), { key: "Escape" });
    expect(field()).toHaveAttribute("aria-expanded", "false");
    expect(onPick).not.toHaveBeenCalled();
    expect(field()).toHaveValue("Main Audi");

    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: /Main Auditorium/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: "Main Auditorium", point: { lat: 10, lng: 76.3 } }));
    expect(field()).toHaveValue("Main Auditorium");
  });

  it("works as a plain text field when Photon cannot be reached", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", offline);
    const onPick = vi.fn();
    render(<Picker onPick={onPick} />);
    type("Main Auditorium");
    wait(300);
    await settle();
    expect(offline).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(field()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/Place search isn’t reachable right now/)).toBeInTheDocument();

    type("Main Auditorium, Block C");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field()).toHaveValue("Main Auditorium, Block C");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("treats a refusal from Photon like a lost connection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    render(<Picker onPick={vi.fn()} />);
    type("Main Auditorium");
    wait(300);
    await settle();
    expect(screen.getByText(/Place search isn’t reachable right now/)).toBeInTheDocument();
  });

  it("says so when nothing matches, and keeps what was typed", async () => {
    const photon = deferredFetch();
    render(<Picker onPick={vi.fn()} />);
    type("Room 4B, old block");
    wait(300);
    photon.calls[0]!.resolve(answer());
    await settle();
    expect(screen.getByText("No places match. What you typed is kept as the venue.")).toBeInTheDocument();
    expect(field()).toHaveValue("Room 4B, old block");
  });
});

/** The preview with its pin and link held in state, as a form would. */
function Preview({ initial, link = "", onState }: { initial: PinState; link?: string; onState?: (pin: PinState, link: string) => void }) {
  const [pin, setPin] = React.useState(initial);
  const [mapLink, setMapLink] = React.useState(link);
  React.useEffect(() => onState?.(pin, mapLink), [pin, mapLink, onState]);
  return <PinPreview pin={pin} onChange={setPin} mapLink={mapLink} onMapLinkChange={setMapLink} venue="Main Hall" />;
}

describe("PinPreview", () => {
  const point = { lat: 12.9716, lng: 77.5946 };

  it("shows the pin on a lazily loaded, titled Google map", () => {
    render(<Preview initial={pinAt(point)} />);
    const map = screen.getByTitle("Map of Main Hall");
    expect(map.tagName).toBe("IFRAME");
    expect(map).toHaveAttribute("src", "https://www.google.com/maps?q=12.9716,77.5946&z=16&output=embed");
    expect(map).toHaveAttribute("loading", "lazy");
    expect(screen.getByText("12.97160, 77.59460")).toBeInTheDocument();
  });

  it("says where the pin came from", () => {
    const { unmount } = render(<Preview initial={{ point, source: "link", clear: false }} />);
    expect(screen.getByText("From your map link")).toBeInTheDocument();
    unmount();
    render(<Preview initial={{ point, source: "geocoded", clear: false }} />);
    expect(screen.getByText("Found from the venue name")).toBeInTheDocument();
    render(<Preview initial={pinAt(point)} />);
    expect(screen.getByText("Set by you")).toBeInTheDocument();
  });

  it("Remove pin clears the map and asks for clear_point", () => {
    const onState = vi.fn();
    render(<Preview initial={{ point, source: "geocoded", clear: false }} onState={onState} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove pin" }));
    expect(onState).toHaveBeenLastCalledWith({ point: null, source: null, clear: true }, "");
    expect(screen.queryByTitle("Map of Main Hall")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove pin" })).not.toBeInTheDocument();
    expect(screen.getByText(/No pin yet/)).toBeInTheDocument();
  });

  it("Adjust pin takes exact coordinates and makes the pin the club's own", () => {
    const onState = vi.fn();
    render(<Preview initial={{ point, source: "geocoded", clear: false }} onState={onState} />);
    const adjust = screen.getByRole("button", { name: "Adjust pin" });
    expect(adjust).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(adjust);
    expect(adjust).toHaveAttribute("aria-expanded", "true");

    const coords = screen.getByLabelText("Coordinates");
    expect(coords).toHaveValue("12.97160, 77.59460");
    fireEvent.change(coords, { target: { value: "not a place" } });
    fireEvent.click(screen.getByRole("button", { name: "Set pin" }));
    expect(screen.getByText(/Type the latitude, then the longitude/)).toBeInTheDocument();
    expect(onState).toHaveBeenLastCalledWith({ point, source: "geocoded", clear: false }, "");

    fireEvent.change(coords, { target: { value: "12.93524, 77.62448" } });
    fireEvent.keyDown(coords, { key: "Enter" });
    expect(onState).toHaveBeenLastCalledWith({ point: { lat: 12.93524, lng: 77.62448 }, source: "manual", clear: false }, "");
    expect(screen.getByText("Set by you")).toBeInTheDocument();
  });

  it("a pasted Google Maps link fills the map link and moves the pin to it", () => {
    const onState = vi.fn();
    render(<Preview initial={pinAt(point)} onState={onState} />);
    fireEvent.click(screen.getByRole("button", { name: "Adjust pin" }));
    fireEvent.change(screen.getByLabelText(/Google Maps link/), { target: { value: "https://www.google.com/maps?q=8.5241,76.9366" } });
    expect(onState).toHaveBeenLastCalledWith({ point: { lat: 8.5241, lng: 76.9366 }, source: "link", clear: true }, "https://www.google.com/maps?q=8.5241,76.9366");
    expect(screen.getByText("From your map link")).toBeInTheDocument();
  });

  it("opens by itself to show a saved link that has no pin yet", () => {
    render(<Preview initial={{ point: null, source: null, clear: false }} link="https://maps.app.goo.gl/abc" />);
    expect(screen.getByLabelText(/Google Maps link/)).toHaveValue("https://maps.app.goo.gl/abc");
  });
});
