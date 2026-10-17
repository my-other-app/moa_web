/**
 * Paise, as rupees, grouped the Indian way: ₹1,23,45,678.
 *
 * Whole rupees show none of the paise; an odd amount shows both places, so
 * ₹1,499.50 never rounds to ₹1,500 in a table someone reconciles against.
 */
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const INR_EXACT = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatPaise(paise: number): string {
  return paise % 100 === 0 ? INR.format(paise / 100) : INR_EXACT.format(paise / 100);
}

/** To the rupee, for headline figures. */
export function formatPaiseRounded(paise: number): string {
  return INR.format(Math.round(paise / 100));
}

/** ₹1.2Cr, ₹3.4L, ₹12.5k: an axis label, never a figure someone reads exactly. */
export function compactPaise(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? "−" : "";
  if (rupees >= 1_00_00_000) return `${sign}₹${trim(rupees / 1_00_00_000)}Cr`;
  if (rupees >= 1_00_000) return `${sign}₹${trim(rupees / 1_00_000)}L`;
  if (rupees >= 1_000) return `${sign}₹${trim(rupees / 1_000)}k`;
  return `${sign}₹${Math.round(rupees)}`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10" → "Oct 2026"; anything else as it came. */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const name = MONTHS[Number(m[2]) - 1];
  return name ? `${name} ${m[1]}` : month;
}

/** "2026-10" → "Oct". */
export function shortMonth(month: string): string {
  const m = /^\d{4}-(\d{2})$/.exec(month);
  return (m && MONTHS[Number(m[1]) - 1]) || month;
}

/** This month against last, as "+12%" / "−40%" / "new"; null when there is nothing to compare. */
export function monthChange(current: number, previous: number): { label: string; direction: "up" | "down" | "flat" } | null {
  if (previous === 0) return current > 0 ? { label: "new", direction: "up" } : null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { label: "0%", direction: "flat" };
  return pct > 0 ? { label: `+${pct}%`, direction: "up" } : { label: `−${Math.abs(pct)}%`, direction: "down" };
}
