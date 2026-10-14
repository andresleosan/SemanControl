# SemanControl — tareas

- [x] Fase 1: esquema reforzado y seed auditables.
- [x] Fase 1: Next.js, OpenNext, Wrangler y bindings locales.
- [x] Fase 1: Firebase Google, roles y protección de costos.
- [x] Fase 1: pruebas, revisión independiente y documentación.
- [x] Migración a pnpm y limpieza de dependencias/builds regenerables.
- [x] Fase 2: APIs, migraciones, idempotencia, comprobantes, QR y conciliación.
- [x] Fase 3: vistas del trabajador, compresor WebP, PWA y cola privada.
- [x] Fase 4: administrador, cuadre físico, cartera y portal cliente.

## Evidencia de Fase 1 — 2026-10-14

- `npm ci --no-fund`: instalación reproducible y auditoría sin vulnerabilidades.
- `npm run verify`: 80 pruebas Vitest + 34 pruebas SQLite pasan; typecheck, lint y build Next.js/OpenNext terminan con exit 0.
- `npm run db:migrate` y `npm run db:seed`: migración final aplicada a D1 local limpio. Confirmados 1 ADMIN, 2 WORKER, 5 productos, 1 recorrido OPEN, 10 clientes #1–#10 y 10 aperturas.
- `python scripts/smoke_worker.py --url http://localhost:3000`: 14/14 comprobaciones HTTP del servidor dev.
- `python scripts/smoke_worker.py`: 14/14 comprobaciones HTTP del Worker compilado en `127.0.0.1:8787`, incluidos 401/403, redirecciones y cierre de cookie.
- `npx wrangler deploy --dry-run`: bundle válido, gzip 1165.65 KiB; no se publicó ni se crearon recursos remotos.
- Export D1 local e import a persistencia separada: 75 sentencias, `quick_check=ok`, sin errores de foreign keys, 10 clientes/10 aperturas recuperados.
- Navegador Chrome a 390×844: sin desbordamiento horizontal, botón de acceso de 56px y sin errores/warnings en consola.
- Revisión independiente aprobada. Se corrigieron bypass de REPLACE en productos, recorridos y cargas; el origen de sesión y Secure usan APP_ORIGIN confiable. Next.js queda fijado en 16.3.8 por incompatibilidad runtime de 16.4 con OpenNext, documentada en STACK.

El código de autenticación se verificó con JWT RSA locales y D1 simulado real. La prueba de Google Sign-In con una cuenta real requiere configurar el proyecto Firebase según README. R2 está vinculado y tipado; subida y autorización de comprobantes pertenecen a Fase 2. No hay bypass de autenticación. La Fase 2 espera confirmación del usuario.

## Migración a pnpm y revisión de Fases 2–4 — 2026-10-14

- `pnpm install --frozen-lockfile`: instalación verificada con pnpm 11.23.0; único lockfile `pnpm-lock.yaml`. Los overrides de seguridad y las autorizaciones por versión para scripts se conservan en `pnpm-workspace.yaml`.
- Layout `hoisted` con importación por hardlinks: corrige la copia de enlaces de OpenNext en Windows sin cambiar de gestor.
- `pnpm verify`: 80 pruebas Vitest + 34 pruebas SQLite, typecheck, lint y build Workers pasan con exit 0.
- `pnpm audit`: sin vulnerabilidades conocidas. `pnpm preview` y `python scripts/smoke_worker.py`: 14/14 comprobaciones HTTP pasan en el Worker compilado.
- D1 local después de la migración: `quick_check=ok`, 10 clientes y 10 aperturas. Fuente, configuración, datos y backup se conservan.
- `pnpm clean`, `pnpm cf:typegen` y `pnpm clean:all`: completados. Peso lógico de la carpeta reducido de aproximadamente 1.1 GB a 3.8 MB; este valor no incluye el store compartido externo de pnpm ni equivale a espacio físico liberado por hardlinks. Se retiran `node_modules`, builds y cachés; para trabajar de nuevo, usar `pnpm install --frozen-lockfile`.
- Revisión independiente de configuración y limpieza: sin hallazgos bloqueantes. [Propuesta para Fases 2–4](docs/propuesta-fases-2-4.md) preparada y pendiente de aprobación; no se ha iniciado su implementación.

## Fases 2–4 completas — 2026-10-14

Propuesta aprobada por el usuario y ejecutada con pnpm. Incluye las ocho pantallas, mutaciones financieras atómicas, carga compartida, costos históricos privados, WebP/QR, cola por UID/recorrido, incidencias tras cierre, aperturas físicas y ajustes auditados. Ningún recurso fue desplegado ni migrado remotamente.

- `pnpm verify`: **164/164 pruebas Vitest** en 15 archivos, incluidas **7/7 pruebas de navegador** con componentes y servicios reales/D1/R2 efímeros; **34/34 pruebas SQLite**; TypeScript, ESLint y build Next.js/OpenNext completados con exit 0. Total: 198 pruebas.
- `pnpm audit`: ninguna vulnerabilidad conocida; lockfile y gestor pnpm conservados.
- `pnpm preview` + `python scripts/smoke_worker.py`: **22/22 comprobaciones HTTP** pasan sobre el Worker recién compilado. Permisos, Origin, cookie y recursos PWA comprobados.
- Chrome sobre el Worker real, sin identidad fixture: `/login` instala SW/manifest; sin red `/ruta` abre fallback público, ancho 390 px y cero errores JS. Google Sign-In real todavía requiere la configuración Firebase descrita en README.
- `pnpm exec wrangler deploy --dry-run`: 40 assets, Worker gzip **1504.13 KiB**; no publicación.
- Backup previo `.wrangler/backup-before-fases-2-4.sql` restaurado en persistencia separada: 75 sentencias, quick_check=ok, sin errores FK, 10 clientes/10 movimientos conservados. 0002/0003 aplicadas únicamente a D1 local; después de limpiar se verifican de nuevo esas tres migraciones, quick_check=ok y 10/10 filas originales.
- Medición de 61 recorridos: se eliminó N+1 de administración, de 63 consultas a 3, con regresión comprobada.
- Revisiones independientes corrigieron renovación Firebase con cookie anterior, QR pendientes al revocar correo, alta inactiva, fechas imposibles, suspensión que impedía cerrar, apertura física/KPI, correo reservado, carreras de R2/limpieza, desborde móvil y respuestas atrasadas de recorridos. Cada hallazgo tiene prueba o comprobación focalizada; no quedan bloqueantes conocidos.
- Limpieza final: `pnpm clean`, `pnpm cf:typegen`, `pnpm clean:all` completados. Se retiran dependencias, builds, temporales y capturas regenerables; fuente/configuración/D1/R2/backups se conservan. Carpeta aproximadamente **5.9 MB**, sin contar el store compartido externo. Para continuar: `pnpm install --frozen-lockfile`.

Límite operativo explícito: la app abierta atiende snapshots sin señal; reabrir requiere conexión para revalidar cuenta. D1 no ve colas de otros teléfonos: se declara sincronización y una visita tardía se concilia mediante incidencia/compensación referenciada. La prueba de identidad real y la configuración/publicación de producción quedan fuera de esta ejecución local.
