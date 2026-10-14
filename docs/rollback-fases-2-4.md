# Recuperación de las migraciones 0002 y 0003

La migración es aditiva y mantiene los movimientos y las reservas existentes. Antes de aplicarla, exportar D1 y guardar copia de `.wrangler/state` con el proceso local detenido. Registrar también la versión de la aplicación. No borrar el bucket R2 ni el directorio de estado.

Si falla su aplicación, D1 revierte la migración completa. Comprobar que `d1_migrations` no registre 0002 y que el esquema siga en 0001 antes de volver a iniciar la versión anterior.

Si ya se aplicó, detener escrituras y restaurar el respaldo completo de D1 de antes de 0002 en una base vacía de recuperación; validar saldos, stock, reservas, cantidad de movimientos y claves foráneas. En local puede restaurarse la copia íntegra del estado mientras todos los procesos están detenidos. No intentar eliminar columnas/tablas de una base con operaciones nuevas: eso perdería auditoría, conciliación y vínculos de comprobantes. Conservar la base original y R2 para recuperar posteriormente cualquier operación creada después del respaldo.

La reversión de producción requiere respaldo reciente y autorización del operador. Esta ejecución no aplica migraciones remotas.

Las pruebas Miniflare ejecutan 0001, 0002, 0003 y el seed completo sobre bases efímeras; cada prueba conserva las restricciones y triggers reales. La recuperación local se verificó en `.wrangler/restore-before-fases-2-4` a partir de `.wrangler/backup-before-fases-2-4.sql`: 75 sentencias, quick_check=ok, sin errores FK y 10 clientes/10 movimientos originales, antes de aplicar 0002/0003 al estado activo. Se preservan ambas copias al limpiar builds. 0003 es aditiva; no borra ni altera visitas originales y conserva las incidencias fuera de los recorridos cerrados.

## Recuperar una limpieza interrumpida

La limpieza manual requiere ADMIN y selecciona únicamente comprobantes sin asociar durante más de 48 horas. Antes de borrar R2 toma una cuarentena en `operation_guards`; las visitas no pueden asociar ese UUID mientras exista. Los journals `RECEIPT_UPLOAD_STARTED` e `INCIDENT_UPLOAD_STARTED` permiten localizar objetos que quedaron en R2 antes de insertar metadata. La limpieza excluye toda clave referenciada en receipts, ledger_movements u operation_incidents y respeta los reintentos recientes.

Un fallo ordinario de R2/D1 conserva la cuarentena y libera la guardia de ejecución terminada en `:job`; volver a ejecutar el mantenimiento retoma la limpieza. Dos solicitudes simultáneas nunca comparten un job activo del mismo recurso.

Si el proceso murió y dejó una guardia `:job`, detener o verificar terminado ese proceso y guardar respaldo de D1. Un ADMIN puede consultar `SELECT id FROM operation_guards WHERE id LIKE 'receipt-%:job'` y eliminar **solo la identidad exacta del job abandonado**, usando SQL parametrizado. Conservar la cuarentena correspondiente (la identidad sin `:job`) y toda metadata de receipts/audit_events. Volver a ejecutar el mantenimiento ADMIN; su batch final retira la cuarentena al completar R2. Nunca liberar manualmente la cuarentena ni borrar receipts asociados.
