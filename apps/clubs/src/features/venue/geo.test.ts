import { describe, expect, it } from "vitest";

import { photonUrl, placesOf } from "./api";
import { formatPoint, mapEmbedUrl, parseCoordinates, pointFromMapLink, sourceLabel } from "./geo";
import { NO_PIN, pinAt, pinForLink, pinFromDetail, pinOf, pinWireFields, removedPin } from "./pin";

describe("sourceLabel", () => {
  it("says where the pin came from in the club's words", () => {
    expect(sourceLabel("link")).toBe("From your map link");
    expect(sourceLabel("geocoded")).toBe("Found from the venue name");
    expect(sourceLabel("manual")).toBe("Set by you");
  });

  it("says nothing when nobody said", () => {
    expect(sourceLabel(null)).toBeNull();
    expect(sourceLabel(undefined)).toBeNull();
  });
});

describe("parseCoordinates", () => {
  it("reads latitude then longitude, as Google Maps copies them", () => {
    expect(parseCoordinates("12.971599, 77.594566")).toEqual({ lat: 12.971599, lng: 77.594566 });
    expect(parseCoordinates(" 8.5241 76.9366 ")).toEqual({ lat: 8.5241, lng: 76.9366 });
    expect(parseCoordinates("-33.8688;151.2093")).toEqual({ lat: -33.8688, lng: 151.2093 });
    expect(parseCoordinates("12.97°, 77.59°")).toEqual({ lat: 12.97, lng: 77.59 });
  });

  it("rounds to six places", () => {
    expect(parseCoordinates("12.12345678, 77.98765432")).toEqual({ lat: 12.123457, lng: 77.987654 });
  });

  it("refuses anything out of range or not two numbers", () => {
    expect(parseCoordinates("91, 77")).toBeNull();
    expect(parseCoordinates("12, 181")).toBeNull();
    expect(parseCoordinates("12.97")).toBeNull();
    expect(parseCoordinates("Main Hall")).toBeNull();
    expect(parseCoordinates("")).toBeNull();
  });
});

describe("pointFromMapLink", () => {
  it("prefers the place's own pin over where the view was", () => {
    const link = "https://www.google.com/maps/place/Technopark/@8.5580,76.8800,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d8.5581302!4d76.8816314!16s";
    expect(pointFromMapLink(link)).toEqual({ lat: 8.55813, lng: 76.881631 });
  });

  it("reads q=, query= and the view's @", () => {
    expect(pointFromMapLink("https://www.google.com/maps?q=12.9716,77.5946")).toEqual({ lat: 12.9716, lng: 77.5946 });
    expect(pointFromMapLink("https://www.google.com/maps/search/?api=1&query=12.9716%2C77.5946")).toEqual({ lat: 12.9716, lng: 77.5946 });
    expect(pointFromMapLink("https://www.google.com/maps/@19.0760,72.8777,15z")).toEqual({ lat: 19.076, lng: 72.8777 });
  });

  it("finds nothing in a short link, which only the server can follow", () => {
    expect(pointFromMapLink("https://maps.app.goo.gl/abc123")).toBeNull();
    expect(pointFromMapLink("https://www.google.com/maps/place/Main+Hall")).toBeNull();
    expect(pointFromMapLink("")).toBeNull();
  });
});

describe("the map embed", () => {
  it("is Google's keyless embed, zoomed to the street", () => {
    expect(mapEmbedUrl({ lat: 12.9716, lng: 77.5946 })).toBe("https://www.google.com/maps?q=12.9716,77.5946&z=16&output=embed");
    expect(formatPoint({ lat: 12.9716, lng: 77.5946 })).toBe("12.97160, 77.59460");
  });
});

describe("pin changes", () => {
  const manual = pinAt({ lat: 12.9716, lng: 77.5946 });

  it("removing a pin asks the server to drop the club's own", () => {
    expect(removedPin()).toEqual({ point: null, source: null, clear: true });
  });

  it("picking a place after removing one sets it, with nothing left to clear", () => {
    expect(pinAt({ lat: 1, lng: 2 })).toEqual({ point: { lat: 1, lng: 2 }, source: "manual", clear: false });
  });

  it("a pasted link moves the pin, and drops a pin the club set so the link can win", () => {
    const next = pinForLink(manual, "https://www.google.com/maps?q=8.5241,76.9366");
    expect(next).toEqual({ point: { lat: 8.5241, lng: 76.9366 }, source: "link", clear: true });
    // A pin the server found leaves nothing to clear.
    expect(pinForLink({ point: { lat: 1, lng: 2 }, source: "geocoded", clear: false }, "https://maps.app.goo.gl/x")).toEqual({ point: null, source: "link", clear: false });
  });

  it("emptying the link takes its pin and leaves any other", () => {
    expect(pinForLink({ point: { lat: 1, lng: 2 }, source: "link", clear: true }, "")).toEqual({ point: null, source: null, clear: true });
    expect(pinForLink(manual, "  ")).toBe(manual);
  });
});

describe("pinFromDetail", () => {
  it("reads a point and where it came from", () => {
    expect(pinFromDetail({ lat: 12.97, lng: 77.59, geo_source: "link" })).toEqual({ lat: 12.97, lng: 77.59, geo_source: "link", clear_point: false });
  });

  it("is no pin for none, half of one, or one off the globe", () => {
    const none = { lat: null, lng: null, geo_source: null, clear_point: false };
    expect(pinFromDetail({})).toEqual(none);
    expect(pinFromDetail({ lat: 12.97, lng: null, geo_source: "manual" })).toEqual(none);
    expect(pinFromDetail({ lat: 120, lng: 77.59, geo_source: "manual" })).toEqual(none);
  });

  it("round-trips through the picker's shape", () => {
    expect(pinOf(pinFromDetail({ lat: 1.5, lng: 2.5, geo_source: "manual" }))).toEqual({ point: { lat: 1.5, lng: 2.5 }, source: "manual", clear: false });
    expect(pinOf({})).toEqual(NO_PIN);
  });
});

describe("pinWireFields", () => {
  it("sends a pin the club set as lat and lng", () => {
    expect(pinWireFields({ lat: 12.9716, lng: 77.5946, geo_source: "manual" })).toEqual([
      ["lat", "12.9716"],
      ["lng", "77.5946"],
    ]);
  });

  it("leaves a pin from the link or the venue name to the server", () => {
    expect(pinWireFields({ lat: 12.9716, lng: 77.5946, geo_source: "link" })).toEqual([]);
    expect(pinWireFields({ lat: 12.9716, lng: 77.5946, geo_source: "geocoded" })).toEqual([]);
    expect(pinWireFields({})).toEqual([]);
  });

  it("sends clear_point for a removed pin, and never alongside lat/lng", () => {
    expect(pinWireFields({ lat: null, lng: null, geo_source: null, clear_point: true })).toEqual([["clear_point", "true"]]);
    expect(pinWireFields({ lat: null, lng: null, geo_source: "link", clear_point: true })).toEqual([["clear_point", "true"]]);
  });

  it("drops the pin of an online event", () => {
    expect(pinWireFields({ lat: 12.9716, lng: 77.5946, geo_source: "manual" }, { online: true })).toEqual([["clear_point", "true"]]);
  });
});

describe("Photon", () => {
  it("asks with the text, six results, English, biased to India", () => {
    const url = new URL(photonUrl("Main Auditorium"));
    expect(`${url.origin}${url.pathname}`).toBe("https://photon.komoot.io/api/");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "Main Auditorium", limit: "6", lang: "en", lat: "20.59", lon: "78.96" });
  });

  it("reads name, street and city, with the point the right way round", () => {
    const places = placesOf({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [76.8816314, 8.5581302] }, properties: { osm_type: "W", osm_id: 42, name: "Technopark Phase 1", housenumber: "7", street: "Technopark Road", city: "Thiruvananthapuram", state: "Kerala" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [77.5946, 12.9716] }, properties: { osm_type: "N", osm_id: 7, housenumber: "12", street: "MG Road", district: "Bengaluru Urban" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [72.8777, 19.076] }, properties: { osm_type: "R", osm_id: 1, name: "Mumbai", state: "Maharashtra" } },
      ],
    });
    expect(places).toEqual([
      { id: "W42", name: "Technopark Phase 1", street: "7 Technopark Road", city: "Thiruvananthapuram", point: { lat: 8.55813, lng: 76.881631 } },
      // An unnamed building goes by its address.
      { id: "N7", name: "12 MG Road", street: null, city: "Bengaluru Urban", point: { lat: 12.9716, lng: 77.5946 } },
      { id: "R1", name: "Mumbai", street: null, city: "Maharashtra", point: { lat: 19.076, lng: 72.8777 } },
    ]);
  });

  it("drops what cannot be shown, and repeats", () => {
    const hall = { type: "Feature", geometry: { coordinates: [76.9, 8.5] }, properties: { osm_type: "N", osm_id: 1, name: "Main Hall", city: "Kochi" } };
    const places = placesOf({
      features: [
        hall,
        { ...hall, properties: { ...hall.properties, osm_id: 2 } },
        { type: "Feature", geometry: { coordinates: [76.9, 8.5] }, properties: { osm_type: "N", osm_id: 3 } },
        { type: "Feature", geometry: { coordinates: [76.9, 95] }, properties: { osm_type: "N", osm_id: 4, name: "Off the globe" } },
        { type: "Feature", properties: { name: "No geometry" } },
      ],
    });
    expect(places.map((p) => p.name)).toEqual(["Main Hall"]);
  });

  it("throws on a body that is not an answer, so it counts as a failure", () => {
    expect(() => placesOf({ message: "rate limited" })).toThrow();
  });
});
