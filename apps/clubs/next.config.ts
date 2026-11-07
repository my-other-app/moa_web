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

/*
 * Security headers on every response, pages and the gateway alike.
 *
 * - No framing by anyone (frame-ancestors, and X-Frame-Options for older
 *   browsers): a dashboard inside another site's frame is a clickjacking
 *   target. The dashboards' own frames (mail previews, the print frame) are
 *   srcdoc/blob documents and are unaffected.
 * - nosniff, so an upload or an export is never run as a script or a page.
 * - The referrer carries the origin only, when leaving the site, and
 *   nothing at all from a page with a credential in its address.
 * - Device features off except what is used: the gate scans tickets with the camera, on this origin only.
 *
 * The CSP is the part that cannot break anything (framing, <base>, plugins).
 * A script/connect allow-list needs Next's inline scripts nonced or hashed
 * and every third party (Google sign-in, Razorpay, Sentry, the media CDN)
 * listed -- tracked separately rather than guessed here.
 */
// Pages whose address carries a credential: a door key (/gate/{id}?key=),
// a kiosk's pairing token, the admin's impersonation hand-off, a team
// invite, a guest's phone check-in link and a request's confirmation link.
// Their address is sent nowhere, not even its origin.
const CREDENTIAL_PAGES = ["/gate/:path*", "/kiosk/:path*", "/impersonate/:path*", "/join/:path*", "/s/:path*", "/confirm/:path*"];

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), usb=(), browsing-topics=()" },
];

async function headers() {
  return [
    { source: "/:path*", headers: SECURITY_HEADERS },
    // Later entries win for the same header.
    ...CREDENTIAL_PAGES.map((source) => ({ source, headers: [{ key: "Referrer-Policy", value: "no-referrer" }] })),
  ];
}

const nextConfig: NextConfig = {
  ...standalone,
  reactStrictMode: true,
  // No `X-Powered-By: Next.js`.
  poweredByHeader: false,
  headers,
  // Workspace packages ship TypeScript source rather than a build artefact, so
  // Next compiles them with the app. This keeps the shared UI editable without
  // a watch/rebuild step between packages and apps.
  transpilePackages: ["@moa/ui", "@moa/api", "@moa/auth", "@moa/app-kit", "@moa/observability"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
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
const sentryRelease = process.env.SENTRY_RELEASE || (commit ? `moa-clubs@${commit}` : undefined);
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
