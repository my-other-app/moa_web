import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * Every picture picker in both dashboards offers every format that gets
 * through (IMAGE_ACCEPT: JPEG, PNG, WebP and GIF, and the HEIC, AVIF, SVG,
 * BMP and TIFF that are converted), and nothing tells anyone to go and
 * re-save a picture as a JPEG. Inputs for files that are not (only)
 * pictures are listed: the WhatsApp composer (Meta's own limits), the
 * mailbox's attachments (any file) and the registrations import (CSV).
 */
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** Inputs that take something other than a picture, by file. */
const NOT_PICTURES = new Set([
  "apps/clubs/src/features/whatsapp/components/composer.tsx",
  "apps/clubs/src/features/mailbox/components/composer.tsx",
  "apps/clubs/src/features/registrations/components/import-panel.tsx",
]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = ["apps", "packages"].flatMap((top) =>
  readdirSync(join(ROOT, top))
    .map((pkg) => join(ROOT, top, pkg, "src"))
    .filter((src) => {
      try {
        return statSync(src).isDirectory();
      } catch {
        return false;
      }
    })
    .flatMap(sources),
);

/** Each file input's `accept`, as written, with its file and line. */
function fileInputs(): Array<{ file: string; line: number; accept: string }> {
  return files.flatMap((path) => {
    const code = readFileSync(path, "utf8");
    const file = relative(ROOT, path);
    return [...code.matchAll(/<(?:input|Input)\b[^>]*?type="file"[^>]*?>/gs)].map((m) => ({
      file,
      line: code.slice(0, m.index).split("\n").length,
      accept: /accept=(\{[^}]*\}|"[^"]*")/.exec(m[0])?.[1] ?? "(none)",
    }));
  });
}

describe("picture pickers", () => {
  it("are found at all (the scan is not looking in the wrong place)", () => {
    expect(fileInputs().length).toBeGreaterThan(10);
  });

  it("offer every format that gets through", () => {
    const narrow = fileInputs()
      .filter((input) => !NOT_PICTURES.has(input.file))
      .filter((input) => !/^\{(IMAGE_ACCEPT|DRAFT_FILE_ACCEPT)\}$/.test(input.accept))
      .map((input) => `${input.file}:${input.line} accept=${input.accept}`);
    expect(narrow).toEqual([]);
  });

  it("never tell anyone to re-save a picture as a JPEG, or offer only PNG, JPEG and WebP", () => {
    const said = files.flatMap((path) => {
      const code = readFileSync(path, "utf8");
      return /smaller JPEG|Use a PNG, JPEG or WebP|PNG, JPG or WebP|image\/png,image\/jpeg,image\/webp"/.test(code) ? [relative(ROOT, path)] : [];
    });
    expect(said).toEqual([]);
  });
});
