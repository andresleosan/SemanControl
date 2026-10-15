# Modelo D1 de SemanControl

## Estado operativo actual

0001 conserva el modelo inicial descrito abajo. Las migraciones aditivas 0002 y 0003 implementan las Fases 2–4 aprobadas: revisión/secuencia por cliente, costo maestro histórico privado, ownership/asociación de comprobantes, auditoría administrativa y de stock, cuadres físicos, QR de uso único y registro de incidencias tardías. Los [contratos API](contratos-api.md) y [recuperación](rollback-fases-2-4.md) describen el esquema extendido.

El servicio de visita compara revisión, saldo y precios confirmados, actualiza carga/stock/saldo y registra detalles en un único batch. `operation_guards.ok CHECK(ok=1)` convierte una precondición o UPDATE de cero filas en un error SQL que revierte todo. La idempotencia compara actor y hash del contenido original. ADMIN importa saldos físicos con OPENING y modifica deudas mediante ADJUSTMENT; transferencias rechazadas generan un reverso único incluso tras cerrar.

Los costos de cada venta se copian dentro de D1 a `movement_items.unit_cost_price`; no se leen en proyecciones públicas. El margen de ventas registradas utiliza ese snapshot y el precio fiado histórico. Aperturas heredadas sin detalles y ajustes de saldo no se convierten en ganancia. Una incidencia tardía conserva payload/foto originales y referencia su compensación existente; no reaplica la visita a un recorrido cerrado.

Las secciones posteriores documentan la base de Fase 1 y su verificación original; los antiguos requisitos para Fase 2 ya tienen implementación y pruebas.

La migración aditiva 0004 organiza productos por categoría opcional. `product_categories(id,name,created_at)` guarda el producto principal (por ejemplo, Yogurt) y `products.category_id` lo referencia. `products.name` sigue representando la unidad vendible (Fresa); cada variante conserva su propio `products.id`, costo, precio y stock. Un producto simple existente permanece con categoría NULL y conserva sus datos. No se dividen automáticamente los productos ni se reparten unidades al migrar. Los índices evitan categorías repetidas y variantes repetidas dentro de una categoría ignorando mayúsculas ASCII y espacios de borde. No hay eliminación o edición separada de categorías: guardar una variante crea/reutiliza su producto principal en el mismo batch.

Las lecturas de ruta y administración forman la etiqueta `Yogurt · Fresa`; la lectura ADMIN añade nombre propio y categoría para editar sin descomponer texto visible. Al vender se copia la etiqueta completa a `movement_items.product_name_snapshot` dentro de D1. Cambiar categoría, nombre o costo después no modifica ninguna venta anterior. Los costos y porcentajes continúan restringidos a ADMIN.

Guardar un producto admite unidades adicionales a bodega mediante `stock_qty`: los metadatos, el incremento de `total_stock`, el evento stock y la auditoría se guardan atómicamente. Una clave UUID impide duplicar ingresos al reintentar; la carga de rutas no se modifica. El motivo de este guardado/ingreso se genera automáticamente, manteniendo actor, valores anteriores/nuevos y cantidades. El snapshot administrativo previo contiene solo metadatos; las transiciones exactas de existencias se registran en `stock_events.previous_stock/new_stock` dentro del batch, para incluir cualquier entrega o ingreso concurrente anterior. Los motivos para correcciones físicas y financieras conservan su validación. Ganancia unitaria = precio fiado − costo; ganancia sobre costo = ganancia / costo × 100 (12.000 → 18.000: 6.000 y 50 %). Costo cero no produce porcentaje; una pérdida produce porcentaje negativo. Esto no representa dinero cobrado. [Reversión de bodega y variantes](rollback-bodega-variantes.md).

La migración inicial conserva las ocho tablas de la especificación. Los ajustes aprobados para Fase 1 añaden activación de usuarios, reservas verificables, referencias obligatorias y un ledger que representa aperturas, ajustes y reversos. El dinero se almacena en pesos enteros; las cantidades también son enteras. Las restricciones `typeof(...)= 'integer'` impiden decimales almacenados por la afinidad flexible de SQLite.

## Tablas y vínculos

La migración aditiva 0005 incorpora `opening_items(id,movement_id,product_id,product_name_snapshot,qty,unit_credit_price,subtotal)` para documentar productos entregados **antes** de registrar una tarjeta. Cada fila referencia su OPENING y un producto/variante existente, incluso inactivo; guarda nombre completo, cantidad y precio fiado histórico confirmado por ADMIN. Los precios vigentes y las existencias no restringen una deuda anterior. El total se calcula en servidor y se registra en `clients.current_balance` y `ledger_movements.adjustment_amount` en el mismo batch que los detalles y la auditoría. Con productos no se admite un saldo manual simultáneo; sin productos se mantiene la apertura monetaria original, incluido el saldo a favor.

La tabla no tiene columna de costo: no se deduce el costo histórico a partir del catálogo actual. Crear una tarjeta con estos detalles no mueve inventario, no ocupa carga de ruta y no registra una venta nueva; por ello tampoco modifica el margen de ventas. No cambia el esquema o historial existente de `movement_items`. Las restricciones exigen números enteros, cantidad 1–100.000, precio/subtotal no negativo hasta 1.000.000.000, producto único por apertura, referencia a OPENING y suma no mayor que el importe de apertura. Una guarda final del servicio exige suma exacta y revierte el batch completo ante un producto inexistente. Las líneas no se actualizan ni eliminan y REPLACE no puede sobrescribirlas.

Los historiales ADMIN, WORKER y CLIENT devuelven esos snapshots mediante `Movement.items` con las mismas columnas públicas que las ventas. «Productos de la deuda inicial» describe el origen: los abonos posteriores afectan el saldo global y no se imputan a unidades individuales. No se muestran esas cantidades como productos actualmente pendientes. El motivo de alta/edición se genera en servidor y el motivo explícito anterior sigue admitido. La idempotencia del alta compara únicamente los datos normalizados de la solicitud y conserva el resultado ante reintentos, incluso después de renombrar/desactivar productos, modificar precios o recibir abonos. [Reversión de tarjetas y deuda inicial](rollback-tarjetas-deuda-inicial.md).

| Tabla | Responsabilidad y claves |
| --- | --- |
| `users` | ADMIN, WORKER o CLIENT; correo canónico único; UID opcional único; `is_active` por defecto 1. |
| `clients` | Tarjeta sin teléfono; nombre, dirección y referencia obligatorios; `route_order` positivo y único; email/UID opcionales únicos. |
| `products` | Costo privado del ADMIN, precio fiado e inventario total no negativo. |
| `route_dispatches` | Recorrido OPEN o CLOSED; fecha con forma YYYY-MM-DD. |
| `dispatch_workers` | Varios trabajadores por recorrido; combinación única; solo WORKER activo en recorrido abierto. |
| `dispatch_inventory` | Carga única por recorrido/producto; `0 <= remaining_qty <= initial_qty`. |
| `ledger_movements` | Historial contable e idempotencia única; referencia a tarjeta, responsable, recorrido opcional y movimiento revertido. |
| `movement_items` | Cantidad, nombre y precio históricos de un producto; subtotal exacto; producto único por movimiento. |
| `opening_items` | Productos de una deuda anterior, asociados exclusivamente a OPENING; snapshots inmutables sin costo ni movimiento de inventario. |

Las claves foráneas conservan el historial y rechazan referencias inexistentes. D1 las activa; los consumidores SQLite deben activar `PRAGMA foreign_keys = ON`. Los índices cubren orden de tarjetas, cargas por producto, recorridos del trabajador, historial del cliente y revisión de transferencias. D1 no ofrece permisos SQL por rol: el servidor verifica identidad y usa columnas explícitas. `cost_price` solo puede entrar en proyecciones y respuestas ADMIN.

Los emails se guardan como `lower(trim(email))`; la aplicación normaliza antes de escribir. Un CHECK rechaza mayúsculas y espacios. No se eliminan puntos ni sufijos `+` de direcciones Gmail. `NULL` representa un vínculo aún inexistente; el UID no puede ser una cadena vacía. Los vínculos entre la fila `users` y una tarjeta CLIENT se verifican en autenticación.

## Inventario y cierre

`products.total_stock` incluye bodega y unidades asignadas a rutas. La reserva actual de un producto es `SUM(dispatch_inventory.remaining_qty)` únicamente en recorridos OPEN. Disponible en bodega = total menos reserva. Los triggers de inserción/actualización consultan todas las cargas del producto dentro de la misma escritura: dos recorridos no pueden reservar más unidades que las existentes. Las identidades de las filas de carga son inmutables; para otro producto o recorrido se crea otra fila.

| Operación | Reserva | Stock total |
| --- | --- | --- |
| Cargar recorrido | Sube | No cambia |
| Entregar productos | Baja | Baja en la misma cantidad |
| Devolver sobrante | Baja | No cambia |
| Cerrar después de conciliar devolución | Se libera | No cambia |

El batch de entrega debe actualizar primero `remaining_qty` y después `total_stock`. El guard de stock impide bajar el total por debajo de las reservas restantes y permite ese orden. El cierre es terminal: no admite reapertura, nuevas visitas ni cambios de carga. Conserva `remaining_qty` para consultar el sobrante registrado al cierre. El backend de Fase 2 deberá confirmar la devolución física antes de cerrar; el esquema no puede comprobar un retorno físico.

Los INSERT con una identidad ya existente se rechazan antes del conflicto en productos, recorridos y cargas. Esto bloquea `INSERT OR REPLACE`, que en SQLite puede borrar y reinsertar sin ejecutar los guards de UPDATE ni los de DELETE. Las modificaciones de esas entidades deben usar UPDATE; un UPSERT que primero intente insertar una identidad existente también será rechazado. El seed evita el conflicto seleccionando únicamente las filas que faltan.

## Ledger y conciliación

Todo movimiento cumple `new_balance = previous_balance - payment_amount + charge_amount + adjustment_amount`. Los saldos y ajustes permiten valores negativos; un saldo negativo representa saldo a favor. Los abonos y cargos son no negativos. El nombre `worker_user_id` se conserva por compatibilidad y significa **usuario responsable**; en aperturas, ajustes y reversos debe ser un ADMIN activo.

| `movement_type` | Condiciones |
| --- | --- |
| `VISIT` | Trabajador activo asignado y recorrido OPEN; ajuste cero; puede contener abono y productos. |
| `OPENING` | ADMIN, motivo obligatorio, saldo previo cero; única apertura por tarjeta; importe en `adjustment_amount`. |
| `ADJUSTMENT` | ADMIN, motivo obligatorio y ajuste distinto de cero; sin cobros, productos ni recorrido. |
| `TRANSFER_REVERSAL` | ADMIN y motivo; referencia única a transferencia de la misma tarjeta; ajuste igual al abono original. |

Sin abono, `payment_method` es NONE; con efectivo, CASH y estado NOT_APPLICABLE; una transferencia requiere importe positivo, key del comprobante y estado PENDING, OBSERVED, VERIFIED o REJECTED. PENDING y OBSERVED ya descuentan provisionalmente en el movimiento original. Cambiar a VERIFIED solo cambia estado: no crea un segundo descuento.

Para rechazar, el backend inserta el reverso contable y actualiza el saldo del cliente en un único batch. El trigger del reverso marca automáticamente REJECTED en el original, sin modificar `clients.current_balance`. Esto evita un estado REJECTED sin el reverso que lo justifica y evita dependencia circular entre ambos INSERT/UPDATE. El reverso debe igualar el importe original, incluso cuando posteriormente hayan ocurrido otras visitas; su `previous_balance` debe ser el saldo vigente al conciliar. REJECTED es final. Los campos contables y sus detalles no se editan ni eliminan, y los conflictos INSERT OR REPLACE se rechazan antes de borrar historial. Las correcciones posteriores son nuevos ajustes auditados.

## Requisitos originales de Fase 2 — implementados

La migración garantiza restricciones locales, reservas y trazabilidad del rechazo. **No implementa endpoints comerciales ni actualiza saldos automáticamente.** Fase 2 debe validar autorización por operación, cantidades y dinero dentro de enteros seguros de JavaScript, fecha real de calendario, UUID v4, comprobante privado en R2, y condiciones de cuenta/producto activos.

El handler debe incluir en un solo `env.DB.batch` la carga restante, inventario total, saldo del cliente, movimiento y detalles. Debe proteger la secuencia de saldos con una condición sobre el saldo previo o una guarda SQL explícita. También debe exigir igualdad entre `SUM(movement_items.subtotal)` y `charge_amount`; el trigger solo impide exceder el cargo durante la inserción progresiva de detalles. Las aperturas se importan antes de iniciar visitas.

Un `UPDATE ... WHERE ...` que no encuentra una fila devuelve cero cambios; ni SQLite ni `db.batch` lo convierten en error. Los triggers solo se ejecutan si hay una fila afectada. El futuro handler debe diseñar una guarda que produzca error SQL dentro del batch cuando falte la fila o falle una condición; revisar `meta.changes` después de un batch ya confirmado no deshace sus efectos. También debe tratar el conflicto de idempotencia como repetición y devolver el resultado anterior. [Contrato oficial de D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Seed y evidencia

`seed.sql` contiene solamente datos sintéticos: ADMIN `admin-demo`, WORKER `worker-demo-1` y `worker-demo-2`, cinco productos, recorrido OPEN `route-demo-2026-10-16`, cinco cargas, ambas asignaciones y diez tarjetas #1–#10. Cada saldo inicial tiene una apertura con ADMIN, motivo e idempotency key. La tarjeta #10 ejemplifica un saldo a favor. Los emails `.example` no son cuentas reales de Google; el administrador debe configurar correos reales para probar Sign-In.

El seed se vuelve a ejecutar sin duplicar ni reiniciar filas existentes. Sus INSERT revisan identificadores exactos; no crean aperturas en tarjetas ajenas que tengan un nombre parecido. Es una fixture para una base local limpia, no un mecanismo de sincronización ni importación comercial.

Evidencia de TDD del 2026-10-14:

- Antes de crear la migración, `python -m unittest discover -s tests -p test_schema.py -v`: **29 tests, 29 FAIL**, con la aserción esperada de migración ausente.
- Primera implementación: **29/29 OK** contra SQLite real.
- Revisión: dos tests nuevos reprodujeron la sobrescritura de historial por REPLACE y se extendió el seed para comprobar una tarjeta ajena. Resultado rojo: **31 tests, 3 FAIL**; causas: DELETE implícito de REPLACE y selección demasiado amplia de tarjetas del seed.
- Guards de conflicto previos al INSERT y selección de diez IDs exactos: **31/31 OK**. Incluye reservas entre dos rutas, entrega con stock totalmente reservado, rollback por conflicto de idempotencia, cierre, ecuación, crédito, reverso único, seed repetido y recuperación por backup SQLite.
- Revisión independiente: **34 tests, 3 FAIL** reprodujeron REPLACE de producto con stock inferior a la reserva, reapertura de recorrido CLOSED y reasignación de la carga histórica de un recorrido cerrado. Los guards BEFORE INSERT de identidades bloquean esas tres rutas. Las variantes de ledger con ID anterior/key nueva e ID nuevo/key anterior, y detalles con ID nuevo/producto anterior, conservan el historial. Verificación posterior: **34/34 OK**.

La reversión local y el procedimiento de recuperación remota están en [rollback-fase-1.md](rollback-fase-1.md). La prueba Python no acredita un despliegue ni una restauración remota.
