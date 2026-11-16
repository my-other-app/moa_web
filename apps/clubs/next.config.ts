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
 * The enforced CSP is the part that cannot break anything (framing, <base>,
 * plugins). The script and connection policy goes alongside it as a report
 * only (reportOnlyPolicy, below).
 */
// Pages whose address carries a credential: a door key (/gate/{id}?key=),
// a kiosk's pairing token, the admin's impersonation hand-off, a team
// invite, a guest's phone check-in link and a request's confirmation link.
// Their address is sent nowhere, not even its origin.
const CREDENTIAL_PAGES = ["/gate/:path*", "/kiosk/:path*", "/impersonate/:path*", "/join/:path*", "/s/:path*", "/confirm/:path*"];

/** The origin a Sentry DSN sends to (https://<key>@<host>/<project> → https://<host>), or null when it is not one. */
export function sentryOrigin(dsn: string | undefined = process.env.NEXT_PUBLIC_SENTRY_DSN): string | null {
  if (!dsn?.trim()) return null;
  try {
    const u = new URL(dsn.trim());
    return u.protocol === "https:" && u.username && /^\/\d+\/?$/.test(u.pathname) ? u.origin : null;
  } catch {
    return null;
  }
}

/** Where the pages' reports go: app/api/csp-report, which scrubs them and passes them to Sentry. */
export const CSP_REPORT_PATH = "/api/csp-report";

/*
 * The script and connection policy this dashboard is heading for, sent only
 * as Content-Security-Policy-Report-Only: the browser enforces nothing and
 * reports what it would have blocked (to CSP_REPORT_PATH, when Sentry is
 * on), so it can be watched for a while and then enforced. 'unsafe-inline'
 * scripts stay until Next's inline scripts carry a nonce; the host lists
 * still keep a script from loading from, or sending to, anywhere else.
 *
 * What this dashboard loads from elsewhere, all of it on demand:
 * - Google sign-in on the sign-in pages (accounts.google.com/gsi);
 * - Razorpay Checkout for plans and message credits;
 * - Meta's Embedded Signup for WhatsApp (connect.facebook.net, facebook.com);
 * - the venue search (Photon) and the venue's map (a Google Maps frame);
 * - pictures and files on the media store (media.myotherapp.in and S3),
 *   read by the designer and the poster downloads; pictures from any https
 *   host (club logos, speakers, an email's images once shown);
 * - Google Fonts in a club site's preview and in some emails (srcdoc frames
 *   inherit this policy);
 * - Sentry's ingest, when it is on.
 * Everything else -- the API, the designer's fonts, PDFs, the live streams --
 * is this origin, through the gateway.
 */
export function reportOnlyPolicy({ dev = process.env.NODE_ENV === "development", sentry = sentryOrigin() }: { dev?: boolean; sentry?: string | null } = {}): string {
  const media = "https://media.myotherapp.in https://*.amazonaws.com";
  const parts = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://accounts.google.com/gsi/client https://checkout.razorpay.com https://connect.facebook.net`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${media} https://photon.komoot.io https://accounts.google.com/gsi/ https://api.razorpay.com https://lumberjack.razorpay.com https://*.facebook.com${sentry ? ` ${sentry}` : ""}`,
    "media-src 'self' blob: data:",
    "frame-src 'self' blob: https://accounts.google.com https://api.razorpay.com https://checkout.razorpay.com https://*.facebook.com https://www.google.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://api.razorpay.com",
  ];
  if (sentry) parts.push(`report-uri ${CSP_REPORT_PATH}`);
  return parts.join("; ");
}

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), usb=(), browsing-topics=()" },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyPolicy() },
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
  transpilePackages: ["@moa/ui", "@moa/api", "@moa/auth", "@moa/app-kit", "@moa/observability", "@moa/mail-ui"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  /*
   * The image optimizer (/_next/image) is public: no session is needed to ask
   * it to fetch and resize a picture, and it runs in a small container. So
   * it fetches only from our own hosts -- the media store (pictures the API
   * stored) and the API's own static files -- over https, follows no
   * redirect, and keeps its work bounded: a few sizes, one quality, a
   * capped download and a capped disk cache. Every club picture is shown
   * `unoptimized` (it was sized at upload), so in practice it draws only
   * the brand icon from /brand.
   */
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.myotherapp.in", pathname: "/**" },
      { protocol: "https", hostname: "api.myotherapp.in", pathname: "/static/**" },
    ],
    localPatterns: [{ pathname: "/brand/**", search: "" }],
    deviceSizes: [640, 828, 1080, 1200, 1920],
    imageSizes: [32, 48, 64, 96, 128, 256],
    qualities: [75],
    formats: ["image/webp"],
    maximumRedirects: 0,
    maximumResponseBody: 10_000_000,
    minimumCacheTTL: 86_400,
    maximumDiskCacheSize: 100_000_000,
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
