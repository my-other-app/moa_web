/**
 * A ticket or certificate as a canvas, layers and a page.
 *
 * The TypeScript half of `app/core/layout` in the backend: the same model,
 * the same token language, the same text layout and the same starters, so a
 * design the editor saves is the design the renderer draws, and a line that
 * wraps on screen wraps on paper. Kept in step by the case tables in
 * `layout.test.ts` here and `tests/test_layout_*.py` there.
 */
export * from "./fonts";
export * from "./ticket-layout";
export * from "./ticket-tokens";
export * from "./engine";
export * from "./starters";
