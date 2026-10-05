import type { MetricDelta } from "@moa/ui";

/**
 * Change against the preceding window, as something a reader can act on.
 *
 * Two cases are deliberately not percentages. Growth from zero is not "infinite
 * percent", so it reads as `new`; and a sub-1% move on a small base is noise
 * dressed up as a signal, so it reads as `flat` with a neutral colour rather
 * than a green arrow for a single extra registration.
 */
export function changeOf(
  current: number,
  previous: number,
  inverted = false
): MetricDelta | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    return current > 0 ? { label: "new", direction: "up", inverted } : null;
  }

  const percent = ((current - previous) / previous) * 100;
  if (Math.abs(percent) < 1) return { label: "flat", direction: "flat", inverted };

  return {
    label: `${percent > 0 ? "+" : ""}${Math.round(percent)}%`,
    direction: percent > 0 ? "up" : "down",
    inverted,
  };
}

/** "vs previous 30 days" — spelled out, because "vs prev." is not shorter to read. */
export function comparisonCaption(days: number): string {
  return `vs previous ${days} days`;
}
