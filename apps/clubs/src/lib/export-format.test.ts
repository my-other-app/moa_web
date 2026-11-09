import { describe, expect, it } from "vitest";
import { dispositionFilename, exportFilename, responseFormat, withFormat } from "@moa/app-kit";

/**
 * The shared export helpers in @moa/app-kit (tested here: the package has no
 * runner of its own). Every server export takes `?format=xlsx` for Excel and
 * sends CSV without it, so one function builds both URLs for every export
 * button in both dashboards.
 */
describe("withFormat", () => {
  it("adds format=xlsx to a bare path", () => {
    expect(withFormat("/api/gateway/api/v1/clubs/contacts/export.csv", "xlsx")).toBe("/api/gateway/api/v1/clubs/contacts/export.csv?format=xlsx");
  });

  it("adds it after a query the URL already has, keeping every other parameter as written", () => {
    expect(withFormat("/x/export.csv?segment=all", "xlsx")).toBe("/x/export.csv?segment=all&format=xlsx");
    expect(withFormat("/x/statement.csv?from=2026-10-01&to=2026-10-31", "xlsx")).toBe("/x/statement.csv?from=2026-10-01&to=2026-10-31&format=xlsx");
    expect(withFormat("/x/export?q=a%20b&attended=false", "xlsx")).toBe("/x/export?q=a%20b&attended=false&format=xlsx");
  });

  it("leaves CSV as the URL was: it is every route's default", () => {
    expect(withFormat("/x/export", "csv")).toBe("/x/export");
    expect(withFormat("/x/export?segment=all", "csv")).toBe("/x/export?segment=all");
  });

  it("replaces a format the URL already carries rather than sending two", () => {
    expect(withFormat("/x/export?format=csv&segment=all", "xlsx")).toBe("/x/export?segment=all&format=xlsx");
    expect(withFormat("/x/export?segment=all&format=xlsx", "csv")).toBe("/x/export?segment=all");
    expect(withFormat("/x/export?format=xlsx", "csv")).toBe("/x/export");
  });

  it("keeps a #fragment last, and copes with a dangling ? or &", () => {
    expect(withFormat("/x/export?segment=all#top", "xlsx")).toBe("/x/export?segment=all&format=xlsx#top");
    expect(withFormat("/x/export?", "xlsx")).toBe("/x/export?format=xlsx");
    expect(withFormat("/x/export?segment=all&", "xlsx")).toBe("/x/export?segment=all&format=xlsx");
  });

  it("doesn't mistake a parameter that merely starts with format for the format", () => {
    expect(withFormat("/x/export?formatted=1", "xlsx")).toBe("/x/export?formatted=1&format=xlsx");
  });
});

describe("naming a fetched export", () => {
  const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const reply = (headers: Record<string, string>) => new Response("x", { status: 200, headers });

  it("reads the server's filename, plain or RFC 5987", () => {
    expect(dispositionFilename('attachment; filename="requests-devfest.xlsx"')).toBe("requests-devfest.xlsx");
    expect(dispositionFilename("attachment; filename=users.csv")).toBe("users.csv");
    expect(dispositionFilename("attachment; filename*=UTF-8''Caf%C3%A9%20night.xlsx")).toBe("Café night.xlsx");
    expect(dispositionFilename(`attachment; filename="fallback.xlsx"; filename*=UTF-8''better.xlsx`)).toBe("better.xlsx");
    expect(dispositionFilename("attachment")).toBeNull();
    expect(dispositionFilename(null)).toBeNull();
  });

  it("falls back to the stem with the extension of what actually came back, else of what was asked", () => {
    expect(exportFilename(reply({ "content-disposition": 'attachment; filename="named.xlsx"' }), "requests-37", "xlsx")).toBe("named.xlsx");
    expect(exportFilename(reply({ "content-type": XLSX }), "requests-37", "xlsx")).toBe("requests-37.xlsx");
    // An older server ignores format=xlsx and answers CSV: saved as what it is.
    expect(exportFilename(reply({ "content-type": "text/csv; charset=utf-8" }), "requests-37", "xlsx")).toBe("requests-37.csv");
    expect(exportFilename(reply({ "content-type": "application/octet-stream" }), "requests-37", "xlsx")).toBe("requests-37.xlsx");
    expect(exportFilename(reply({}), "users", "csv")).toBe("users.csv");
  });

  it("tells Excel from CSV by the Content-Type", () => {
    expect(responseFormat(reply({ "content-type": XLSX }))).toBe("xlsx");
    expect(responseFormat(reply({ "content-type": "text/csv" }))).toBe("csv");
    expect(responseFormat(reply({ "content-type": "application/json" }))).toBeNull();
  });
});
