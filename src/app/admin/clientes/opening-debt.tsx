"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, Money, Notice } from "@/components/ui";
import type { AdminProduct } from "../_types";
import { prepareOpeningItems, type OpeningDraftItem } from "./opening-model";

export default function OpeningDebt({ products, value, onChange, balance, onBalanceChange }: {
  products: AdminProduct[]; value: OpeningDraftItem[]; onChange: (items: OpeningDraftItem[]) => void;
  balance: string; onBalanceChange: (value: string) => void;
}) {
  const [productId, setProductId] = useState("");
  const available = products.filter((product) => !value.some((line) => line.product_id === product.id));
  const selected = available.find((product) => product.id === productId);
  let total = 0, error = "";
  try { total = prepareOpeningItems(value).total; } catch (cause) { error = cause instanceof Error ? cause.message : "Revisa los productos de la deuda inicial."; }
  function add() {
    if (!selected || value.length >= 50) return;
    onChange([...value, { product_id: selected.id, qty: "1", unit_credit_price: String(selected.credit_price) }]);
    onBalanceChange("0"); setProductId("");
  }
  function change(index: number, changes: Partial<OpeningDraftItem>) { onChange(value.map((line, position) => position === index ? { ...line, ...changes } : line)); }

  return <section className="sc-opening-debt" aria-labelledby="opening-products-title">
    <h2 id="opening-products-title">Productos de la deuda anterior</h2>
    <p className="sc-muted">Registra lo que ya se entregó antes de usar la app. No se descuenta de bodega ni se cuenta como una venta nueva.</p>
    <div className="sc-opening-picker"><Field label="Producto de la deuda anterior"><select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Selecciona un producto o sabor</option>{available.map((product) => <option key={product.id} value={product.id}>{product.name}{product.is_active ? "" : " (desactivado)"}</option>)}</select></Field><button type="button" className="sc-button sc-button-secondary" disabled={!selected || value.length >= 50} onClick={add}><Plus size={18} aria-hidden /> Agregar producto</button></div>
    {!products.length && <p className="sc-muted">No hay productos en el catálogo. Puedes registrar solo el importe anterior.</p>}
    {value.map((line, index) => {
      const name = products.find((product) => product.id === line.product_id)?.name ?? "Producto anterior";
      const subtotal = Number(line.qty) * Number(line.unit_credit_price);
      return <div className="sc-opening-line" key={line.product_id}><div className="sc-section-header"><h3>{name}</h3><button type="button" className="sc-icon-button" onClick={() => onChange(value.filter((_, position) => position !== index))} aria-label={`Quitar ${name}`}><Trash2 size={18} aria-hidden /></button></div><div className="sc-grid"><Field label={`Cantidad de ${name}`}><input type="number" required min="1" max="100000" step="1" inputMode="numeric" value={line.qty} onChange={(event) => change(index, { qty: event.target.value })} /></Field><Field label={`Precio anterior de ${name} (COP)`}><input type="number" required min="0" max="1000000000" step="1" inputMode="numeric" value={line.unit_credit_price} onChange={(event) => change(index, { unit_credit_price: event.target.value })} /></Field></div><p className="sc-muted">Subtotal: <Money value={Number.isSafeInteger(subtotal) ? subtotal : 0} /></p></div>;
    })}
    {error && <Notice tone="error">{error}</Notice>}
    {value.length > 0 ? <><p className="sc-muted">El precio sugerido es el actual; cámbialo si el cliente quedó debiendo otro valor.</p><div className="sc-stat sc-opening-total"><small>Deuda inicial por productos</small><strong><output aria-label="Deuda inicial calculada" aria-live="polite">{error ? "Revisa los importes" : <Money value={total} />}</output></strong></div></> : <><Field label="Saldo anterior sin productos (COP)"><input type="number" required min="-1000000000" max="1000000000" step="1" inputMode="text" value={balance} onChange={(event) => onBalanceChange(event.target.value)} /></Field><p className="sc-muted">Si no conoces los productos, registra solo el importe. Usa cero si está al día o un valor negativo si tiene saldo a favor.</p></>}
  </section>;
}
