import { pyRepr, pyRound } from "./schema";

/**
 * SVG art made safe to draw: the backend's `layout_v2/sanitize.py`, step for
 * step, so the editor shows what the server will print and can say what it
 * removed before saving.
 *
 * One <svg> element is kept and, inside it, only drawing elements and
 * presentation attributes from an allow-list. Refused, and left out with
 * what they hold: <script>, <foreignObject>, <style>, <iframe>, anything
 * not on the list; every on* attribute; every href that is not "#id" or (on
 * <image>) a data:image; any url(…) that is not url(#id); javascript:
 * anywhere. The output is canonical: the root is `<svg xmlns=… viewBox=…>`
 * with its other kept attributes after and no width, height or
 * preserveAspectRatio; SVG spellings (linearGradient, viewBox); attributes
 * in source order, double-quoted; text escaped (& < >), attribute values
 * (& < > "); every element with an end tag. Sanitising twice changes nothing.
 */

export const SVG_NS = "http://www.w3.org/2000/svg";

const ELEMENT_NAMES = (
  "svg g defs symbol use title desc path rect circle ellipse line polyline polygon text tspan " +
  "linearGradient radialGradient stop pattern clipPath mask marker image filter " +
  "feGaussianBlur feOffset feBlend feColorMatrix feComposite feFlood feMerge feMergeNode " +
  "feDropShadow feMorphology feTurbulence feDisplacementMap feComponentTransfer feFuncR feFuncG " +
  "feFuncB feFuncA"
).split(" ");
const ELEMENTS = new Map(ELEMENT_NAMES.map((e) => [e.toLowerCase(), e]));

const ATTR_NAMES = (
  "id class style transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity " +
  "stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit opacity " +
  "clip-path clip-rule mask filter color display visibility paint-order vector-effect " +
  "shape-rendering text-rendering image-rendering " +
  "d x y x1 y1 x2 y2 cx cy r rx ry fx fy fr width height points pathLength " +
  "viewBox preserveAspectRatio xmlns xmlns:xlink href xlink:href " +
  "offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod " +
  "patternUnits patternContentUnits patternTransform clipPathUnits maskUnits maskContentUnits " +
  "markerWidth markerHeight markerUnits refX refY orient marker-start marker-mid marker-end " +
  "filterUnits primitiveUnits in in2 result stdDeviation dx dy mode operator k1 k2 k3 k4 values type " +
  "flood-color flood-opacity radius baseFrequency numOctaves seed stitchTiles scale " +
  "xChannelSelector yChannelSelector tableValues slope intercept amplitude exponent " +
  "font-family font-size font-weight font-style letter-spacing text-anchor dominant-baseline " +
  "alignment-baseline baseline-shift textLength lengthAdjust rotate xml:space"
).split(" ");
const ATTRS = new Map(ATTR_NAMES.map((a) => [a.toLowerCase(), a]));
/** Not on the root: the builder sets them per the layer's fit. */
const ROOT_DROPPED = new Set(["width", "height", "preserveaspectratio", "x", "y", "style", "class"]);

const URL_RE = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
const LOCAL_URL = /^#[A-Za-z_][\w.:-]*$/;
const DATA_IMAGE = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/;
const BAD = /javascript:|vbscript:|expression\s*\(|@import|behavior\s*:|-moz-binding/i;
const MAX_ELEMENTS = 5000;
const MAX_DEPTH = 64;
const TEXT_ELEMENTS = new Set(["text", "tspan", "title", "desc"]);

/** The markup is not one <svg> drawing that can be kept. */
export class UnsafeSvg extends Error {}

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => escText(s).replace(/"/g, "&quot;");
const pyStrip = (s: string) => s.replace(/^\s+|\s+$/g, "");
const words = (s: string) => s.split(/\s+/).filter(Boolean);

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  bull: "•", middot: "·", times: "×", deg: "°", laquo: "«", raquo: "»",
};

/** Character references decoded, as Python's html.unescape does for the ones SVG art uses. */
export const unescapeHtml = (s: string) =>
  s.replace(/&(#[0-9]+|#[xX][0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);?/g, (m, ref: string) => {
    if (ref[0] === "#") {
      const cp = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(cp) || cp > 0x10ffff || cp === 0 || (cp >= 0xd800 && cp <= 0xdfff)) return "�";
      return String.fromCodePoint(cp);
    }
    const v = NAMED[ref];
    return v !== undefined && (m.endsWith(";") || ["amp", "lt", "gt", "quot", "nbsp", "copy", "reg"].includes(ref)) ? v : m;
  });

/** Python's _num for a made-up viewBox: an integer as one, else repr(round(f, 4)). */
const pyNum = (v: string | undefined): string => {
  if (v === undefined) throw new TypeError("no value");
  const t = pyStrip(v);
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) throw new TypeError("not a number");
  const f = Number(t);
  return Number.isInteger(f) ? String(f) : String(pyRound(f, 4));
};

const cleanStyle = (value: string, removed: string[]) => {
  const out: string[] = [];
  for (const decl of value.split(";")) {
    if (!decl.includes(":")) continue;
    const at = decl.indexOf(":");
    const prop = pyStrip(decl.slice(0, at)).toLowerCase();
    const val = words(decl.slice(at + 1)).join(" ");
    if (!prop || !val) continue;
    if (BAD.test(val) || prop.startsWith("--")) {
      removed.push(`style ${prop}`);
      continue;
    }
    if ([...val.matchAll(URL_RE)].some((m) => !LOCAL_URL.test(pyStrip(m[2]!)))) {
      removed.push(`style ${prop}: an outside url()`);
      continue;
    }
    out.push(`${prop}: ${val}`);
  }
  return out.join("; ");
};

type Attr = [string, string | null];

/** The parser's events, as Python's html.parser.HTMLParser gives them for SVG art (names lower case, references decoded). */
export type HtmlEvent = Ev;
type Ev =
  | { t: "start"; tag: string; attrs: Attr[]; closed: boolean }
  | { t: "end"; tag: string }
  | { t: "data"; data: string }
  | { t: "comment" }
  | { t: "pi" }
  | { t: "decl" };

const ATTR_RE = /([^\s/>"'=][^\s/>=]*)(\s*=\s*('[^']*'|"[^"]*"|(?!['"])[^>\s]*))?/y;

/** @internal The parser's events for a fragment (used by the conformance normaliser). */
export const htmlEvents = (src: string): Ev[] => tokenize(src);

const tokenize = (src: string): Ev[] => {
  const out: Ev[] = [];
  let i = 0;
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "data", data: unescapeHtml(text) });
    text = "";
  };
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      text += src.slice(i);
      break;
    }
    text += src.slice(i, lt);
    i = lt;
    if (src.startsWith("<!--", i)) {
      flush();
      const end = src.indexOf("-->", i + 4);
      out.push({ t: "comment" });
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<![", i)) {
      flush();
      const end = src.indexOf("]]>", i + 3);
      out.push({ t: "decl" });
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<!", i)) {
      flush();
      const end = src.indexOf(">", i + 2);
      out.push({ t: "decl" });
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (src.startsWith("<?", i)) {
      flush();
      const end = src.indexOf(">", i + 2);
      out.push({ t: "pi" });
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    const endTag = /^<\/([A-Za-z][^\s/>]*)[^>]*>/.exec(src.slice(i));
    if (endTag) {
      flush();
      out.push({ t: "end", tag: endTag[1]!.toLowerCase() });
      i += endTag[0].length;
      continue;
    }
    const startName = /^<([A-Za-z][^\s/>]*)/.exec(src.slice(i));
    if (!startName) {
      text += "<";
      i += 1;
      continue;
    }
    flush();
    const tag = startName[1]!.toLowerCase();
    let j = i + startName[0].length;
    const attrs: Attr[] = [];
    for (;;) {
      while (j < src.length && /\s/.test(src[j]!)) j++;
      if (j >= src.length || src[j] === ">" || src.startsWith("/>", j)) break;
      if (src[j] === "/") {
        j++;
        continue;
      }
      ATTR_RE.lastIndex = j;
      const m = ATTR_RE.exec(src);
      if (!m || m[0].length === 0) {
        j++;
        continue;
      }
      let value: string | null = null;
      if (m[3] !== undefined) {
        const raw = m[3];
        value = unescapeHtml(raw.startsWith("'") || raw.startsWith('"') ? raw.slice(1, -1) : raw);
      }
      attrs.push([m[1]!.toLowerCase(), value]);
      j += m[0].length;
    }
    const closed = src.startsWith("/>", j);
    i = j >= src.length ? src.length : j + (closed ? 2 : 1);
    out.push({ t: "start", tag, attrs, closed });
    if (!closed && (tag === "script" || tag === "style")) {
      const re = new RegExp(`</${tag}\\s*>`, "i");
      const rest = src.slice(i);
      const m = re.exec(rest);
      const raw = m ? rest.slice(0, m.index) : rest;
      if (raw) out.push({ t: "data", data: raw });
      i += raw.length;
    }
  }
  flush();
  return out;
};

const run = (markup: string): { markup: string; removed: string[] } => {
  if (typeof markup !== "string" || !markup.toLowerCase().includes("<svg")) throw new UnsafeSvg("an svg layer holds one <svg> element");
  const out: string[] = [];
  const stack: (string | null)[] = [];
  const removed: string[] = [];
  let skip = 0;
  let roots = 0;
  let count = 0;
  let done = false;

  const attrsOf = (element: string, attrs: Attr[], root: boolean) => {
    const seen = new Map<string, string>();
    for (const [k, raw] of attrs) {
      const key = k.toLowerCase();
      let v = raw ?? "";
      if (key.startsWith("on")) {
        removed.push(`${k} on <${element}>`);
        continue;
      }
      let name = ATTRS.get(key);
      if (name === undefined) {
        if (!key.startsWith("data-") && !key.startsWith("aria-")) removed.push(`${k} on <${element}>`);
        continue;
      }
      if (root && ROOT_DROPPED.has(key)) {
        if ((key === "width" || key === "height") && !seen.has(`__${key}`)) seen.set(`__${key}`, v);
        continue;
      }
      if (key === "xmlns" || key === "xmlns:xlink") continue;
      if (BAD.test(v)) {
        removed.push(`${k} on <${element}>`);
        continue;
      }
      if (key === "href" || key === "xlink:href") {
        const ok = LOCAL_URL.test(pyStrip(v)) || (element === "image" && DATA_IMAGE.test(pyStrip(v)));
        if (!ok) {
          removed.push(`${k}=${pyRepr([...v].slice(0, 40).join(""))} on <${element}>`);
          continue;
        }
        name = "href";
        v = pyStrip(v);
      } else if (key === "style") {
        v = cleanStyle(v, removed);
        if (!v) continue;
      } else if (v.toLowerCase().includes("url(")) {
        if ([...v.matchAll(URL_RE)].some((m) => !LOCAL_URL.test(pyStrip(m[2]!)))) {
          removed.push(`${k}: an outside url() on <${element}>`);
          continue;
        }
      }
      seen.set(name, v);
    }
    let entries: [string, string][];
    if (root) {
      if (!seen.has("viewBox")) {
        let vb: string;
        try {
          vb = `0 0 ${pyNum(seen.get("__width"))} ${pyNum(seen.get("__height"))}`;
        } catch {
          throw new UnsafeSvg("the drawing has neither a viewBox nor a width and height");
        }
        const rest = [...seen.entries()];
        seen.clear();
        seen.set("viewBox", vb);
        for (const [a, b] of rest) seen.set(a, b);
      }
      seen.delete("__width");
      seen.delete("__height");
      const viewBox = seen.get("viewBox")!;
      seen.delete("viewBox");
      entries = [["xmlns", SVG_NS], ["viewBox", viewBox], ...seen.entries()];
    } else {
      seen.delete("__width");
      seen.delete("__height");
      entries = [...seen.entries()];
    }
    return entries.map(([a, b]) => ` ${a}="${escAttr(b)}"`).join("");
  };

  const start = (tag: string, attrs: Attr[], closed: boolean) => {
    if (done) {
      removed.push(`<${tag}> after the drawing`);
      if (!closed) {
        stack.push(null);
        skip += 1;
      }
      return;
    }
    if (skip) {
      if (!closed) {
        stack.push(null);
        skip += 1;
      }
      return;
    }
    const name = ELEMENTS.get(tag);
    if (name === undefined || (!stack.length && name !== "svg")) {
      removed.push(`<${tag}>`);
      if (!closed) {
        stack.push(null);
        skip = 1;
      }
      return;
    }
    if (stack.length >= MAX_DEPTH) throw new UnsafeSvg("the drawing is nested too deeply");
    count += 1;
    if (count > MAX_ELEMENTS) throw new UnsafeSvg(`more than ${MAX_ELEMENTS} elements`);
    const root = !stack.length;
    if (root) roots += 1;
    const kept = attrsOf(name, attrs, root);
    out.push(`<${name}${kept}>`);
    if (closed) {
      out.push(`</${name}>`);
      if (root) done = true;
    } else stack.push(name);
  };

  for (const ev of tokenize(markup)) {
    switch (ev.t) {
      case "start":
        start(ev.tag, ev.attrs, ev.closed);
        break;
      case "end": {
        if (!stack.length) break;
        const name = stack.pop()!;
        if (name === null) {
          skip = Math.max(0, skip - 1);
          break;
        }
        out.push(`</${name}>`);
        if (!stack.length) done = true;
        break;
      }
      case "data":
        if (skip || !stack.length || done) break;
        if (TEXT_ELEMENTS.has(stack[stack.length - 1]!)) out.push(escText(ev.data));
        else if (pyStrip(ev.data)) out.push(escText(ev.data));
        break;
      case "comment":
        break;
      case "pi":
        removed.push("a processing instruction");
        break;
      case "decl":
        removed.push("a declaration");
        break;
    }
  }
  while (stack.length) {
    const name = stack.pop();
    if (name) out.push(`</${name}>`);
  }
  if (roots !== 1) throw new UnsafeSvg("an svg layer holds exactly one <svg> element");
  return { markup: out.join(""), removed };
};

const cache = new Map<string, { markup: string; removed: string[] } | UnsafeSvg>();
const cached = (markup: string) => {
  let r = cache.get(markup);
  if (!r) {
    try {
      r = run(markup);
    } catch (e) {
      if (!(e instanceof UnsafeSvg)) throw e;
      r = e;
    }
    if (cache.size > 1024) cache.clear();
    cache.set(markup, r);
  }
  if (r instanceof UnsafeSvg) throw r;
  return r;
};

/** The markup made safe and canonical; throws UnsafeSvg when there is no single <svg> drawing to keep. */
export const sanitizeSvg = (markup: string): string => cached(markup).markup;

/** What sanitising removed (empty when the markup was already safe). Throws UnsafeSvg as sanitizeSvg does. */
export const svgRemoved = (markup: string): string[] => [...cached(markup).removed];

/**
 * The editor's check before saving: `{ok, removed, error}`: an error (no
 * single <svg>) refuses the layer; anything removed is a warning, and the
 * drawing prints without it.
 */
export const checkSvg = (markup: string): { ok: boolean; removed: string[]; error: string | null } => {
  try {
    return { ok: true, removed: svgRemoved(markup), error: null };
  } catch (e) {
    return { ok: false, removed: [], error: (e as Error).message };
  }
};

/** The viewBox of sanitised markup, or null. */
export const viewBoxOf = (markup: string): [number, number, number, number] | null => {
  const m = /<svg[^>]*\sviewBox="([^"]+)"/.exec(markup);
  if (!m) return null;
  const nums = [...m[1]!.matchAll(/-?\d*\.?\d+(?:e-?\d+)?/gi)].map((x) => Number(x[0]));
  return nums.length === 4 ? (nums as [number, number, number, number]) : null;
};
