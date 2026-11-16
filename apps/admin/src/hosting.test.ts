import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import { hasLocalMatch } from "next/dist/shared/lib/match-local-pattern";

/**
 * How the admin portal is built and shipped, as far as this repository
 * decides it: the Vercel build (vercel.admin.json, deployed by the Deploy
 * workflow on every merge to main) and the self-hosted image for the Oracle
 * box (the Dockerfile's standalone build, made by the Images workflow for
 * amd64 and arm64). Vercel and GHCR themselves are outside a unit test; what
 * these hold is that the files steering them still say what the platform
 * relies on, including the two failures already paid for: deploys that went
 * to a preview while reporting success, and a failed Vercel build that the
 * job reported green (2026-10-24).
 */
// Tests run from the app's own directory (turbo runs `vitest run` there), two levels under the repository.
const root = path.resolve(process.cwd(), "..", "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

async function loadNextConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return (await import("../next.config")).default;
}
afterEach(() => vi.unstubAllEnvs());

describe("the admin portal's build", () => {
  it("is a plain Next build on Vercel, with no standalone server and no Sentry wrapping unless asked", async () => {
    const config = await loadNextConfig({ NEXT_OUTPUT: "", NEXT_PUBLIC_SENTRY_DSN: "" });
    expect(config.output).toBeUndefined();
    expect(config.outputFileTracingRoot).toBeUndefined();
    // The workspace packages ship TypeScript, so the app compiles them itself.
    expect(config.transpilePackages).toEqual(expect.arrayContaining(["@moa/ui", "@moa/api", "@moa/auth", "@moa/app-kit"]));
  });

  it("builds a standalone server for the image, traced from the repository root so the workspace packages come along", async () => {
    const config = await loadNextConfig({ NEXT_OUTPUT: "standalone", NEXT_PUBLIC_SENTRY_DSN: "" });
    expect(config.output).toBe("standalone");
    expect(path.resolve(config.outputFileTracingRoot!)).toBe(path.resolve(process.cwd(), "..", ".."));
    expect(existsSync(path.join(config.outputFileTracingRoot!, "package-lock.json"))).toBe(true);
  });
});

describe("the Vercel deploy (main-portal.myotherapp.in)", () => {
  it("builds this app's workspace from the repository root, so the shared packages are there", () => {
    const vercel = JSON.parse(read("vercel.admin.json"));
    expect(vercel.framework).toBe("nextjs");
    expect(vercel.buildCommand).toBe("npm run build --workspace @moa/admin");
    expect(vercel.outputDirectory).toBe("apps/admin/.next");
  });

  it("runs only by hand (production is served by the MyOtherApp server), for this app with its own config, only after typecheck and tests pass", () => {
    const deploy = read(".github/workflows/deploy.yml");
    expect(deploy).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(deploy).not.toMatch(/on:\s*\n\s*push:/);
    expect(deploy).toMatch(/- app: admin\s*\n\s*config: vercel\.admin\.json\s*\n\s*project_id_secret: VERCEL_PROJECT_ID_ADMIN/);
    const steps = ["run: npm ci", "run: npm run typecheck", "run: npm run test", "vercel@"].map((s) => deploy.indexOf(s));
    expect(steps.every((i) => i > 0)).toBe(true);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it("goes to production, not a preview, and fails the job unless Vercel says the deployment is READY", () => {
    const deploy = read(".github/workflows/deploy.yml");
    expect(deploy).toContain('PROD="--prod"');
    // A pinned CLI, so a release cannot change a deploy between two pushes.
    expect(deploy).toMatch(/npx --yes vercel@\d+\.\d+\.\d+ deploy \$PROD/);
    // Without pipefail the piped deploy's status was tee's, always 0.
    expect(deploy).toContain("set -euo pipefail");
    expect(deploy).toMatch(/if \[ "\$state" != "READY" \]; then[\s\S]*?exit 1/);
  });
});

describe("the self-hosted image (Oracle box)", () => {
  it("is built standalone, for clubs or admin only", () => {
    const docker = read("Dockerfile");
    expect(docker).toMatch(/NEXT_OUTPUT=standalone/);
    expect(docker).toContain("case \"$APP\" in clubs|admin) ;;");
  });

  it("is made for both amd64 and arm64 and pushed to GHCR as moa-admin", () => {
    const images = read(".github/workflows/images.yml");
    expect(images).toContain("platforms: linux/${{ matrix.arch }}");
    expect(images).toMatch(/arch: \[amd64, arm64\]/);
    expect(images).toMatch(/app: \[clubs, admin\]/);
    expect(images).toContain("IMAGE: ghcr.io/my-other-app/moa-${{ matrix.app }}");
  });
});

describe("the main portal's security headers", () => {
  type Rule = { source: string; headers: { key: string; value: string }[] };
  const rules = async (env: Record<string, string> = { NEXT_PUBLIC_SENTRY_DSN: "" }) => {
    const config = await loadNextConfig(env);
    return { config, rules: ((await config.headers?.()) ?? []) as Rule[] };
  };
  const header = (rule: Rule | undefined, key: string) => rule?.headers.find((h) => h.key === key)?.value;

  it("sends them on every page: no framing, nosniff, a trimmed referrer, device features off, no X-Powered-By", async () => {
    const { config, rules: all } = await rules();
    expect(config.poweredByHeader).toBe(false);
    const every = all.find((r) => r.source === "/:path*");
    expect(header(every, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(header(every, "X-Frame-Options")).toBe("DENY");
    expect(header(every, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(every, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header(every, "Permissions-Policy")).toContain("camera=()");
    expect(header(every, "Permissions-Policy")).toContain("microphone=()");
  });

  it("sends no referrer at all from a page with a credential in its address, after the general rule", async () => {
    const { rules: all } = await rules();
    const general = all.findIndex((r) => r.source === "/:path*");
    for (const source of ["/accept-invite/:path*"]) {
      const at = all.findIndex((r) => r.source === source);
      expect(at).toBeGreaterThan(general);
      expect(header(all[at], "Referrer-Policy")).toBe("no-referrer");
    }
  });

  it("sends the script policy as a report only: what the browser enforces is unchanged", async () => {
    const { rules: all } = await rules();
    for (const rule of all) {
      const enforced = rule.headers.filter((h) => h.key === "Content-Security-Policy").map((h) => h.value);
      expect(enforced.every((v) => v === "frame-ancestors 'none'; base-uri 'self'; object-src 'none'")).toBe(true);
    }
    const report = header(all.find((r) => r.source === "/:path*"), "Content-Security-Policy-Report-Only")!;
    expect(report).toMatch(/^default-src 'self'; script-src 'self' 'unsafe-inline' /);
    expect(report).toContain("script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client;");
    expect(report).toContain("connect-src 'self' https://accounts.google.com/gsi/;");
    expect(report).toContain("frame-src 'self' blob: https://accounts.google.com;");
    expect(report).toContain("img-src 'self' data: blob: https:;");
    expect(report).toContain("font-src 'self' data: https://fonts.gstatic.com;");
    expect(report).toContain("object-src 'none'; base-uri 'self'");
    expect(report).not.toContain("unsafe-eval");
    // Sentry off: nothing to report to, and no Sentry host to allow.
    expect(report).not.toContain("report-uri");
    expect(report).not.toContain("sentry");
  });

  it("reports through this app's own report address when Sentry is on, and allows Sentry's ingest", async () => {
    const { rules: all } = await rules({ NEXT_PUBLIC_SENTRY_DSN: "https://k@o42.ingest.de.sentry.io/4507" });
    const report = header(all.find((r) => r.source === "/:path*"), "Content-Security-Policy-Report-Only")!;
    expect(report).toMatch(/connect-src [^;]* https:\/\/o42\.ingest\.de\.sentry\.io;/);
    expect(report).toMatch(/; report-uri \/api\/csp-report$/);
    const mod = await import("../next.config");
    expect(mod.sentryOrigin("https://k@o42.ingest.de.sentry.io/4507")).toBe("https://o42.ingest.de.sentry.io");
    for (const dsn of ["", "not a dsn", "https://o42.ingest.sentry.io/4507", "http://k@o42.ingest.sentry.io/1", "https://k@o42.ingest.sentry.io/x"]) expect(mod.sentryOrigin(dsn)).toBeNull();
    expect(mod.reportOnlyPolicy({ dev: true, sentry: null })).toContain("'unsafe-inline' 'unsafe-eval' ");
  });

  it("lets a report reach its route without the session guard, and answers it without Sentry by sending nothing", async () => {
    const { config: proxy } = await import("./proxy");
    const guarded = (p: string) => new RegExp(`^${proxy.matcher[0]}$`).test(p);
    expect(guarded("/api/csp-report")).toBe(false);
    expect(guarded("/settings")).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    try {
      const { POST } = await import("./app/api/csp-report/route");
      const res = await POST(new Request("https://dashboard.test/api/csp-report", { method: "POST", headers: { "content-type": "application/csp-report" }, body: JSON.stringify({ "csp-report": { "document-uri": "https://dashboard.test/", "effective-directive": "img-src" } }) }));
      expect(res.status).toBe(204);
      expect(send).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps them when Sentry wraps the config", async () => {
    const { config, rules: all } = await rules({ NEXT_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.sentry.io/1" });
    expect(config.poweredByHeader).toBe(false);
    expect(header(all.find((r) => r.source === "/:path*"), "X-Frame-Options")).toBe("DENY");
  });
});

describe("the public image optimizer (/_next/image)", () => {
  it("fetches only from our media store and the API's static files, over https", async () => {
    const { images } = await loadNextConfig({ NEXT_OUTPUT: "standalone", NEXT_PUBLIC_SENTRY_DSN: "" });
    const allowed = (url: string) => hasRemoteMatch([], images!.remotePatterns ?? [], new URL(url));
    expect(allowed("https://media.myotherapp.in/myotherapp-media/clubs/logos/v-1.png")).toBe(true);
    expect(allowed("https://api.myotherapp.in/static/site-templates/bento.png")).toBe(true);
    for (const url of [
      "https://evil-bucket.s3.amazonaws.com/huge.png",
      "https://ec2-1-2-3-4.compute-1.amazonaws.com/a.png",
      "https://some-club.myotherapp.in/logo.png",
      "https://api.myotherapp.in/api/v1/clubs/1",
      "http://media.myotherapp.in/a.png",
      "https://example.com/a.png",
    ]) {
      expect(allowed(url)).toBe(false);
    }
    // Nothing in the old wildcard form is left.
    expect(JSON.stringify(images!.remotePatterns)).not.toContain("**.");
  });

  it("draws only the brand's own files from this app, with no query", async () => {
    const { images } = await loadNextConfig({ NEXT_OUTPUT: "standalone", NEXT_PUBLIC_SENTRY_DSN: "" });
    expect(hasLocalMatch(images!.localPatterns, "/brand/icon.png")).toBe(true);
    expect(hasLocalMatch(images!.localPatterns, "/brand/icon.png?v=2")).toBe(false);
    expect(hasLocalMatch(images!.localPatterns, "/login")).toBe(false);
    expect(hasLocalMatch(images!.localPatterns, "/api/gateway/api/v1/auth/me")).toBe(false);
  });

  it("keeps its work bounded: no redirects, a capped download and disk cache, a few sizes, one quality", async () => {
    const { images } = await loadNextConfig({ NEXT_OUTPUT: "standalone", NEXT_PUBLIC_SENTRY_DSN: "" });
    expect(images).toMatchObject({ maximumRedirects: 0, maximumResponseBody: 10_000_000, maximumDiskCacheSize: 100_000_000, minimumCacheTTL: 86_400, qualities: [75] });
    expect([...(images!.deviceSizes ?? []), ...(images!.imageSizes ?? [])].length).toBeLessThanOrEqual(12);
  });
});
