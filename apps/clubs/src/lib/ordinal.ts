/**
 * A number as a place in English: 1st, 2nd, 3rd, 4th … 11th, 12th, 13th
 * (the teens are always "th") … 21st, 22nd, 23rd … 101st, 111th, 112th.
 */
export function ordinal(n: number): string {
  const whole = Math.trunc(n);
  const tens = Math.abs(whole) % 100;
  const ones = Math.abs(whole) % 10;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th";
  return `${whole}${suffix}`;
}
