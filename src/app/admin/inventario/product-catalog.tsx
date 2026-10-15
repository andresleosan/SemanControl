"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { Badge, Field, Money, Notice, SubmitButton } from "@/components/ui";
import type { AdminProduct } from "../_types";
import { MutationNotice, useMutation } from "../_components";
import { groupProducts, productProfit } from "./product-model";

const blank = { id: "", main: "", variant: "", cost: "0", price: "0", units: "0", active: true };
const percentage = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
function ProfitPercent({ value }: { value: number | null }) {
  return <>{value === null ? "Sin costo base" : `${percentage.format(value)} %`}</>;
}

export default function ProductCatalog({ products, loading, refresh }: { products: AdminProduct[]; loading: boolean; refresh: () => void }) {
  const [form, setForm] = useState(blank);
  const [search, setSearch] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);
  const mainInput = useRef<HTMLInputElement>(null), variantInput = useRef<HTMLInputElement>(null);
  const focusVariant = useRef(false);
  const mutation = useMutation();
  const correction = useMutation();
  const locked = loading || mutation.busy || mutation.uncertain || correction.busy || correction.uncertain;
  const groups = groupProducts(products);
  const selected = products.find((item) => item.id === form.id);
  const profit = productProfit(Number(form.cost), Number(form.price));
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").trim();
  const query = normalize(search);
  const visible = groups.map((group) => ({ ...group, products: group.products.filter((item) => normalize(`${group.name} ${item.name}`).includes(query)) })).filter((group) => group.products.length);
  useEffect(() => {
    if (!focusRequest) return;
    const input = focusVariant.current ? variantInput.current : mainInput.current;
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }, [focusRequest]);

  function create(main = "") {
    setForm({ ...blank, main }); mutation.clear(); correction.clear(); focusVariant.current = !!main; setFocusRequest((value) => value + 1);
  }
  function edit(item: AdminProduct) {
    setForm({ id: item.id, main: item.category_name || item.name, variant: item.category_name ? item.variant_name : "", cost: String(item.cost_price), price: String(item.credit_price), units: "0", active: !!item.is_active });
    mutation.clear(); correction.clear(); focusVariant.current = !!item.category_name; setFocusRequest((value) => value + 1);
  }
  async function saveProduct() {
    const variant = form.variant.trim();
    const result = await mutation.run("/api/admin/productos", {
      ...(form.id ? { id: form.id } : {}), name: variant || form.main.trim(), category_name: variant ? form.main.trim() : null,
      cost_price: Number(form.cost), credit_price: Number(form.price), stock_qty: Number(form.units), is_active: form.active ? 1 : 0,
    }, form.id ? "Producto guardado." : "Producto creado.", true);
    if (result) { setForm(blank); refresh(); }
  }
  function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void saveProduct(); }

  return <>
    <section className="sc-panel" aria-labelledby="product-catalog-title">
      <div className="sc-section-header"><div><h2 id="product-catalog-title">Productos y variantes</h2><p className="sc-muted">Un producto principal, con sus sabores, precios y existencias separados.</p></div><button type="button" className="sc-button sc-button-secondary" disabled={locked} onClick={() => create()}><Plus size={18} aria-hidden /> Nuevo producto</button></div>
      <Field label="Buscar producto o sabor"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Yogurt, fresa, mora…" /></Field>
      <p className="sc-muted">Ganancia sobre costo = (precio fiado − costo) ÷ costo × 100. Las ventas anteriores conservan su costo y nombre originales.</p>
    </section>
    {!products.length && <Notice>Crea el primer producto y registra sus unidades en el mismo formulario.</Notice>}
    {products.length > 0 && !visible.length && <Notice>No hay productos o sabores que coincidan con la búsqueda.</Notice>}
    {visible.map((group, index) => <section key={group.name} className="sc-panel sc-product-group" aria-labelledby={`product-group-${index}`}>
      <div className="sc-section-header"><div><h2 id={`product-group-${index}`}>{group.name}</h2><p className="sc-muted">{group.products.length} {group.products.length === 1 ? "presentación" : "presentaciones"}</p></div><button type="button" className="sc-button sc-button-secondary" disabled={locked} onClick={() => create(group.name)}><Plus size={18} aria-hidden /> Agregar variante</button></div>
      <div className="sc-table-wrap"><table className="sc-table sc-table-responsive"><thead><tr><th scope="col">Variante</th><th scope="col">Costo</th><th scope="col">Precio fiado</th><th scope="col">Ganancia unitaria</th><th scope="col">Ganancia sobre costo</th><th scope="col">En bodega</th><th scope="col">Asignado a rutas</th><th scope="col">Acción</th></tr></thead><tbody>{group.products.map((item) => {
        const margin = productProfit(item.cost_price, item.credit_price);
        return <tr key={item.id}>
          <td data-label="Variante"><strong>{item.category_name ? item.variant_name : "Sin variante"}</strong><br /><Badge tone={item.is_active ? "success" : "neutral"}>{item.is_active ? "Activo" : "Desactivado"}</Badge></td>
          <td data-label="Costo"><Money value={item.cost_price} /></td><td data-label="Precio fiado"><Money value={item.credit_price} /></td>
          <td data-label="Ganancia unitaria"><Money value={margin.unitMargin} /></td><td data-label="Ganancia sobre costo"><ProfitPercent value={margin.profitPercent} /></td>
          <td data-label="En bodega"><strong>{item.available_stock}</strong></td><td data-label="Asignado a rutas">{item.reserved_stock}</td>
          <td data-label="Acción"><button type="button" className="sc-button sc-button-secondary" disabled={locked} onClick={() => edit(item)}><Pencil size={16} aria-hidden /> Editar</button></td>
        </tr>;
      })}</tbody></table></div>
    </section>)}
    <section className="sc-panel" id="product-form" aria-labelledby="product-editor-title">
      <h2 id="product-editor-title">{form.id ? `Editar ${selected?.name ?? "producto"}` : "Nuevo producto o variante"}</h2>
      <MutationNotice {...mutation} />
      {mutation.uncertain && <Notice tone="warning">No pudimos confirmar el guardado. Conservamos este ingreso para reintentarlo sin sumar las unidades dos veces. <button type="button" className="sc-button sc-button-secondary" disabled={loading || mutation.busy} onClick={() => void saveProduct()}>Reintentar guardado</button></Notice>}
      <form onSubmit={save}><fieldset disabled={locked}>
        <div className="sc-grid"><Field label="Producto principal"><input ref={mainInput} list="product-main-options" required maxLength={140} value={form.main} onChange={(event) => setForm({ ...form, main: event.target.value })} placeholder="Yogurt" /></Field><Field label="Sabor o variante (opcional)"><input ref={variantInput} maxLength={140} value={form.variant} onChange={(event) => setForm({ ...form, variant: event.target.value })} placeholder="Fresa, mora, natural…" /></Field></div>
        <datalist id="product-main-options">{groups.map((group) => <option key={group.name} value={group.name} />)}</datalist>
        <div className="sc-grid"><Field label="Costo actual (COP)"><input type="number" required min="0" max="1000000000" step="1" inputMode="numeric" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} /></Field><Field label="Precio fiado (COP)"><input type="number" required min="0" max="1000000000" step="1" inputMode="numeric" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field></div>
        <div className="sc-product-profit" role="group" aria-label="Ganancia calculada" aria-live="polite"><div><span>Ganancia unitaria</span><strong><Money value={profit.unitMargin} /></strong></div><div><span>Ganancia sobre costo</span><strong><ProfitPercent value={profit.profitPercent} /></strong></div></div>
        {selected && <p className="sc-muted sc-product-stock-note">Existencias actuales: {selected.available_stock} en bodega · {selected.reserved_stock} asignadas a rutas. Las unidades de abajo se suman a bodega.</p>}
        <Field label={form.id ? "Unidades para agregar a bodega" : "Unidades iniciales en bodega"}><input type="number" required min="0" max="1000000" step="1" inputMode="numeric" value={form.units} onChange={(event) => setForm({ ...form, units: event.target.value })} /></Field>
        <label className="sc-actions" style={{ minHeight: 48, marginBottom: 14 }}><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Disponible para nuevas ventas</label>
        {!form.active && <Notice>Conserva sus existencias y ventas anteriores; no estará disponible para nuevos despachos.</Notice>}
        <div className="sc-actions"><SubmitButton disabled={mutation.busy}>{mutation.busy ? "Guardando…" : "Guardar producto"}</SubmitButton>{form.id && <button type="button" className="sc-button sc-button-secondary" onClick={() => create()}>Cancelar edición</button>}</div>
      </fieldset></form>
      {selected && <StockCorrection key={selected.id} product={selected} loading={loading || mutation.busy || mutation.uncertain} mutation={correction} refresh={refresh} />}
    </section>
  </>;
}

function StockCorrection({ product, loading, mutation, refresh }: { product: AdminProduct; loading: boolean; mutation: ReturnType<typeof useMutation>; refresh: () => void }) {
  const [delta, setDelta] = useState(""), [reason, setReason] = useState("");
  async function correctStock() {
    const result = await mutation.run("/api/admin/stock", { product_id: product.id, delta: Number(delta), reason: reason.trim() }, "Conteo de bodega corregido.", true);
    if (result) { setDelta(""); setReason(""); refresh(); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void correctStock(); }
  return <details className="sc-product-correction"><summary>Corregir un conteo de bodega</summary><p className="sc-muted">Para una diferencia física, indica cuántas unidades faltan o sobran. La carga asignada a rutas se conserva.</p><MutationNotice {...mutation} />{mutation.uncertain && <Notice tone="warning">No pudimos confirmar la corrección. Reinténtala antes de modificar esta tarjeta. <button type="button" className="sc-button sc-button-secondary" disabled={loading || mutation.busy} onClick={() => void correctStock()}>Reintentar corrección</button></Notice>}<form onSubmit={submit}><fieldset disabled={loading || mutation.busy || mutation.uncertain}><Field label="Diferencia de unidades (+ o −)"><input type="number" required step="1" min="-1000000" max="1000000" value={delta} onChange={(event) => setDelta(event.target.value)} /></Field><Field label="Motivo de la corrección de bodega"><textarea required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><SubmitButton disabled={!Number(delta) || mutation.busy}>Corregir conteo</SubmitButton></fieldset></form></details>;
}
