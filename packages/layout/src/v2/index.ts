/**
 * Layout v2: editable designs as layers on a fixed canvas
 * (feature-register/layout-v2-contract.md). The TypeScript twin of the
 * backend's `app/core/layout_v2`: the same schema, the same validation codes
 * and messages, and the same HTML builder, held together by the shared
 * conformance fixtures in `__fixtures__/`.
 */
export * from "./schema";
export * from "./fonts";
export * from "./tokens";
export * from "./css";
export * from "./sanitize";
export * from "./qr";
export * from "./fit";
export * from "./build";
export * from "./validate";
export * from "./from-v1";
export * from "./geometry";
