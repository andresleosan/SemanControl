# Tarjetas y deuda inicial por productos

El usuario pidió un filtro de período compacto, textos comprensibles, formulario exclusivo al crear/editar tarjeta, quitar el motivo de alta/cambio y registrar productos ya adeudados. Confirmó que son entregas anteriores: no descontar inventario ni registrar una venta nueva.

- Vista principal: directorio «Tarjetas», deuda pendiente actual y ganancia de ventas del período. El filtro de fechas queda plegado junto a los controles. Retirar «Aperturas heredadas sin detalle» de los indicadores; su suma original no es deuda pendiente y resulta confusa. La API puede conservar el campo por compatibilidad.
- Alta/edición: pantalla dentro de la misma ruta dedicada al formulario, sin directorio, filtros, resumen ni historial detrás. Volver restaura el listado/búsqueda. Sin campo motivo; servidor genera una nota administrativa.
- Alta: seleccionar variantes existentes del catálogo, incluidas inactivas si la entrega fue anterior, cantidad y precio fiado histórico editable. Calcular deuda como suma de las líneas. Alternativa sin productos: saldo anterior manual, incluyendo cero o saldo a favor. Las dos alternativas son excluyentes para evitar sumar el mismo importe dos veces.
- API `saveClient`: `opening_items?:{product_id,qty,unit_credit_price}[]` solo en alta. Con líneas, omitir `opening_balance`; el servidor calcula el importe. Sin líneas, `opening_balance` conserva el contrato anterior. Editar rechaza cambios de apertura. Motivo opcional con valor automático.
- Nueva tabla aditiva `opening_items` asociada al asiento OPENING. Snapshots inmutables de nombre completo, cantidad y precio; sin costo histórico inventado. Guardas de tipo, FK y suma. No alterar restricciones de VISIT ni `movement_items`.
- Historial ADMIN/WORKER/CLIENT incorpora esos productos como «Productos de la deuda inicial». Los abonos posteriores cambian el saldo monetario y no se atribuyen a unidades concretas. No presentar las cantidades iniciales como productos pendientes actuales.
- Operación atómica e idempotente: tarjeta, saldo inicial, líneas y auditoría se confirman juntos. Reintento conserva la solicitud; cambio de precio/nombre posterior no altera snapshots ni duplica tarjeta. Saldo no usa costo/stock actuales; margen de importaciones no se calcula con costos de hoy.
- Se conservan las mejoras de bodega/categorías de la tarea anterior y todos los IDs/datos existentes. Sin push, migración real o publicación en este trabajo local.

Validación: alta con Yogurt · Fresa, deuda calculada e historial de los tres roles; mismo stock/margen; importes manuales anteriores; rechazo de duplicados y aperturas en edición; respuesta perdida; formulario aislado y filtro en móvil/escritorio.
