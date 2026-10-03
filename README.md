# moa_web

Monorepo for the My Other App web dashboards.

```
apps/admin        platform administration (Next.js 16, port 3001)
apps/clubs        organiser dashboard (not built yet)
packages/ui       design system — shadcn primitives + CVA variants
packages/api      types generated from the API's OpenAPI schema, typed client
packages/auth     BFF gateway + server-side session helpers
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

## Deploying

Each app deploys independently. Set `MOA_API_URL` in the host's environment.
Next.js handles its own routing, so no SPA rewrite rule is needed (the absence
of one is what made the previous Vite dashboard 404 on every deep link).

### Why `typecheck` depends on `build`

`tsc --noEmit` in a Next app reads `.next/types/**`, which only that app's own
`build` generates. Without the dependency, adding a route makes typecheck fail
against stale types, and running both tasks together races -- the build rewrites
the directory while tsc is reading it.
