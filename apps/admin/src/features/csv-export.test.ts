import { describe, expect, it, vi } from "vitest";
import { fetchAllPages, toCsv } from "@moa/app-kit";

/**
 * CSV export was missing everywhere except event registrations. The escaping
 * matters more than it looks: these files are opened in Excel, and the values
 * are names and addresses typed by users.
 */
interface Row {
  name: string;
  note: string;
}

const columns = [
  { header: "Name", value: (r: Row) => r.name },
  { header: "Note", value: (r: Row) => r.note },
];

describe("csv escaping", () => {
  it("quotes a value containing a comma", () => {
    const csv = toCsv([{ name: "Smith, John", note: "x" }], columns);
    expect(csv.split("\r\n")[1]).toBe('"Smith, John",x');
  });

  it("doubles inner quotes", () => {
    // Otherwise the field terminates early and every later column shifts.
    const csv = toCsv([{ name: 'O\'Brien "The" Society', note: "x" }], columns);
    expect(csv.split("\r\n")[1]).toBe('"O\'Brien ""The"" Society",x');
  });

  it("quotes a value containing a newline", () => {
    const csv = toCsv([{ name: "Line one\nLine two", note: "x" }], columns);
    expect(csv).toContain('"Line one\nLine two"');
  });

  it("neutralises a formula so a spreadsheet does not run it", () => {
    // A club named =HYPERLINK(...) would otherwise execute on open.
    const csv = toCsv([{ name: "=1+1", note: "@SUM(A1)" }], columns);
    const row = csv.split("\r\n")[1]!;
    expect(row.startsWith("'=1+1")).toBe(true);
    expect(row).toContain("'@SUM(A1)");
  });

  it("writes empty cells for null and undefined", () => {
    const csv = toCsv(
      [{ name: null as unknown as string, note: undefined as unknown as string }],
      columns
    );
    expect(csv.split("\r\n")[1]).toBe(",");
  });

  it("emits a header row even with no data", () => {
    expect(toCsv([], columns)).toBe("Name,Note");
  });

  it("uses CRLF, which Excel needs to see separate rows", () => {
    const csv = toCsv([{ name: "a", note: "b" }], columns);
    expect(csv).toBe("Name,Note\r\na,b");
  });
});

describe("fetching every page for an export", () => {
  it("follows pages until one comes back short", async () => {
    const page = vi.fn(async (offset: number) => ({
      items: Array.from({ length: offset < 200 ? 100 : 40 }, (_, i) => ({ id: offset + i })),
    }));

    const { rows, truncated } = await fetchAllPages(page);

    expect(rows).toHaveLength(240);
    expect(truncated).toBe(false);
    expect(page).toHaveBeenCalledTimes(3);
  });

  it("trims the over-fetched row the API adds to detect a next page", async () => {
    // The backend returns limit+1; keeping it would duplicate a row at every
    // page boundary.
    const page = vi.fn(async (offset: number) => ({
      items: Array.from({ length: offset === 0 ? 101 : 5 }, (_, i) => ({ id: offset + i })),
    }));

    const { rows } = await fetchAllPages(page);

    expect(rows).toHaveLength(105);
    expect(new Set(rows.map((r) => r.id)).size).toBe(105);
  });

  it("stops at the cap and says it was truncated", async () => {
    const page = vi.fn(async (offset: number) => ({
      items: Array.from({ length: 100 }, (_, i) => ({ id: offset + i })),
    }));

    const { rows, truncated } = await fetchAllPages(page, { maxRows: 250 });

    expect(rows).toHaveLength(250);
    expect(truncated).toBe(true);
  });

  it("handles an empty result without looping", async () => {
    const page = vi.fn(async () => ({ items: [] }));
    const { rows, truncated } = await fetchAllPages(page);
    expect(rows).toEqual([]);
    expect(truncated).toBe(false);
    expect(page).toHaveBeenCalledTimes(1);
  });
});
