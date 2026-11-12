/**
 * Long text fits its layer (contract V6), as the page's fit script does it:
 * a `[data-fit="shrink"]` text shrinks 1 px at a time down to `data-min`
 * while it runs past `data-lines` lines or out of its box, then is clamped
 * to the lines that fit with an ellipsis; `ellipsis` is the clamp alone;
 * `none` is left as it falls. Nothing else clips the glyphs. What is fitted
 * gets `data-fitted`.
 *
 * `fitDoc` is for the editor's stage: call it on the stage's `.moa-doc`
 * once its fonts have loaded (document.fonts.ready). FIT_SCRIPT is what the
 * page carries for the same steps, then window.__moaReady for the render
 * service; it is replaced by the backend's doc_designs/fit.js once that
 * gains these modes, so the browser preview runs exactly the server's.
 */

/** The base styles every page carries (app/core/doc_designs/base.css). */
export const BASE_CSS =
  '.moa-page{position:relative;overflow:hidden;break-after:page;page-break-after:always}.moa-page:last-of-type{break-after:auto;page-break-after:auto}[data-fit="name"],[data-fit="code"],[data-fit="line"]{white-space:nowrap}';

const lineCount = (el: HTMLElement, lh: number) => {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  const tops = Array.from(range.getClientRects())
    .filter((r) => r.height > 0)
    .map((r) => r.top)
    .sort((a, b) => a - b);
  let count = 0;
  let last = -Infinity;
  for (const t of tops) {
    if (t - last > lh * 0.5) {
      count += 1;
      last = t;
    }
  }
  return count;
};

const fitOne = (el: HTMLElement) => {
  const mode = el.getAttribute("data-fit");
  if (mode !== "shrink" && mode !== "ellipsis") return;
  const box = el.parentElement;
  const view = el.ownerDocument.defaultView;
  if (!box || !view) return;
  const bs = view.getComputedStyle(box);
  const room = () => box.clientHeight - (parseFloat(bs.paddingTop) || 0) - (parseFloat(bs.paddingBottom) || 0);
  const maxLines = parseInt(el.getAttribute("data-lines") ?? "1", 10) || 1;
  const lh = () => {
    const cs = view.getComputedStyle(el);
    return parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 0) * 1.2;
  };
  const fits = () => el.scrollWidth <= el.clientWidth + 1 && el.offsetHeight <= room() + 1 && lineCount(el, lh()) <= maxLines;
  if (fits()) return;
  if (mode === "shrink") {
    let size = parseFloat(view.getComputedStyle(el).fontSize) || 0;
    const min = parseFloat(el.getAttribute("data-min") ?? "") || 1;
    while (!fits() && size > min) {
      size = Math.max(min, size - 1);
      el.style.fontSize = `${size}px`;
    }
    if (fits()) {
      el.setAttribute("data-fitted", "shrink");
      return;
    }
  }
  const lines = Math.max(1, Math.min(maxLines, Math.floor((room() + 0.5) / lh())));
  el.style.display = "-webkit-box";
  el.style.setProperty("-webkit-box-orient", "vertical");
  el.style.setProperty("-webkit-line-clamp", String(lines));
  el.style.overflow = "hidden";
  el.setAttribute("data-fitted", "ellipsis");
};

/** Fit every text under `root` (a `.moa-doc`, or the stage holding one). */
export const fitDoc = (root: ParentNode) => {
  root.querySelectorAll<HTMLElement>("[data-fit]").forEach(fitOne);
};

/** The page's fit script: fitDoc's steps after images and fonts load, then window.__moaReady. Inline in every built page. */
export const FIT_SCRIPT = `(function () {
  "use strict";
  function lineCount(el, lh) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var tops = Array.prototype.map.call(range.getClientRects(), function (r) { return r.height > 0 ? r.top : null; })
      .filter(function (t) { return t !== null; }).sort(function (a, b) { return a - b; });
    var count = 0, last = -Infinity;
    tops.forEach(function (t) { if (t - last > lh * 0.5) { count += 1; last = t; } });
    return count;
  }
  function fitOne(el) {
    var mode = el.getAttribute("data-fit");
    if (mode !== "shrink" && mode !== "ellipsis") { return; }
    var box = el.parentElement;
    if (!box) { return; }
    var bs = getComputedStyle(box);
    function room() { return box.clientHeight - (parseFloat(bs.paddingTop) || 0) - (parseFloat(bs.paddingBottom) || 0); }
    var maxLines = parseInt(el.getAttribute("data-lines") || "1", 10) || 1;
    function lh() { var cs = getComputedStyle(el); return parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 0) * 1.2; }
    function fits() { return el.scrollWidth <= el.clientWidth + 1 && el.offsetHeight <= room() + 1 && lineCount(el, lh()) <= maxLines; }
    if (fits()) { return; }
    if (mode === "shrink") {
      var size = parseFloat(getComputedStyle(el).fontSize) || 0;
      var min = parseFloat(el.getAttribute("data-min")) || 1;
      while (!fits() && size > min) { size = Math.max(min, size - 1); el.style.fontSize = size + "px"; }
      if (fits()) { el.setAttribute("data-fitted", "shrink"); return; }
    }
    var lines = Math.max(1, Math.min(maxLines, Math.floor((room() + 0.5) / lh())));
    el.style.display = "-webkit-box";
    el.style.setProperty("-webkit-box-orient", "vertical");
    el.style.setProperty("-webkit-line-clamp", String(lines));
    el.style.overflow = "hidden";
    el.setAttribute("data-fitted", "ellipsis");
  }
  function done() { window.__moaReady = true; document.documentElement.setAttribute("data-moa-ready", ""); }
  function run() {
    void document.documentElement.offsetWidth;
    var images = Array.prototype.map.call(document.images, function (img) { return img.decode ? img.decode().catch(function () {}) : null; });
    Promise.all(images).then(function () { return document.fonts.ready; }).then(function () {
      Array.prototype.forEach.call(document.querySelectorAll("[data-fit]"), fitOne);
      return document.fonts.ready;
    }).then(function () {
      var failed = [];
      document.fonts.forEach(function (f) { if (f.status === "error") { failed.push(f.family + " " + f.weight); } });
      done();
      if (failed.length) { setTimeout(function () { throw new Error("moa: fonts failed to load: " + failed.join(", ")); }); }
    }, done);
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", run); } else { run(); }
})();`;
