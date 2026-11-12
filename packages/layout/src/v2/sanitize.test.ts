import { describe, expect, it } from "vitest";

import { checkSvg, sanitizeSvg, svgRemoved, UnsafeSvg, unescapeHtml, viewBoxOf } from "./sanitize";

describe("the SVG sanitiser", () => {
  it("writes the root canonically: xmlns, viewBox, then what it kept", () => {
    expect(sanitizeSvg('<svg width="24" height="12" class="x" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12" fill="none"><path d="M0 0h1"></path></svg>',
    );
    expect(sanitizeSvg("<SVG viewBox='0 0 1 1' preserveAspectRatio='none' style='color:red'><RECT/></SVG>")).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect></rect></svg>');
    expect(sanitizeSvg('<svg width="10.25" height="3.33333"/>')).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10.25 3.3333"></svg>');
  });

  it("keeps SVG spellings, source order, double quotes, and escapes", () => {
    const src = `<svg viewbox="0 0 4 4"><lineargradient id="g" gradientunits="userSpaceOnUse"><stop offset="0" stop-color="#FFF"/></lineargradient><text x='1' font-family="Inter">A &amp; B &lt;3 "q"</text><rect fill='url(#g)' title="a&quot;b"/></svg>`;
    expect(sanitizeSvg(src)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><linearGradient id="g" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFF"></stop></linearGradient>' +
        '<text x="1" font-family="Inter">A &amp; B &lt;3 "q"</text><rect fill="url(#g)"></rect></svg>',
    );
  });

  it("is idempotent", () => {
    const once = sanitizeSvg('<svg viewBox="0 0 2 2"><g transform="rotate(4)"><circle cx="1" cy="1" r="1" style="fill: #ff8a3d ;stroke:url(#a)"/></g></svg>');
    expect(sanitizeSvg(once)).toBe(once);
    expect(once).toContain('style="fill: #ff8a3d; stroke: url(#a)"');
  });

  it("removes scripts, handlers, outside links and styles, and says so", () => {
    const src =
      '<?xml version="1.0"?><!DOCTYPE svg><svg viewBox="0 0 1 1" onload="x()"><script>alert("<svg>")</script><style>rect{fill:red}</style>' +
      '<foreignObject><div>hi</div></foreignObject><a href="https://evil"><rect/></a>' +
      '<image href="https://evil/p.png"/><image xlink:href="data:image/png;base64,AAAA"/><use href="#ok"/>' +
      '<rect fill="url(https://evil#x)" style="fill:url(http://e);opacity:.5;--x:1" data-id="1" aria-label="r" bogus="1"/>' +
      '<path d="M0 0" onclick="y()" style="behavior: url(x.htc)"/></svg><rect/>';
    const out = sanitizeSvg(src);
    expect(out).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image></image><image href="data:image/png;base64,AAAA"></image><use href="#ok"></use>' +
        '<rect style="opacity: .5"></rect><path d="M0 0"></path></svg>',
    );
    expect(svgRemoved(src)).toEqual([
      "a processing instruction",
      "a declaration",
      "onload on <svg>",
      "<script>",
      "<style>",
      "<foreignobject>",
      "<a>",
      "href='https://evil/p.png' on <image>",
      "fill: an outside url() on <rect>",
      "style fill: an outside url()",
      "style --x",
      "bogus on <rect>",
      "onclick on <path>",
      "style on <path>",
      "<rect> after the drawing",
    ]);
  });

  it("refuses markup with no single drawing", () => {
    expect(() => sanitizeSvg("<g/>")).toThrow(new UnsafeSvg("an svg layer holds one <svg> element"));
    expect(() => sanitizeSvg("<g><svg/></g>")).toThrow("an svg layer holds exactly one <svg> element");
    expect(() => sanitizeSvg("<svg><rect/></svg>")).toThrow("the drawing has neither a viewBox nor a width and height");
    expect(() => sanitizeSvg('<svg width="10px" height="10"/>')).toThrow("the drawing has neither a viewBox nor a width and height");
    expect(checkSvg("<g/>")).toEqual({ ok: false, removed: [], error: "an svg layer holds one <svg> element" });
    expect(checkSvg('<svg viewBox="0 0 1 1"/>')).toEqual({ ok: true, removed: [], error: null });
  });

  it("closes what was left open, and reads the viewBox", () => {
    expect(sanitizeSvg('<svg viewBox="0 0 3 4"><g><rect>')).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 4"><g><rect></rect></g></svg>');
    expect(viewBoxOf(sanitizeSvg('<svg viewBox="0 0 3 4"/>'))).toEqual([0, 0, 3, 4]);
  });

  it("decodes character references as Python's html.unescape does for common ones", () => {
    expect(unescapeHtml("&amp;&lt;&#65;&#x42;&nbsp;&unknown;")).toBe("&<AB &unknown;");
  });
});
