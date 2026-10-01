#!/usr/bin/env node
/**
 * Fails when the committed openapi.json no longer matches the live API.
 *
 * This is the gate that turns a breaking backend change into a red build
 * instead of a runtime 422 discovered by a user. Run in CI with MOA_API_URL
 * set; it is a no-op locally when the variable is absent so offline work and
 * PRs from forks are not blocked by an unreachable API.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const base = process.env.MOA_API_URL;
if (!base) {
  console.log("MOA_API_URL not set - skipping OpenAPI drift check.");
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const committed = JSON.parse(readFileSync(join(here, "..", "openapi.json"), "utf8"));

const res = await fetch(new URL("/openapi.json", base));
if (!res.ok) {
  console.error(`Could not fetch ${base}/openapi.json - HTTP ${res.status}`);
  process.exit(1);
}
const live = await res.json();

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

if (surface(committed) !== surface(live)) {
  console.error(
    "OpenAPI drift detected: the live API's path/method surface differs from the\n" +
      "committed openapi.json. Run `npm run api:generate` against the live API and\n" +
      "commit the result, then fix any resulting type errors."
  );
  const c = JSON.parse(surface(committed));
  const l = JSON.parse(surface(live));
  for (const p of new Set([...Object.keys(c), ...Object.keys(l)])) {
    const a = (c[p] ?? []).join(",");
    const b = (l[p] ?? []).join(",");
    if (a !== b) console.error(`  ${p}\n    committed: [${a}]\n    live:      [${b}]`);
  }
  process.exit(1);
}

console.log("OpenAPI contract matches the live API.");
