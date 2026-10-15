import { describe, expect, it } from "vitest";
import type { AdminProduct } from "@/lib/contracts";
import { groupProducts, productProfit } from "@/app/admin/inventario/product-model";

function product(id: string, overrides: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id,
    name: "Yogurt",
    category_id: null,
    category_name: null,
    variant_name: "",
    cost_price: 12000,
    credit_price: 18000,
    total_stock: 10,
    is_active: 1,
    reserved_stock: 2,
    available_stock: 8,
    ...overrides,
  };
}

describe("productProfit", () => {
  it("calculates profit as a percentage of cost", () => {
    expect(productProfit(12000, 18000)).toEqual({ unitMargin: 6000, profitPercent: 50 });
  });

  it("preserves losses and break-even values", () => {
    expect(productProfit(12000, 9000)).toEqual({ unitMargin: -3000, profitPercent: -25 });
    expect(productProfit(12000, 12000)).toEqual({ unitMargin: 0, profitPercent: 0 });
  });

  it("keeps the monetary profit when zero cost has no defined percentage", () => {
    expect(productProfit(0, 18000)).toEqual({ unitMargin: 18000, profitPercent: null });
    expect(productProfit(0, 0)).toEqual({ unitMargin: 0, profitPercent: null });
  });

  it.each([
    [Number.NaN, 18000],
    [12000, Number.NaN],
    [Number.POSITIVE_INFINITY, 18000],
    [12000, Number.NEGATIVE_INFINITY],
    [Number.MAX_VALUE, -Number.MAX_VALUE],
  ])("does not expose non-finite results for cost %s and price %s", (cost, price) => {
    expect(productProfit(cost, price)).toEqual({ unitMargin: 0, profitPercent: null });
  });

  it("omits a percentage that overflows with a tiny positive cost", () => {
    expect(productProfit(Number.MIN_VALUE, 18000)).toEqual({ unitMargin: 18000, profitPercent: null });
  });
});

describe("groupProducts", () => {
  it("combines legacy products with categories regardless of surrounding spaces and case", () => {
    const legacy = product("legacy");
    const strawberry = product("strawberry", { name: "Yogurt · Fresa", category_id: "yogurt", category_name: " yogurt ", variant_name: "Fresa" });
    const natural = product("natural", { name: "Yogurt · Natural", category_id: "yogurt", category_name: "YOGURT", variant_name: "Natural" });

    expect(groupProducts([legacy, natural, strawberry])).toEqual([
      { name: "Yogurt", products: [strawberry, natural, legacy] },
    ]);
  });

  it("orders groups in Spanish and variants naturally without changing the source array", () => {
    const ten = product("ten", { name: "Yogurt · 10 litros", category_name: "Yogurt", variant_name: "10 litros" });
    const two = product("two", { name: "Yogurt · 2 litros", category_name: "Yogurt", variant_name: "2 litros" });
    const milk = product("milk", { name: "Lácteos" });
    const water = product("water", { name: "Água" });
    const input = [ten, milk, two, water];

    expect(groupProducts(input)).toEqual([
      { name: "Água", products: [water] },
      { name: "Lácteos", products: [milk] },
      { name: "Yogurt", products: [two, ten] },
    ]);
    expect(input).toEqual([ten, milk, two, water]);
  });

  it("uses product names for empty categories and keeps stable order for equivalent variants", () => {
    const first = product("first", { name: " Queso ", category_name: " ", variant_name: "Único" });
    const second = product("second", { name: "Queso", category_name: "queso", variant_name: "unico" });

    expect(groupProducts([first, second])).toEqual([{ name: "Queso", products: [first, second] }]);
    expect(groupProducts([])).toEqual([]);
  });
});
