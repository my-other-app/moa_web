import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { badgeStarter } from "../starters";
import { buildBody } from "./build";
import { fromV1 } from "./from-v1";
import { type DocKind, dumpLayoutV2, LayoutV2 } from "./schema";
import { samplesV2 } from "./tokens";
import { validate } from "./validate";

/**
 * The backend's v2 starters (the 35 designs, card_cr80 and the blanks), read
 * here as the editor will read them: each parses, validates without an
 * error for its kind, and builds; card_cr80 is our fromV1 of the v1 card.
 * Run with LAYOUT_V2_STARTERS pointing at moa_backend's
 * backend/app/core/layout_v2/starters; skipped otherwise (they are the
 * backend's, served by the API), as badge-parity.test.ts does.
 */
const ROOT = process.env.LAYOUT_V2_STARTERS;
const KINDS: DocKind[] = ["ticket", "certificate", "badge"];
const starters = ROOT && existsSync(ROOT)
  ? KINDS.flatMap((kind) => readdirSync(join(ROOT, kind)).filter((f) => f.endsWith(".json")).map((f) => ({ kind, file: f, raw: JSON.parse(readFileSync(join(ROOT, kind, f), "utf8")) as unknown })))
  : [];

describe.skipIf(!starters.length)("the backend's v2 starters", () => {
  it.each(starters.map((s) => [`${s.kind}/${s.file}`, s] as const))("%s parses, validates and builds", (_name, s) => {
    const parsed = LayoutV2.safeParse(s.raw);
    expect(parsed.success ? [] : parsed.error.issues.slice(0, 3)).toEqual([]);
    expect(validate(s.raw, s.kind).filter((p) => p.level === "error")).toEqual([]);
    const body = buildBody(parsed.data as LayoutV2, samplesV2(s.kind), { qr: "MOA-7K3QF-X9PLM" }, { kind: s.kind });
    expect(body.startsWith('<div class="moa-doc"')).toBe(true);
  });

  it("card_cr80 is fromV1 of the v1 card", () => {
    const file = starters.find((s) => s.kind === "badge" && s.file === "card_cr80.json");
    expect(file).toBeDefined();
    const theirs = dumpLayoutV2(LayoutV2.parse(file!.raw) as LayoutV2);
    delete theirs.starter;
    expect(dumpLayoutV2(fromV1(badgeStarter("card_cr80", { seats: false })))).toEqual(theirs);
  });
});
