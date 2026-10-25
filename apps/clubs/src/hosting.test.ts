import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * How the club dashboard is built and shipped, as far as this repository
 * decides it: the Vercel build (vercel.clubs.json, deployed by the Deploy
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

describe("the club dashboard's build", () => {
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

describe("the Vercel deploy (club-dashboard.myotherapp.in)", () => {
  it("builds this app's workspace from the repository root, so the shared packages are there", () => {
    const vercel = JSON.parse(read("vercel.clubs.json"));
    expect(vercel.framework).toBe("nextjs");
    expect(vercel.buildCommand).toBe("npm run build --workspace @moa/clubs");
    expect(vercel.outputDirectory).toBe("apps/clubs/.next");
  });

  it("runs on every push to main, for this app with its own config, only after typecheck and tests pass", () => {
    const deploy = read(".github/workflows/deploy.yml");
    expect(deploy).toMatch(/on:\s*\n\s*push:\s*\n\s*branches:\s*\[main\]/);
    expect(deploy).toMatch(/- app: clubs\s*\n\s*config: vercel\.clubs\.json\s*\n\s*project_id_secret: VERCEL_PROJECT_ID_CLUBS/);
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

  it("is made for both amd64 and arm64 and pushed to GHCR as moa-clubs", () => {
    const images = read(".github/workflows/images.yml");
    expect(images).toContain("platforms: linux/${{ matrix.arch }}");
    expect(images).toMatch(/arch: \[amd64, arm64\]/);
    expect(images).toMatch(/app: \[clubs, admin\]/);
    expect(images).toContain("IMAGE: ghcr.io/my-other-app/moa-${{ matrix.app }}");
  });
});
