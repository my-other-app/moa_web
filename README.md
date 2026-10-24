# moa_web

Monorepo for the My Other App web dashboards.

```
apps/admin        platform administration (Next.js 16, port 3001)
apps/clubs        organiser dashboard (not built yet)
packages/ui       design system — shadcn primitives + CVA variants
packages/api      types generated from the API's OpenAPI schema, typed client
packages/auth     BFF gateway + server-side session helpers
packages/observability  Sentry options and the scrubbing of what is sent
```

## Running it locally

Requires Node 20+ (developed on 25) and npm 10+.

```bash
npm install

cp apps/admin/.env.example apps/admin/.env.local   # then edit if needed
npm run dev -w @moa/admin                          # http://localhost:3001
```

`MOA_API_URL` is the only required variable. It points at the upstream API and
is read **server-side only** — the browser never sees it, and never calls the
API directly. See "How auth works" below.

### Other commands

```bash
npm run build        # build everything
npm run typecheck    # tsc across all workspaces
npm run test         # vitest
npm run lint

npm run api:generate # regenerate packages/api types from openapi.json
```

## How auth works

The browser only ever talks to this app's own origin. Requests go to
`/api/gateway/*`, a route handler that forwards them upstream.

That indirection is not decoration. The backend's auth cookie is **host-only
and `SameSite=Lax`**, so it is simply not sent on a cross-site request — a
dashboard served from any other registrable domain (every Vercel preview URL,
for instance) silently fails to authenticate. Going through the app's own
origin makes the cookie first-party everywhere, removes CORS entirely, and
leaves one chokepoint where CSRF protection can be added.

No token is ever stored in JavaScript. Enforcement is layered:

| Layer | Checks | Why it is not enough alone |
|---|---|---|
| `proxy.ts` (edge) | cookie is present | cannot verify a signature |
| `(dashboard)/layout.tsx` | real session + `user_type === "admin"` | runs per navigation, not per request |
| the API itself | every request | the only authority |

## Architecture notes

**Feature modules.** Everything under `apps/*/src/features/<name>` owns its
`schemas` / `api` / `queries` / `components` and exposes one barrel. A lint
rule blocks importing another feature's internals, so the boundary does not
erode one import at a time.

**Zod validates API responses, not just forms.** The backend's
`CustomBaseModel` declares a wildcard `@field_serializer("*")` annotated
`-> Union[str, Any]`, and Pydantic derives the serialization schema from that
annotation — so nearly every field is published as `anyOf: [string, {}]` and
generates as `unknown`. Until that annotation is fixed, the generated types
cannot be trusted for those models, and each feature validates its own
responses. The contract tests in `apps/admin/src/features/schemas.test.ts`
parse fixtures captured from production (PII scrubbed) and will fail if a
shape changes.

**Caching is explicit.** `staleTimes` in `lib/query-client.ts` sets three
tiers: volatile lists (30s), analytics (60s), reference data (10min). 4xx is
never retried — retrying a 401 only delays the sign-in redirect.

## Error tracking (Sentry)

Both apps report to Sentry through `@sentry/nextjs` (pinned to 10.76.2, as
on the public site), configured in `packages/observability`. It is **off
unless `NEXT_PUBLIC_SENTRY_DSN` is set**: with no DSN, `next.config.ts` skips
the Sentry wrapper and the runtime never calls `Sentry.init`, so nothing is
patched or sent.

Set these per Vercel project (`moa-clubs-next`, `moa-admin-next`), each with
its own Sentry project:

| Variable | When | What |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | runtime + build | The project's DSN. Empty means off. |
| `SENTRY_AUTH_TOKEN` | build only, secret | Uploads source maps. |
| `SENTRY_ORG` | build only | Sentry organisation slug. |
| `SENTRY_PROJECT` | build only | Sentry project slug. |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | optional | 0–1; defaults to `0.05`. |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | optional | Defaults to `VERCEL_ENV` (production / preview). |
| `SENTRY_RELEASE` | optional | Defaults to `moa-clubs@<commit>` / `moa-admin@<commit>`. |

Source maps are uploaded only when the token, org and project are all set,
and are deleted from the build afterwards, so they are never served.

What is sent, and what is not:

- **No personal data.** No cookies, no `Authorization` or other headers
  beyond content type, length and user agent, no request or response bodies,
  no user fields or IP, no query parameters, no stack-frame variables. Emails
  and phone numbers are masked in breadcrumbs, messages and exceptions.
- **No credentials from links.** The door key on `/gate/{id}?key=`, the
  tokens on `/kiosk?token=`, `/join?token=` and `/impersonate?token=`, and
  the token segment of `/s/{token}` and `/confirm/{token}` are filtered out
  of every URL before it leaves (`packages/observability/src/scrub.ts`).
- **No session replay**, and the browser adds no trace headers to requests.
- **Gateway:** an upstream 5xx through `/api/gateway` is reported, grouped
  by endpoint; a 4xx is the API answering the caller and is not.
- Browser errors caught by `error.tsx` / `global-error.tsx` are reported;
  server errors are reported once, where they happen (`onRequestError`).

## Deploying

Each app deploys independently. Set `MOA_API_URL` in the host's environment,
and the Sentry variables above to turn error tracking on.
Next.js handles its own routing, so no SPA rewrite rule is needed (the absence
of one is what made the previous Vite dashboard 404 on every deep link).

### Why `typecheck` depends on `build`

`tsc --noEmit` in a Next app reads `.next/types/**`, which only that app's own
`build` generates. Without the dependency, adding a route makes typecheck fail
against stale types, and running both tasks together races -- the build rewrites
the directory while tsc is reading it.
