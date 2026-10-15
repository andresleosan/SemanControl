# Reversión de bodega y variantes

La migración `0004_product_categories.sql` es aditiva: crea una tabla de categorías, agrega `products.category_id` nullable y agrega índices/guard de identidad. No mueve identificadores ni modifica stock, precios, cargas de rutas, fichas de clientes o snapshots históricos. Las pruebas SQLite comparan esas filas antes y después de aplicar 0004.

## Reversión de aplicación

La recuperación preferida es conservar el esquema aditivo y publicar una corrección de aplicación que mantenga las proyecciones de nombres completos de categoría/variante. Puede retirarse el formulario nuevo o bloquear nuevas altas/ingresos sin cambiar saldos, existencias o historial. Las consultas anteriores siguen siendo válidas con la columna adicional, pero una versión que solo lea `products.name` mostraría `Fresa` sin `Yogurt`; por eso, tras crear variantes, la versión de recuperación debe conservar la proyección completa. No borrar tablas o columnas para revertir únicamente la interfaz.

Si 0004 se aplicó pero todavía no se crearon categorías/variantes, es posible volver al código anterior dejando el esquema aditivo. Confirmar que `SELECT COUNT(*) FROM products WHERE category_id IS NOT NULL` devuelva 0. Conservar tabla/columna/índices para volver a habilitar el cambio sin manipular datos.

## Restauración de respaldo

Una restauración de base completa solo corresponde a una corrupción confirmada que no pueda resolverse con una corrección. Antes de cualquier despliegue/migración de producción, obtener y verificar respaldo/exportación consistente de D1. Si fuera necesaria una restauración, acordarla sobre la versión final revisable, detener escrituras, conservar una copia de la base actual y comparar las operaciones posteriores al respaldo; una restauración antigua puede perder ingresos, cobros y visitas válidas. Restaurar el respaldo mediante el procedimiento de recuperación de D1 acordado y verificar integridad/FK, saldos, existencias, reservas, historial y sesiones antes de reabrir escrituras. Ninguna restauración remota se ejecuta automáticamente.

No borrar `.wrangler/state`: contiene D1/R2 locales. Las pruebas se ejecutan con SQLite en memoria y Miniflare efímero, sin aplicar migraciones a datos reales. No editar `movement_items` ni `ledger_movements` para revertir nombres: sus snapshots son históricos e inmutables.

## Comprobaciones

- La migración preserva IDs, stock, carga e historial existentes y deja productos anteriores con categoría NULL.
- Una alta/edición fallida revierte categoría nueva, incremento stock, evento y auditoría juntos.
- Repetir un ingreso con el mismo UUID no suma unidades por segunda vez.
- La recuperación conserva `product_categories` y `products.category_id`; la prueba SQLite confirma compatibilidad de consultas anteriores y continuidad de las relaciones.
