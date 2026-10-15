export interface OpeningDraftItem {
  product_id: string;
  qty: string;
  unit_credit_price: string;
}

export function prepareOpeningItems(lines: OpeningDraftItem[]): {
  items: { product_id: string; qty: number; unit_credit_price: number }[];
  total: number;
} {
  if (lines.length > 50) throw new Error("La deuda inicial admite hasta 50 productos.");

  const products = new Set<string>();
  let total = 0;
  const items = lines.map((line) => {
    const productId = line.product_id.trim();
    if (!productId) throw new Error("Selecciona un producto para cada línea de la deuda inicial.");
    if (products.has(productId)) throw new Error("Hay un producto repetido en la deuda inicial.");
    products.add(productId);

    const qty = Number(line.qty);
    if (!line.qty.trim() || !Number.isSafeInteger(qty) || qty < 1 || qty > 100_000) {
      throw new Error("La cantidad debe ser un entero entre 1 y 100000.");
    }
    const price = Number(line.unit_credit_price);
    if (!line.unit_credit_price.trim() || !Number.isSafeInteger(price) || price < 0 || price > 1_000_000_000) {
      throw new Error("El precio histórico debe ser un importe entero entre 0 y 1000000000.");
    }

    total += qty * price;
    if (!Number.isSafeInteger(total) || total > 1_000_000_000) {
      throw new Error("La deuda inicial total no puede superar 1000000000 pesos.");
    }
    return { product_id: productId, qty, unit_credit_price: price };
  });
  return { items, total };
}
