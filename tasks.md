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

## Publicación para revisión — 2026-10-14

Solicitud posterior del propietario: subir a `andresleosan/SemanControl` y publicar en `https://semancontrol.pages.dev/`. El usuario eligió el favicon **3, Ruta**, confirmó el correo del administrador y, ante el límite de proyectos Firebase, eligió publicar con Google Sign-In pendiente.

- Código subido a la rama `main`. Configuración remota separada en `wrangler.production.toml`; el puente Pages usa un Service binding al Worker sin alterar Request ni respuesta. [Guía de publicación](docs/deploy-cloudflare.md).
- D1 `semancontrol-db` y R2 privado `semancontrol-receipts` creados en la cuenta confirmada. Backup privado inicial en `.wrangler/backups/production-before-initial.sql`; migraciones 0001–0003 aplicadas remotamente. Un ADMIN preautorizado; cero clientes, productos o saldos sintéticos en la base remota.
- Verificación actual: **171/171 Vitest**, incluidas las siete pruebas de navegador; **34/34 SQLite**; **4/4 del puente Pages**. Total **209 pruebas**. TypeScript, ESLint, build de producción y dry-run correctos; auditoría pnpm sin vulnerabilidades conocidas.
- Worker publicado, versión `3fad04e5-7cab-4762-ae3c-a6c87579d92a`. Pages publicado en el dominio solicitado; **13/13 comprobaciones HTTP públicas** correctas, incluidas redirecciones, permisos, Origin, sesión pendiente, cookie Secure, manifest, SW e iconos. Chrome muestra el acceso pendiente, logo cargado y cero errores JavaScript. [Captura de publicación](docs/deployment/login-publicado.png).
- `FIREBASE_PROJECT_ID=""` impide validar cualquier token con 503 `AUTH_NOT_CONFIGURED`. El botón Google está deshabilitado si falta cualquiera de las cuatro variables públicas. Las pantallas privadas requieren habilitar Firebase y volver a compilar; no se probó Google real en esta publicación.
- La limpieza conserva Git, fuente, datos locales y backups. `pnpm clean:all` retira dependencias, builds y temporales regenerables, incluido el temporal de Pages; el store compartido externo se conserva.

## Integración Firebase — 2026-10-14

- [x] Acceso verificado al proyecto `semancontrolapp`; app web registrada y SDK enlazado en desarrollo/build de producción.
- [x] Google habilitado y dominios de Pages/desarrollo autorizados; configuración local ignorada y sin claves privadas.
- [x] Propietario confirmó conservar D1/R2; Firestore no se usa y sus reglas actuales deniegan acceso.
- [x] Corregida reutilización de cookie anterior cuando Firebase no tiene usuario, con regresión TDD y revisión independiente.
- [x] 211 pruebas (173 Vitest + 34 SQLite + 4 puente), typecheck, lint, auditoría, build de producción, dry-run y 22 comprobaciones HTTP locales correctos.
- [x] Google real confirmado por el propietario desde pestaña independiente; D1 local confirma ADMIN activo y UID enlazado. La herramienta Browser Use interfería con la prueba inicial; no requirió cambios adicionales del producto.
- [x] Propietario confirmó publicar. `pnpm deploy:production` completado; versión activa `022bea53-5fd5-4d63-831d-a7c6cac40dcd` en `semancontrol.pages.dev`. Sin migraciones ni seed; puente Pages existente conservado.
- [x] 13/13 comprobaciones HTTP públicas correctas; configuración Firebase real en los chunks y botón Google habilitado en Chrome, sin errores JS.
- [x] Preview local cerrado y `pnpm clean:all` completado. Hashes confirman 31 archivos de persistencia local y tres archivos de configuración sin cambios; builds, temporales y dependencias regenerables retirados.

Configuración, límites de evidencia y recuperación: [integración Firebase](docs/firebase-auth.md).

## Landing comercial — 2026-10-14

- [x] Portada pública para promocionar SemanControl, conservando `/login` como acceso a la aplicación.
- [x] Destino comercial confirmado por el propietario: `https://www.alsdevstudio.com/`.
- [x] Vista ilustrativa ficticia, beneficios, recorrido completo, roles, FAQ, SEO e imagen para compartir. Sin cambios en datos ni migraciones.
- [x] 211 pruebas existentes, TypeScript, lint, auditoría y build de producción correctos. Dry-run: 50 assets, 1502,42 KiB gzip.
- [x] HTTP local 9/9 de marketing y 22/22 del smoke existente; cinco anchos móviles/escritorio, contraste, FAQ y enlaces internos revisados. Capturas y revisión independiente registradas.
- [x] Propietario confirmó push/publicación. Commit `e32be62` subido a `origin/main`; Worker `e74e8c9b-618a-42bd-bd2f-ce39a19d77d6` activo al 100 %. Sin migraciones ni seed.
- [x] 16/16 comprobaciones HTTP públicas correctas; portada e ingreso revisados en Chrome, Google habilitado y sin errores JS. Captura móvil corregida y evidencia de publicación guardada.
- [x] Preview cerrado y `pnpm clean` completado. Hashes confirman 29 archivos de estado D1/R2 y tres configuraciones sin cambios; dependencias listas para continuar.

[Revisión de la landing y capturas](docs/landing/README.md).

## Siguiente paso operativo

- [ ] Piloto manual con 3–5 tarjetas físicas: comprobar saldo de apertura y orden, configurar productos/existencias y Gmail del trabajador, preparar un recorrido y revisar su primera visita/cierre. La captura desde fotos queda aplazada por indicación del propietario. Los datos reales se introducen en la aplicación, no en el repositorio.
