const DATE = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const NUMBER = new Intl.NumberFormat("en-IN");

const CURRENCY = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** en-IN throughout: the product, its payments and its users are Indian. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "--";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "--" : DATE.format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "--";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "--" : DATE_TIME.format(d);
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "--" : NUMBER.format(value);
}

/**
 * Money arrives as rupees (the backend stores Numeric(10,2) after the
 * money-precision migration), so no division is applied here.
 */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "--";
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(n) ? "--" : CURRENCY.format(n);
}

export function initials(name: string | null | undefined, fallback = "?"): string {
  if (!name?.trim()) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || fallback;
}
