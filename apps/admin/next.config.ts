import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

/*
 * Self-hosted (the Oracle box: Dockerfile at the repository root, moa_backend
 * ops/server): the image build sets NEXT_OUTPUT=standalone, for a server.js
 * carrying only the files it needs. The workspace packages and the hoisted
 * node_modules sit two levels up, so files are traced from the repository
 * root (the build runs in this app's directory). A Vercel build leaves
 * NEXT_OUTPUT unset and is unchanged.
 */
const standalone: Partial<NextConfig> =
  process.env.NEXT_OUTPUT === "standalone"
    ? { output: "standalone", outputFileTracingRoot: path.join(process.cwd(), "..", "..") }
    : {};

const nextConfig: NextConfig = {
  ...standalone,
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than a build artefact, so
  // Next compiles them with the app. This keeps the shared UI editable without
  // a watch/rebuild step between packages and apps.
  transpilePackages: ["@moa/ui", "@moa/api", "@moa/auth", "@moa/app-kit", "@moa/observability"],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  images: {
    // Club logos, avatars and badge art are served from the API's S3 bucket.
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.myotherapp.in" },
    ],
  },
};

/*
 * Sentry, only when NEXT_PUBLIC_SENTRY_DSN is set for the build. Without it
 * the config is returned untouched and the runtime never starts the SDK
 * either (src/sentry.ts), so an unconfigured deployment sends nothing.
 *
 * The environment comes from Vercel (production or preview) and the release
 * from the deployed commit, both fixed here at build time so the browser,
 * the server and the uploaded source maps carry the same values.
 *
 * Source maps are uploaded only when SENTRY_AUTH_TOKEN, SENTRY_ORG and
 * SENTRY_PROJECT are all set, and deleted from the build once uploaded, so
 * they are never served. No tunnelRoute: proxy.ts would send it to sign-in.
 */
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
const uploadSourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);
const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID;
const sentryRelease = process.env.SENTRY_RELEASE || (commit ? `moa-admin@${commit}` : undefined);
const sentryEnvironment =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
  process.env.VERCEL_ENV ||
  (process.env.NODE_ENV === "production" ? "production" : "development");

export default sentryDsn
  ? withSentryConfig(
      {
        ...nextConfig,
        env: {
          ...nextConfig.env,
          NEXT_PUBLIC_SENTRY_ENVIRONMENT: sentryEnvironment,
          ...(sentryRelease ? { NEXT_PUBLIC_SENTRY_RELEASE: sentryRelease } : {}),
        },
      },
      {
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        silent: !process.env.CI,
        telemetry: false,
        release: { name: sentryRelease, create: uploadSourceMaps, finalize: uploadSourceMaps },
        sourcemaps: { disable: !uploadSourceMaps, deleteSourcemapsAfterUpload: true },
        widenClientFileUpload: true,
        bundleSizeOptimizations: {
          excludeDebugStatements: true,
          excludeReplayIframe: true,
          excludeReplayShadowDom: true,
          excludeReplayWorker: true,
        },
      }
    )
  : nextConfig;
