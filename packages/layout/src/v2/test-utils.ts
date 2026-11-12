import { htmlEvents } from "./sanitize";

/** Layouts for the tests, as few fields as the schema needs. Not exported from the package. */

export const minimal = (layers: unknown[] = [], more: Record<string, unknown> = {}) => ({
  version: 2,
  page: { widthMm: 101.6, heightMm: 152.4 },
  canvas: { width: 384, height: 576 },
  layers,
  ...more,
});

export const textRaw = (more: Record<string, unknown> = {}) => ({
  kind: "text",
  id: "t1",
  name: "Name",
  x: 10,
  y: 20,
  width: 200,
  height: 40,
  text: "{{attendee_name}}",
  font: { family: "Inter" },
  size: 32,
  ...more,
});

// ─── The conformance normaliser (backend tests/layout_v2_cases.py) ──────────


const VOID = new Set(["img", "br", "hr", "meta", "link", "input", "source", "area", "col", "embed", "track", "wbr"]);

const splitStyle = (value: string) => {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === ";" && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  const decls: string[] = [];
  for (const d of out) {
    if (!d.includes(":")) continue;
    const at = d.indexOf(":");
    const prop = d.slice(0, at).trim().toLowerCase();
    const val = d.slice(at + 1).split(/\s+/).filter(Boolean).join(" ");
    if (prop && val) decls.push(`${prop}:${val}`);
  }
  return decls;
};

const escN = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * The HTML as both builders are compared: attributes sorted by name, style
 * declarations trimmed and whitespace-collapsed (in their order),
 * whitespace-only text dropped, text and values decoded then escaped alike,
 * void elements without an end tag, and a QR's <svg> (inside div.moa-qr) as
 * <svg data-qr></svg>. The backend's `normalise`, line for line.
 */
export const normalise = (fragment: string): string => {
  const out: string[] = [];
  const stack: string[] = [];
  let skip = 0;
  const start = (tag: string, attrs: [string, string | null][]) => {
    if (skip) {
      if (!VOID.has(tag)) skip += 1;
      return;
    }
    if (tag === "svg" && stack.length && stack[stack.length - 1] === "div.moa-qr") {
      out.push("<svg data-qr></svg>");
      skip = 1;
      return;
    }
    const parts = [...attrs]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([k, raw]) => {
        let v = raw ?? "";
        if (k === "style") v = splitStyle(v).join(";");
        return v !== "" || k !== "data-qr" ? `${k}="${escN(v)}"` : k;
      });
    out.push(`<${tag}${parts.map((p) => ` ${p}`).join("")}>`);
    if (!VOID.has(tag)) {
      const cls = (attrs.find(([k]) => k === "class")?.[1] ?? "").split(/\s+/);
      stack.push(tag === "div" && cls.includes("moa-qr") ? "div.moa-qr" : tag);
    }
  };
  const end = (tag: string) => {
    if (skip) {
      skip -= 1;
      return;
    }
    if (VOID.has(tag)) return;
    stack.pop();
    out.push(`</${tag}>`);
  };
  for (const ev of htmlEvents(fragment)) {
    if (ev.t === "start") {
      if (ev.closed) {
        if (skip) continue;
        start(ev.tag, ev.attrs);
        if (!VOID.has(ev.tag)) end(ev.tag);
      } else start(ev.tag, ev.attrs);
    } else if (ev.t === "end") end(ev.tag);
    else if (ev.t === "data") {
      if (skip || !ev.data.trim()) continue;
      out.push(escN(ev.data));
    }
  }
  return out.join("");
};
