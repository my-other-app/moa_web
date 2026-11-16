#!/usr/bin/env node
/**
 * Fails when the committed openapi.json no longer matches the backend's.
 *
 * The backend's document comes from one of two places:
 * - MOA_OPENAPI_FILE: a file on disk. CI builds it from the backend's source
 *   (scripts/dump-backend-openapi.py) on the backend's master branch. A
 *   relative path is read from the folder the command was started in.
 * - MOA_API_URL: a running API's /openapi.json, for a local or staging
 *   backend that serves its docs. Production does not.
 *
 * With neither set it is a no-op, so offline work is not blocked.
 *
 * Only the path/method surface is compared, so a red result means an endpoint
 * was added, removed or gained/lost a method, and the dashboards' copy is
 * behind the backend.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const file = process.env.MOA_OPENAPI_FILE;
const base = process.env.MOA_API_URL;
if (!file && !base) {
  console.log("Neither MOA_OPENAPI_FILE nor MOA_API_URL is set - skipping OpenAPI drift check.");
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const committed = JSON.parse(readFileSync(join(here, "..", "openapi.json"), "utf8"));

let backend;
let source;
if (file) {
  // npm runs workspace scripts inside the package's folder; INIT_CWD is the
  // folder the command was typed in, which is what a relative path means.
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
  source = path;
  try {
    backend = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`Could not read ${path}: ${err.message}`);
    process.exit(1);
  }
} else {
  const url = new URL("/openapi.json", base);
  source = url.href;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Could not fetch ${url.href} - HTTP ${res.status}`);
    process.exit(1);
  }
  backend = await res.json();
}

// Compare the contract surface only. The `info.version` field and key ordering
// churn without changing what clients may call, and failing on those would
// train people to ignore this check.
const surface = (doc) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(doc.paths ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, ops]) => [
          path,
          Object.keys(ops)
            .filter((m) => ["get", "post", "put", "patch", "delete"].includes(m))
            .sort(),
        ])
    )
  );

if (surface(committed) !== surface(backend)) {
  const c = JSON.parse(surface(committed));
  const b = JSON.parse(surface(backend));
  const changed = [...new Set([...Object.keys(c), ...Object.keys(b)])]
    .sort((x, y) => x.localeCompare(y))
    .filter((p) => (c[p] ?? []).join(",") !== (b[p] ?? []).join(","));
  console.error(
    `OpenAPI drift: ${changed.length} path(s) differ between the committed\n` +
      `packages/api/openapi.json and the backend (${source}).\n` +
      "To refresh: from the backend's backend/ folder run\n" +
      "  python <moa_web>/packages/api/scripts/dump-backend-openapi.py <moa_web>/packages/api/openapi.json\n" +
      "then `npm run api:generate`, fix any type errors and commit both files."
  );
  for (const p of changed) {
    console.error(
      `  ${p}\n    committed: [${(c[p] ?? []).join(",")}]\n    backend:   [${(b[p] ?? []).join(",")}]`
    );
  }
  process.exit(1);
}

console.log(`OpenAPI contract matches the backend (${source}).`);
