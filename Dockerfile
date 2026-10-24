# syntax=docker/dockerfile:1
#
# One dashboard as a self-hosted Next.js server, for the one Oracle box that
# runs everything (moa_backend: ops/server and docs/MOVE_TO_ORACLE.md):
#
#   APP=clubs  -> ghcr.io/my-other-app/moa-clubs  (club-dashboard.myotherapp.in)
#   APP=admin  -> ghcr.io/my-other-app/moa-admin  (main-portal.myotherapp.in)
#
# CI (.github/workflows/images.yml) builds both for linux/amd64 and
# linux/arm64. The Vercel deploys (deploy.yml, vercel.*.json) never read this
# file and are unchanged until the cutover.
#
# What is fixed at build time, and how it gets in:
#   - NEXT_PUBLIC_* come from a dotenv file mounted as the build secret
#     `build_env`: CI passes deploy/build/<environment>.env, so one image is
#     built per environment. They end up in the browser bundles: public by
#     design, never a secret.
#   - SENTRY_AUTH_TOKEN (source-map upload) is a real secret: mounted for the
#     build step only, never in a layer, an ARG or the image history.
# MOA_API_URL is read per request, at run time, from the server's env file
# (ops/server/env/clubs.env.example): the image works against any API.
#
# Local build:
#   docker buildx build --build-arg APP=clubs \
#     --secret id=build_env,src=deploy/build/production.env -t moa-clubs .

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
# glibc shims for the odd prebuilt binary; sharp and Next's compiler ship musl
# builds of their own (both are in package-lock.json for x64 and arm64).
# hadolint ignore=DL3018
RUN apk add --no-cache libc6-compat
# The whole workspace: npm ci needs every package.json, and the apps compile
# the packages' TypeScript sources themselves (transpilePackages).
COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

FROM deps AS build
ARG APP=clubs
# The commit, for Sentry's release name; the environment, for its default
# environment name. Neither is secret.
ARG GIT_SHA=""
ARG BUILD_ENVIRONMENT=production
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
# The dotenv file is read line by line (KEY=value, no quotes, # comments):
# nothing in it is run as shell (export "$line" exports KEY=value).
# hadolint ignore=SC2163
RUN --mount=type=secret,id=build_env \
    --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    set -eu; \
    case "$APP" in clubs|admin) ;; *) echo "APP must be clubs or admin" >&2; exit 1 ;; esac; \
    if [ -f /run/secrets/build_env ]; then \
      n=0; \
      while IFS= read -r line || [ -n "$line" ]; do \
        n=$((n + 1)); \
        case "$line" in \
          ''|'#'*) continue ;; \
          [A-Z_]*=*) export "$line" ;; \
          *) echo "build_env line $n is not KEY=value" >&2; exit 1 ;; \
        esac; \
      done < /run/secrets/build_env; \
    fi; \
    if [ -n "$GIT_SHA" ] && [ -z "${SENTRY_RELEASE:-}" ]; then export SENTRY_RELEASE="moa-$APP@$GIT_SHA"; fi; \
    export NEXT_PUBLIC_SENTRY_ENVIRONMENT="${NEXT_PUBLIC_SENTRY_ENVIRONMENT:-$BUILD_ENVIRONMENT}"; \
    npm run build --workspace "@moa/$APP"

FROM ${NODE_IMAGE} AS runner
ARG APP=clubs
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The monorepo's standalone output: apps/<app>/server.js beside a pruned
# node_modules at the root. Owned by the image's unprivileged `node` user, so
# the server can keep its image cache in .next/cache.
COPY --from=build --chown=1000:1000 /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=1000:1000 /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=1000:1000 /repo/apps/${APP}/public ./apps/${APP}/public
RUN mkdir -p "apps/${APP}/.next/cache" && chown 1000:1000 "apps/${APP}/.next/cache"
WORKDIR /app/apps/${APP}
# 1000 is the image's own unprivileged `node` user.
USER 1000:1000
EXPOSE 3000
# A static file outside the sign-in guard (proxy.ts lets images through):
# answers as soon as the server listens, asks the API nothing. Asked every
# 2 s while it starts, so a deploy sees it healthy at once.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/brand/icon.png"]
CMD ["node", "server.js"]
