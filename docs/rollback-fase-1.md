# Reversión de la migración inicial

La Fase 1 trabaja únicamente con D1 local. No ejecuta restauraciones remotas ni borra recursos. `0001_init.sql` crea el modelo inicial; no existe un `down` remoto automático. La reversión consiste en recuperar el estado anterior o recrear la base local de pruebas.

## Base local de pruebas

1. Detener el servidor local para evitar escrituras.
2. Exportar el estado que se quiera conservar con `pnpm exec wrangler d1 export DB --local --output=backup-fase-1.sql`. Guardar el archivo fuera de la carpeta de estado de Wrangler.
3. Para volver a una base vacía de pruebas, usar un directorio nuevo de persistencia con `--persist-to .wrangler/rollback-check` en los comandos D1 locales. Aplicar la migración y el seed en ese directorio; no es necesario eliminar el estado anterior.
4. Para recuperar datos, importar el export en una base local vacía del mismo directorio de persistencia con `pnpm exec wrangler d1 execute DB --local --persist-to .wrangler/rollback-check --file=backup-fase-1.sql`. Un export completo ya incluye esquema y datos: no aplicar primero `0001_init.sql` sobre la base de recuperación.
5. Ejecutar `PRAGMA quick_check`, `PRAGMA foreign_key_check`, conteos y comprobaciones del ledger antes de volver a usarla. D1 admite `quick_check`; `integrity_check` no está autorizado por su API. Mantener el estado anterior hasta validar la recuperación.

Los tests usan bases SQLite temporales y la API `Connection.backup` para comprobar recuperación del esquema y el ledger. La validación de Wrangler local corresponde a la integración de Fase 1. El export local usa una instantánea consistente y evita copiar a mano un archivo SQLite mientras tiene conexiones o WAL activos.

Verificación local del 2026-10-14: se exportó DB a `.wrangler/phase1-backup.sql`, se importó en `.wrangler/restore-check` (75 sentencias), y se recuperaron 10 clientes y 10 aperturas sin violaciones de claves foráneas. Las rutas de prueba están ignoradas por Git. Referencia de comandos de comprobación: [PRAGMA compatibles con D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/).

## Base remota futura

Este procedimiento queda documentado para una operación futura autorizada. Antes de migrar, guardar un export completo y el bookmark de Time Travel, con fecha, identificador de base y conteos. Las restauraciones remotas sobrescriben datos: requieren respaldo verificado y autorización del operador.

```powershell
pnpm exec wrangler d1 export DB --remote --output=backup-previo.sql
pnpm exec wrangler d1 time-travel info DB --json
# Solo con el bookmark comprobado y autorización de restauración:
pnpm exec wrangler d1 time-travel restore DB --bookmark=BOOKMARK_VERIFICADO
```

Detener escrituras antes de restaurar. Registrar también el bookmark del estado actual para poder deshacer la restauración. Comprobar integridad, claves foráneas, tablas, reservas y aperturas; reabrir el servicio cuando esas verificaciones pasen. Time Travel tiene retención según el plan y no sustituye un export para conservar datos fuera de ese período.

Fuentes verificadas el 2026-10-14: [importación y exportación D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [comandos Wrangler D1](https://developers.cloudflare.com/d1/wrangler-commands/) y [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
