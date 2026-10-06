import type { ClubEvent } from "@/features/events";

/**
 * What a club's event list implies about the work in front of them.
 *
 * The overview showed four counters -- followers, events, live events, rating
 * -- none of which change what anyone does today. These derive the things that
 * do: what is next, what is filling, and what has been left unfinished.
 *
 * Kept as pure functions so the arithmetic is testable without rendering, and
 * so the same definitions are used by every panel rather than each one
 * deciding separately what "upcoming" means.
 */
export const CLOSING_SOON_HOURS = 48;

function time(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? null : value;
}

export function isUpcoming(event: ClubEvent, now = Date.now()): boolean {
  const at = time(event.event_datetime);
  return at !== null && at >= now;
}

/** Soonest first. Events with no date sort last rather than to 1970. */
export function byDateAscending(a: ClubEvent, b: ClubEvent): number {
  const left = time(a.event_datetime);
  const right = time(b.event_datetime);
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

export function hoursUntil(iso: string | null | undefined, now = Date.now()): number | null {
  const at = time(iso);
  return at === null ? null : (at - now) / 3_600_000;
}

/**
 * Registration closes within the window and the event has not happened yet.
 *
 * The second half matters: a past event's registration deadline is also in the
 * past, and surfacing it as "closing soon" would be noise on every old row.
 */
export function isClosingSoon(event: ClubEvent, now = Date.now()): boolean {
  if (!isUpcoming(event, now)) return false;
  const hours = hoursUntil(event.reg_enddate, now);
  return hours !== null && hours > 0 && hours <= CLOSING_SOON_HOURS;
}

/**
 * Finished, people registered, nobody was marked present.
 *
 * Attendance is what certificates and winners are issued from, so an unmarked
 * event is not a tidiness problem -- it is attendees not getting what they
 * turned up for.
 */
export function needsAttendance(event: ClubEvent, now = Date.now()): boolean {
  return (
    !isUpcoming(event, now) &&
    (event.registration_count ?? 0) > 0 &&
    (event.attended_count ?? 0) === 0
  );
}

export interface ReachSummary {
  views: number;
  registrations: number;
  attended: number;
  /** Registrations per 100 views, over events with any views at all. */
  conversionPercent: number;
  /** Attended per 100 registrations, over events that have happened. */
  attendancePercent: number;
}

export function summariseReach(events: readonly ClubEvent[], now = Date.now()): ReachSummary {
  const views = events.reduce((sum, e) => sum + (e.page_views ?? 0), 0);
  const registrations = events.reduce((sum, e) => sum + (e.registration_count ?? 0), 0);

  // Attendance is only meaningful for events that have already happened --
  // including upcoming ones drags it toward zero and makes it look like a
  // problem that has not had the chance to occur yet.
  const past = events.filter((e) => !isUpcoming(e, now));
  const pastRegistrations = past.reduce((sum, e) => sum + (e.registration_count ?? 0), 0);
  const attended = past.reduce((sum, e) => sum + (e.attended_count ?? 0), 0);

  return {
    views,
    registrations,
    attended,
    conversionPercent: views > 0 ? (registrations / views) * 100 : 0,
    attendancePercent: pastRegistrations > 0 ? (attended / pastRegistrations) * 100 : 0,
  };
}
