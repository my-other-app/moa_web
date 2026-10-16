const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const INR_PAISE = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole rupees read as whole rupees; paise show only when there are any. A negative reads "−₹150", not "-₹150". */
export const rupees = (n: number) => {
  const s = Number.isInteger(n) ? INR.format(Math.abs(n)) : INR_PAISE.format(Math.abs(n));
  return n < 0 ? `−${s}` : s;
};

/** ₹18.9k, ₹1.97L, ₹2.1Cr — for labels where the full figure would not fit. */
export function short(n: number): string {
  const a = Math.abs(n);
  const s = a >= 1e7 ? `${(a / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(2)}L` : a >= 1000 ? `${(a / 1000).toFixed(1)}k` : String(Math.round(a));
  return `${n < 0 ? "−" : ""}₹${s}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
