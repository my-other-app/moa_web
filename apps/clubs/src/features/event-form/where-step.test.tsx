import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { Form } from "@moa/ui";

import { render } from "@/test/render";

import { toEventFormData } from "./api";
import { WhereStep } from "./components/steps/where-step";
import { emptyEventForm } from "./components/event-form";
import { eventFormSchema, type EventFormValues } from "./schemas";

let form: UseFormReturn<EventFormValues>;

function Harness({ defaults }: { defaults: EventFormValues }) {
  const f = useForm<EventFormValues>({ defaultValues: defaults });
  // The test reads and submits the form the step is writing to.
  React.useEffect(() => {
    form = f;
  }, [f]);
  return (
    <Form {...f}>
      <form>
        <WhereStep />
        {/* Read in render, as the form's Save button does; RHF only tracks what is read. */}
        <output data-testid="dirty">{String(f.formState.isDirty)}</output>
      </form>
    </Form>
  );
}

const required = { name: "Hack Night", category_id: 1, event_datetime: "2026-11-01T18:00", duration: 3 };
const wire = () => toEventFormData(eventFormSchema.parse({ ...form.getValues(), ...required }));

const technopark = {
  type: "FeatureCollection",
  features: [{ type: "Feature", geometry: { type: "Point", coordinates: [76.8816, 8.5581] }, properties: { osm_type: "W", osm_id: 42, name: "Technopark Phase 1", street: "Technopark Road", city: "Thiruvananthapuram" } }],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => technopark })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Lets the stubbed fetch work through res.json() and into state (findBy* would wait on a faked timer). */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });

async function searchAndPick() {
  const venue = screen.getByRole("combobox", { name: "Venue" });
  fireEvent.change(venue, { target: { value: "Technopark" } });
  act(() => void vi.advanceTimersByTime(300));
  await settle();
  fireEvent.click(screen.getByRole("option", { name: /Technopark Phase 1/ }));
  return venue;
}

describe("the Where step's venue", () => {
  it("picking a place fills the venue and pins it, as the club's own", async () => {
    render(<Harness defaults={emptyEventForm} />);
    expect(screen.getByText(/No pin yet/)).toBeInTheDocument();
    const venue = await searchAndPick();

    expect(venue).toHaveValue("Technopark Phase 1");
    expect(form.getValues()).toMatchObject({ location_name: "Technopark Phase 1", lat: 8.5581, lng: 76.8816, geo_source: "manual", clear_point: false });
    expect(screen.getByTitle("Map of Technopark Phase 1")).toBeInTheDocument();
    expect(screen.getByText("Set by you")).toBeInTheDocument();

    // The name can be made more exact without losing the pin.
    fireEvent.change(venue, { target: { value: "Technopark Phase 1, Bhavani" } });
    expect(form.getValues()).toMatchObject({ location_name: "Technopark Phase 1, Bhavani", lat: 8.5581, lng: 76.8816 });

    const fd = wire();
    expect(fd.get("location_name")).toBe("Technopark Phase 1, Bhavani");
    expect(fd.get("lat")).toBe("8.5581");
    expect(fd.get("lng")).toBe("76.8816");
    expect(fd.get("clear_point")).toBeNull();
  });

  it("removing a found pin sends clear_point and no point", () => {
    render(<Harness defaults={{ ...emptyEventForm, location_name: "Lab 3", lat: 8.5581, lng: 76.8816, geo_source: "geocoded" }} />);
    expect(screen.getByText("Found from the venue name")).toBeInTheDocument();
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
    fireEvent.click(screen.getByRole("button", { name: "Remove pin" }));
    expect(form.getValues()).toMatchObject({ lat: null, lng: null, geo_source: null, clear_point: true });
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");

    const fd = wire();
    expect(fd.get("clear_point")).toBe("true");
    expect(fd.get("lat")).toBeNull();
  });

  it("keeps the map link under Adjust pin, sent as before", () => {
    render(<Harness defaults={{ ...emptyEventForm, location_name: "Lab 3", lat: 8.5581, lng: 76.8816, geo_source: "link", location_link: "https://maps.app.goo.gl/abc123" }} />);
    expect(screen.getByText("From your map link")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adjust pin" }));
    expect(screen.getByLabelText(/Google Maps link/)).toHaveValue("https://maps.app.goo.gl/abc123");
    const fd = wire();
    expect(fd.get("location_link")).toBe("https://maps.app.goo.gl/abc123");
    expect(fd.get("lat")).toBeNull();
    expect(fd.get("clear_point")).toBeNull();
  });

  it("has no venue or pin for an online event", () => {
    render(<Harness defaults={{ ...emptyEventForm, is_online: true }} />);
    expect(screen.queryByRole("combobox", { name: "Venue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adjust pin" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Joining link")).toBeInTheDocument();
  });
});
