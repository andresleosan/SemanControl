# Reversión de tarjetas y deuda inicial por productos

La migración `0005_opening_items.sql` es aditiva. Agrega una tabla y sus guardas sin actualizar productos, stock, cargas, tarjetas, aperturas ni ventas existentes. No se ha aplicado a producción como parte de este cambio local.

La reversión operativa consiste en volver al código anterior y **conservar 0005 y sus datos**. Ese código sigue leyendo `clients.current_balance` y los asientos OPENING sin necesitar las nuevas líneas; los saldos permanecen completos aunque la interfaz anterior no detalle los productos. No bajar saldos, no compensar inventario y no convertir las aperturas en ventas. Mantener también 0004 y las categorías existentes. Las pruebas SQLite verifican las consultas del código anterior y la conservación de IDs, stock, cargas e historial tras agregar 0005.

Antes de un despliegue/migración de producción, revisar la versión final, disponer de una copia reciente verificada y registrar la versión anterior a restaurar. Si se restaura una copia de D1 por una incidencia ajena a esta reversión de código, conciliar todas las operaciones posteriores a esa copia; restaurarla sin conciliación puede perder abonos o tarjetas nuevas. No se debe retirar la tabla de una base con importaciones reales: los detalles son parte del historial y sus guardas bloquean su eliminación.

Para una base temporal de pruebas vacía, se puede reconstruir desde las migraciones 0001–0004 y el seed sintético. Este procedimiento es exclusivo de bases desechables; no borrar `.wrangler/state` ni datos D1/R2 del usuario. Las pruebas de esta modificación usan SQLite en memoria y Miniflare aislado.
