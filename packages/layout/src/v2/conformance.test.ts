import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildBody } from "./build";
import { BASE_CSS, FIT_SCRIPT } from "./fit";
import { type DocKind, parseLayoutV2 } from "./schema";
import { normalise } from "./test-utils";

/**
 * The conformance fixtures: the backend's builder output for small layouts
 * that between them use every layer kind and option (backend
 * tests/layout_v2_cases.py, written to tests/fixtures/layout_v2/ and copied
 * here). Ours must be the same after the shared normaliser.
 */

const DIR = fileURLToPath(new URL("./__fixtures__/", import.meta.url));

interface Case {
  name?: string;
  about?: string;
  kind?: DocKind;
  layout: unknown;
  values?: Record<string, string>;
  context?: Record<string, unknown>;
  skipPreprinted?: boolean;
  skip_preprinted?: boolean;
  html?: string;
  body?: string;
  normalised?: string;
  expected?: string;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const cases = files.map((f) => ({ file: f, c: JSON.parse(readFileSync(join(DIR, f), "utf8")) as Case }));

describe("the page's runtime", () => {
  it("is the backend's fit script and base styles, verbatim (__fixtures__/runtime/ is copied from app/core/doc_designs/)", () => {
    expect(FIT_SCRIPT).toBe(readFileSync(join(DIR, "runtime/fit.js"), "utf8").replace(/\n$/, ""));
    expect(BASE_CSS).toBe(readFileSync(join(DIR, "runtime/base.css"), "utf8").replace(/\n$/, ""));
  });
});

describe("the conformance fixtures", () => {
  it("are here", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map(({ file, c }) => [c.name ?? file.replace(/\.json$/, ""), c] as const))("%s", (_name, c) => {
    const expected = c.normalised ?? c.html ?? c.body ?? c.expected;
    expect(typeof expected).toBe("string");
    const layout = parseLayoutV2(c.layout);
    const body = buildBody(layout, c.values ?? {}, c.context ?? {}, { kind: c.kind ?? "ticket", skipPreprinted: c.skipPreprinted ?? c.skip_preprinted ?? false });
    expect(normalise(body)).toBe(normalise(expected!));
  });
});
