import type { AdminProduct } from "@/lib/contracts";

const catalogOrder = new Intl.Collator("es", { sensitivity: "base", numeric: true });

export function productProfit(cost: number, price: number): { unitMargin: number; profitPercent: number | null } {
  const unitMargin = price - cost;
  if (!Number.isFinite(cost) || !Number.isFinite(price) || !Number.isFinite(unitMargin)) {
    return { unitMargin: 0, profitPercent: null };
  }

  const percentage = cost > 0 ? (unitMargin / cost) * 100 : null;
  return { unitMargin, profitPercent: percentage !== null && Number.isFinite(percentage) ? percentage : null };
}

export function groupProducts(products: AdminProduct[]): { name: string; products: AdminProduct[] }[] {
  const groups = new Map<string, { name: string; products: AdminProduct[] }>();
  for (const product of products) {
    const name = product.category_name?.trim() || product.name.trim();
    const key = name.normalize("NFC").toLocaleLowerCase("es");
    const group = groups.get(key);
    if (group) group.products.push(product);
    else groups.set(key, { name, products: [product] });
  }

  return [...groups.values()]
    .sort((a, b) => catalogOrder.compare(a.name, b.name))
    .map((group) => ({
      ...group,
      products: group.products.sort((a, b) => catalogOrder.compare(a.variant_name?.trim() || a.name.trim(), b.variant_name?.trim() || b.name.trim())),
    }));
}
