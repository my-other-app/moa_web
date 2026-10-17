"use client";

import * as React from "react";
import { useDebouncedValue } from "@moa/ui/hooks";

import { searchPlaces, type Place } from "./api";

/** How long typing has to pause before Photon is asked. */
export const SEARCH_DELAY_MS = 300;
/** Fewer letters than this match half the country. */
export const MIN_QUERY_LENGTH = 3;

export type PlaceSearchStatus = "idle" | "searching" | "done" | "failed";

interface Answer {
  query: string;
  places: readonly Place[];
  failed: boolean;
}

const NONE: readonly Place[] = [];

/**
 * Suggestions for what is being typed.
 *
 * Photon is asked once typing pauses on a text of three letters or more,
 * and only while `enabled` (the picker turns it off for a name it filled in
 * itself). An answer only counts for the text it was asked about: when the
 * text moves on, the request in flight is aborted and whatever it returns
 * is dropped, so a slow answer to "Tech" can never replace the one for
 * "Technopark". Until the new answer arrives the last one stays up, which
 * keeps the list from flickering between keystrokes.
 *
 * Plain fetch rather than React Query: the suggestions belong to one field
 * for a few seconds, and the stale-answer rule is the whole point, so it is
 * kept where it can be read.
 */
export function usePlaceSearch(text: string, enabled: boolean): { places: readonly Place[]; status: PlaceSearchStatus } {
  const query = text.trim();
  const settled = useDebouncedValue(query, SEARCH_DELAY_MS);
  const ask = enabled && settled === query && query.length >= MIN_QUERY_LENGTH;
  const [answer, setAnswer] = React.useState<Answer | null>(null);

  React.useEffect(() => {
    if (!ask) return;
    let current = true;
    const controller = new AbortController();
    searchPlaces(settled, controller.signal).then(
      (places) => {
        if (current) setAnswer({ query: settled, places, failed: false });
      },
      () => {
        if (current) setAnswer({ query: settled, places: NONE, failed: true });
      },
    );
    return () => {
      current = false;
      controller.abort();
    };
  }, [ask, settled]);

  if (!enabled || query.length < MIN_QUERY_LENGTH) return { places: NONE, status: "idle" };
  // A failure holds until a search succeeds: the field just works as plain text meanwhile.
  if (answer?.failed) return { places: NONE, status: "failed" };
  if (answer && answer.query === query) return { places: answer.places, status: "done" };
  return { places: answer?.places ?? NONE, status: "searching" };
}
