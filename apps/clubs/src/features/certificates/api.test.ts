import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; path: string; body?: unknown; options?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown, options?: unknown) => {
    calls.push({ method, path, body, options });
    if (path.endsWith("/summary"))
      return { issued: 2, revoked: 0, attended: 2, registrations: 3, outdated: 0, design_version: 1, channels: [{ channel: "email", sent: 1, failed: 0, skipped: 0, pending: 0, unsent: 1 }] };
    if (path.endsWith("/issue-preview")) return { eligible: 2, already_issued: 0, to_issue: 2, outdated: 0 };
    if (path.endsWith("/issue")) return { issued: 2, refreshed: 0, already_issued: 0 };
    if (path.endsWith("/revoke")) return { registration_id: "r1", number: "CERT-1", revoked_at: "2026-10-11T00:00:00Z" };
    if (path.endsWith("/reinstate")) return { registration_id: "r1", number: "CERT-1", revoked_at: null };
    return { items: [], total: 0, page: 1, page_size: 25 };
  };
  return {
    ...actual,
    api: {
      get: vi.fn((path: string, options?: unknown) => record("GET")(path, undefined, options)),
      put: vi.fn(record("PUT")),
      post: vi.fn(record("POST")),
      del: vi.fn(record("DELETE")),
    },
  };
});

const { certificatePdfUrl, fetchCertificateSummary, fetchCertificates, fetchIssuePreview, issueCertificates, setCertificateRevoked } =
  await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("the certificate endpoints", () => {
  it("previews and issues to the audience chosen", async () => {
    const p = await fetchIssuePreview(42, { audience: "roles", roles: ["speaker"] });
    await issueCertificates(42, { audience: "checked_in", roles: [] });

    expect(p.to_issue).toBe(2);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/api/v1/events/42/certificates/issue-preview", body: { audience: "roles", roles: ["speaker"] } });
    expect(calls[1]).toMatchObject({ method: "POST", path: "/api/v1/events/42/certificates/issue", body: { audience: "checked_in" } });
  });

  it("lists with the filters as query parameters, and reads the summary", async () => {
    await fetchCertificates({ eventId: 42, status: "revoked", search: "ananya", page: 2, pageSize: 25 });
    const s = await fetchCertificateSummary(42);

    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/v1/events/42/certificates", options: { query: { status: "revoked", search: "ananya", page: 2, page_size: 25 } } });
    expect(s.design_version).toBe(1);
  });

  it("revokes and reinstates by registration, and opens the PDF through the gateway", async () => {
    const state = await setCertificateRevoked(42, "r1", true);
    await setCertificateRevoked(42, "r1", false);

    expect(calls[0]?.path).toBe("/api/v1/events/42/certificates/r1/revoke");
    expect(calls[1]?.path).toBe("/api/v1/events/42/certificates/r1/reinstate");
    expect(state.revoked_at).not.toBeNull();
    expect(certificatePdfUrl("MOA-1")).toBe("/api/gateway/api/v1/events/certificates/MOA-1/pdf");
  });
});
