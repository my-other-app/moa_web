"use client";

import * as React from "react";
import { CrosshairIcon, MapPinIcon, MapPinOffIcon, XIcon } from "lucide-react";
import { cn } from "@moa/ui";

import { formatPoint, mapEmbedUrl, parseCoordinates, sourceLabel } from "../geo";
import { pinAt, pinForLink, removedPin, type PinState } from "../pin";

export interface PinPreviewProps {
  pin: PinState;
  onChange: (pin: PinState) => void;
  /** The venue's Google Maps link. Kept and sent as before; pasting one here also moves the pin to it. */
  mapLink: string;
  onMapLinkChange: (link: string) => void;
  onMapLinkBlur?: () => void;
  linkError?: string;
  /** The venue's name, for the map's title. */
  venue?: string;
  disabled?: boolean;
}

/**
 * Where the pin is, where it came from, and the two ways to fix it.
 *
 * The map is Google's keyless embed, loaded only when scrolled near. Under
 * it: the source ("Set by you", "From your map link", "Found from the venue
 * name"), Adjust pin and Remove pin. Adjust opens coordinates to type or
 * paste, and the map link field, which is the same `location_link` the
 * venue always had. It opens by itself when there is a link but no pin yet,
 * so a link saved before pins existed is never hidden.
 */
export function PinPreview({ pin, onChange, mapLink, onMapLinkChange, onMapLinkBlur, linkError, venue, disabled }: PinPreviewProps) {
  const id = React.useId();
  const panelId = `${id}-adjust`;
  const coordsId = `${id}-coords`;
  const coordsHintId = `${id}-coords-hint`;
  const linkId = `${id}-link`;
  const linkHintId = `${id}-link-hint`;
  // null until the club opens or closes it; until then it opens itself when a link has no pin to show.
  const [adjusting, setAdjusting] = React.useState<boolean | null>(null);
  // null shows the pin's own coordinates, so a pick from the search shows up here too.
  const [draft, setDraft] = React.useState<string | null>(null);
  const [coordsError, setCoordsError] = React.useState<string | null>(null);
  const open = Boolean(linkError) || (adjusting ?? (!pin.point && Boolean(mapLink.trim())));
  const coords = draft ?? (pin.point ? formatPoint(pin.point) : "");
  const label = sourceLabel(pin.source);

  const setFromCoords = () => {
    const point = parseCoordinates(coords);
    if (!point) {
      setCoordsError("Type the latitude, then the longitude, like 12.97160, 77.59460.");
      return;
    }
    onChange(pinAt(point));
    setDraft(null);
    setCoordsError(null);
  };

  const empty =
    pin.source === "link"
      ? "The pin will come from your map link when you save."
      : pin.clear && mapLink.trim()
        ? "Pin removed. Your map link may still place one when you save; clear it under Adjust pin to keep the venue off the map."
        : "No pin yet. Pick the venue from the suggestions so people nearby find it, or set the pin yourself.";

  return (
    <div className="grid gap-2.5">
      {pin.point ? (
        <div className="border-line-soft bg-sunken overflow-hidden rounded-[var(--radius-md)] border">
          <iframe
            title={`Map of ${venue?.trim() || "the venue"}`}
            src={mapEmbedUrl(pin.point)}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="block h-44 w-full border-0"
          />
        </div>
      ) : (
        <div className="border-line text-ink-3 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-dashed px-3 py-2.5 text-[12.5px]">
          <MapPinOffIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{empty}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {pin.point ? (
          <p className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
            <MapPinIcon className="text-brand size-3.5 shrink-0" aria-hidden="true" />
            {label ? <span className="text-ink font-medium">{label}</span> : null}
            <span className="text-ink-3 font-mono text-[11.5px] tabular-nums">{formatPoint(pin.point)}</span>
          </p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-controls={panelId} disabled={disabled} onClick={() => setAdjusting(!open)}>
            <CrosshairIcon className="size-3.5" aria-hidden="true" /> Adjust pin
          </button>
          {pin.point ? (
            <button type="button" className="btn btn-ghost btn-sm btn-danger" disabled={disabled} onClick={() => onChange(removedPin())}>
              <XIcon className="size-3.5" aria-hidden="true" /> Remove pin
            </button>
          ) : null}
        </div>
      </div>
      {open ? (
        <div id={panelId} className="border-line-soft grid gap-3 rounded-[var(--radius-md)] border p-3">
          <div>
            <label htmlFor={coordsId} className="text-ink mb-1.5 block text-[12.5px] font-medium">
              Coordinates
            </label>
            <div className="flex gap-2">
              <input
                id={coordsId}
                className="input font-mono text-[12.5px]"
                inputMode="decimal"
                autoComplete="off"
                placeholder="12.97160, 77.59460"
                value={coords}
                disabled={disabled}
                aria-invalid={coordsError ? true : undefined}
                aria-describedby={coordsHintId}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setCoordsError(null);
                }}
                onKeyDown={(e) => {
                  // Sets the pin rather than submitting the whole form.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setFromCoords();
                  }
                }}
              />
              <button type="button" className="btn btn-secondary shrink-0" disabled={disabled} onClick={setFromCoords}>
                Set pin
              </button>
            </div>
            <p id={coordsHintId} className={cn("mt-1.5 text-[12px]", coordsError ? "text-refuse" : "text-ink-3")}>
              {coordsError ?? "Latitude, then longitude. In Google Maps, right-click the spot and click the numbers to copy them."}
            </p>
          </div>
          <div>
            <label htmlFor={linkId} className="text-ink mb-1.5 block text-[12.5px] font-medium">
              Google Maps link · optional
            </label>
            <input
              id={linkId}
              className="input"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://maps.app.goo.gl/…"
              value={mapLink}
              disabled={disabled}
              aria-invalid={linkError ? true : undefined}
              aria-describedby={linkHintId}
              onChange={(e) => {
                onMapLinkChange(e.target.value);
                onChange(pinForLink(pin, e.target.value));
              }}
              onBlur={onMapLinkBlur}
            />
            <p id={linkHintId} className={cn("mt-1.5 text-[12px]", linkError ? "text-refuse" : "text-ink-3")}>
              {linkError ?? "Paste the venue’s link from Google Maps and the pin moves to it. People get the link for directions."}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
