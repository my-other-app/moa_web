import { cspReportHandler, sentrySecurityUrl } from "@moa/observability";

/**
 * Where this app's pages send what the report-only script policy would
 * have blocked (next.config.ts names it only when Sentry is on). Each report
 * is scrubbed of addresses' queries and credentials and passed to Sentry's
 * security endpoint; the answer is always 204. The proxy lets it through
 * without a session check, so a report never touches the session.
 */
export async function POST(request: Request): Promise<Response> {
  const endpoint = sentrySecurityUrl(process.env.NEXT_PUBLIC_SENTRY_DSN, {
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  });
  return cspReportHandler({ endpoint })(request);
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
