import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Database snapshots.
 *
 * The download URL is the part worth pinning: it goes through the gateway so
 * the session cookie authenticates it, and the name is interpolated into a
 * path, so it has to be encoded on the way out as well as validated on the way
 * in.
 */
const calls: Array<{ method: string; path: string }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        return {
          items: [
            { name: "backup-20260106-120000.dump", size_bytes: 11_534_336, created_at: "2026-01-06T12:00:00Z" },
          ],
          directory: "/backups",
          is_offsite: false,
        };
      }),
      post: vi.fn(async (path: string) => {
        calls.push({ method: "POST", path });
        return { name: "backup-20260106-130000.dump", size_bytes: 11_000_000, created_at: "2026-01-06T13:00:00Z" };
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
      put: vi.fn(),
    },
  };
});

const { fetchBackups, createBackup, deleteBackup, backupDownloadUrl } = await import(
  "./backups/api"
);

beforeEach(() => {
  calls.length = 0;
});

describe("snapshots", () => {
  it("parses the listing rather than trusting it", async () => {
    const list = await fetchBackups();
    expect(list.items[0]!.size_bytes).toBe(11_534_336);
    expect(list.directory).toBe("/backups");
  });

  it("takes a snapshot with no body", async () => {
    await createBackup();
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.path).toBe("/api/v1/admin/backups");
  });

  it("routes the download through the gateway, not the API host", () => {
    // A direct API URL would carry no cookie and 401.
    const url = backupDownloadUrl("backup-20260106-120000.dump");
    expect(url.startsWith("/api/gateway/")).toBe(true);
    expect(url).toContain("/admin/backups/backup-20260106-120000.dump");
  });

  it("encodes the name in both the download URL and the delete call", async () => {
    // The server rejects a name like this outright; encoding it means the
    // rejection is what answers, rather than the path being reinterpreted.
    const url = backupDownloadUrl("../../etc/passwd");
    expect(url).not.toContain("../");
    await deleteBackup("../../etc/passwd");
    expect(calls[0]!.path).not.toContain("../");
  });
});
