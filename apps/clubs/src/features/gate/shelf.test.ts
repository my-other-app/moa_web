import { describe, expect, it } from "vitest";

import { picksToStore, picksTotal } from "./components/shelf-picker";

const catalog = { enabled: true, items: [{ id: "tee", name: "Tee", price: 450, left: null, variants: [{ id: "m", label: "M", left: 3 }] }, { id: "kit", name: "Kit", price: 890, left: 1, variants: [] }] };

describe("the shelf at the desk", () => {
  it("sends only complete picks, and totals what the desk takes", () => {
    expect(picksToStore(catalog, { tee: { qty: 2, variant_id: null }, kit: { qty: 1, variant_id: null } })).toEqual([{ item_id: "kit", variant_id: null, qty: 1 }]);
    expect(picksToStore(catalog, { tee: { qty: 1, variant_id: "m" } })).toEqual([{ item_id: "tee", variant_id: "m", qty: 1 }]);
    expect(picksTotal(catalog, { tee: { qty: 1, variant_id: "m" }, kit: { qty: 1, variant_id: null } })).toBe(1340);
    expect(picksToStore(undefined, { kit: { qty: 1, variant_id: null } })).toEqual([]);
  });
});
