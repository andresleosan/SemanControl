# SemanControl — tareas

## Cabecera unificada — 2026-10-14

- [x] Marca, navegación y salida en una sola franja blanca de escritorio; contenido sin barra lateral. Rol junto a la marca, enlaces y estados activos conservados.
- [x] Navegación inferior móvil conservada; al atender una tarjeta se oculta y la barra de guardado ocupa todo el ancho.
- [x] Comprobados los tres roles en 320/390/768/1024/1440 px, sin desborde ni superposición; recorrido preservado y salida de sesión con DELETE y retorno a login. Revisión independiente sin bloqueantes.
- [x] `pnpm verify`: 251/251 Vitest, 43/43 SQLite y 4/4 Pages, total 298; TypeScript, lint y compilación Worker correctos.
- [x] Builds/cachés retirados; los 34 archivos controlados de persistencia/configuración conservan su SHA-256. Dependencias conservadas.

[Captura de escritorio](docs/design/screenshots/header-admin-1440.png) y [móvil](docs/design/screenshots/header-admin-390.png), con datos ficticios. Entrega a GitHub autorizada; publicación pendiente.

## Tarjetas con deuda inicial por productos — 2026-10-14

- [x] «Margen por período» pasa a filtro plegado de ganancia. Vista principal simplificada a «Deuda pendiente» y «Ganancia de ventas»; retirado el indicador técnico de aperturas originales.
- [x] Alta y edición tienen formulario exclusivo, sin directorio, filtros, indicadores o historial detrás. Volver conserva la búsqueda; foco inicial espera la carga del catálogo.
- [x] Quitado «Motivo del alta o cambio»; el servidor conserva auditoría con nota automática y valores antes/después.
- [x] El usuario confirmó productos entregados anteriormente. Nueva tarjeta permite seleccionar producto/variante, cantidad y precio anterior editable; calcula deuda inicial. Sin productos conserva importe manual, cero o saldo a favor. No se suman ambas alternativas.
- [x] Importación atómica e idempotente de tarjeta, productos históricos, saldo inicial y auditoría. No descuenta bodega/ruta ni registra ventas o ganancias nuevas. Migración 0005 aditiva; aperturas previas e historial conservados.
- [x] Historial ADMIN/CLIENT y atención WORKER muestran productos de la deuda inicial con su nombre/precio originales. Los abonos siguen afectando el saldo monetario, sin inventar unidades pendientes actuales.
- [x] `pnpm verify`: 251/251 Vitest (13 navegador), 43/43 SQLite y 4/4 Pages, total 298; TypeScript, lint y build Worker correctos. Auditoría sin vulnerabilidades conocidas. Caso focal de formulario en cuatro anchos pasa después de agregar capturas.
- [x] Revisiones independientes de backend y frontend cerradas sin bloqueantes. Corregidos foco durante carga y textos con codificación alterada. Pruebas de respuesta perdida conservan UUID, datos y bloqueo del formulario hasta confirmar.
- [x] Limpieza final de builds/cachés completada; SHA-256 confirma los 34 archivos controlados de persistencia/configuración intactos. Dependencias conservadas para continuar.

[Diseño](docs/superpowers/specs/2026-10-14-tarjetas-deuda-inicial.md), [recuperación](docs/rollback-tarjetas-deuda-inicial.md) y [captura del detalle inicial](docs/design/screenshots/card-opening-products.png). Entrega a GitHub autorizada; migraciones reales y publicación pendientes.

## Bodega por productos y variantes — 2026-10-14

- [x] Quitado «Motivo del cambio» del formulario de producto. La auditoría registra automáticamente actor y metadatos antes/después.
- [x] Producto principal con sabores/variantes, costo/precio y existencias independientes. Catálogo agrupado y buscable; nombres completos en carga de rutas y nuevas ventas de la ficha del cliente.
- [x] Ganancia unitaria y porcentaje sobre costo automáticos: $12.000 → $18.000 = $6.000 y 50 %. Costo cero y pérdidas contemplados.
- [x] Retirado el formulario general «Compras y existencias». Por elección explícita del usuario, alta/edición integra unidades iniciales/a agregar a bodega en un guardado atómico e idempotente.
- [x] «En bodega», «Asignado a rutas» y «Existencias totales» distinguen el inventario libre de la carga restante. Reservas, cierres, saldos y ventas históricas preservados.
- [x] Revisión independiente y regresiones corrigieron auditoría de stock concurrente, énfasis visual de ganancia y reintentos tras respuesta perdida: guardar/corregir conserva solicitud y selección incluso al cambiar de pestaña, sin duplicar ingresos o ajustes.
- [x] Comprobaciones finales: `pnpm test` 210/210 (incluye 12 de navegador), `pnpm test:db` 37/37, `pnpm test:pages` 4/4; total 251. TypeScript, lint, build Worker y auditoría de dependencias correctos.
- [x] Cuatro anchos de catálogo (320/390/768/1440), formularios, filtros, ganancia y compatibilidad del flujo despacho/cierre comprobados con componentes reales y D1 efímero. Capturas ficticias preservadas en docs/design.
- [x] Limpieza final de builds/cachés completada; comparación SHA-256 confirma los 34 archivos controlados de persistencia/configuración sin cambios. Dependencias conservadas para continuar.

Migración aditiva [0004](migrations/0004_product_categories.sql), [diseño](docs/superpowers/specs/2026-10-14-bodega-variantes.md) y [recuperación](docs/rollback-bodega-variantes.md). No se aplicó a datos reales ni se publicó.

## Consulta de clientes para el trabajador — 2026-10-14

- [x] Sección «Clientes» en la navegación móvil y de escritorio del trabajador; conserva el recorrido al volver a ruta o cuadre.
- [x] Consulta de tarjetas activas sin requerir recorrido abierto/asignado: deuda, al día y saldo a favor, búsqueda sin tildes por nombre/dirección/referencia o número exacto y filtros de saldo.
- [x] GET protegido para WORKER activo con proyección mínima, sin correo, costos, margen ni auditoría. No cambia saldos ni requiere migración.
- [x] Copia local aislada por UID, fecha de consulta y aviso de datos sin actualizar. Denegación 401/403 impide recuperar datos guardados hasta una consulta autorizada; regresión comprobada tras fallo de red y recuperación de acceso.
- [x] Verificación final: `pnpm test` 186/186 (incluye 9 pruebas de navegador); `pnpm test:pages` 4/4; `pnpm test:db` 34/34. Total 224. `pnpm typecheck`, `pnpm lint`, `pnpm build:worker` y auditoría de dependencias correctos. Corregida la actualización síncrona inicial detectada por lint antes de la comprobación final.
- [x] Navegador con componentes reales y D1 efímero: búsqueda, estados, ausencia de asignación, caché/revocación y cuatro anchos (320/390/768/1440) sin desborde. Revisión independiente completada sin bloqueantes pendientes.
- [x] `pnpm clean` completado. Comparación SHA-256 confirma los 33 archivos de persistencia/configuración controlados sin cambios. Dependencias conservadas para continuar.

[Captura móvil con datos ficticios](docs/design/screenshots/worker-clients-390.png). Versión revisable; publicación en producción pendiente.

## Revisión y mejora visual de los tres roles — 2026-10-14

- [x] Auditoría de administración, trabajador y cliente contra la especificación; benchmark con MCP de Mobbin y mejoras locales aplicadas.
- [x] Navegación por contexto, tablas administrativas móviles, conciliación filtrable, ruta/progreso, cuadre confirmado/local y tarjeta/historial del cliente.
- [x] `pnpm verify`: 179 Vitest + 34 SQLite + 4 Pages (217 pruebas), TypeScript, lint y build pasan. Suite de navegador final 7/7 y rebuild posterior a ajustes pasan; auditoría sin vulnerabilidades conocidas.
- [x] 28 casos visuales (7 pantallas × 320/390/768/1440), con Manrope compilada: sin desborde ni errores JavaScript. Estrés de cifras, recorrido preservado y foco de apertura/retorno comprobados.
- [x] Revisión independiente: corregidos KPIs estrechos, títulos bajo encabezado fijo y etiqueta de saldo inválido. Sin cambios de backend, permisos ni cálculo contable.

[Análisis, referencias Mobbin, capturas y límites](docs/design/README.md). Cambios locales; la publicación no forma parte de esta tarea.

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

- [x] Piloto manual en producción completado con tres tarjetas y un producto ficticios marcados PRUEBA, por elección del propietario. Trabajador con Google real, aperturas, abono, entrega fiada, entrega con abono, sincronización y cierre comprobados. Efectivo esperado/recibido $15.000, cuatro kits devueltos, ocho unidades totales/disponibles y cero diferencias; un cierre y una auditoría de cierre.
- [ ] Ampliar la prueba manual a operación sin conexión y comprobantes antes del arranque real. La captura de tarjetas desde fotos sigue aplazada. La prueba actual conserva sus datos ficticios; no se ha declarado validación manual de estos flujos adicionales.

## Instalación desde la landing — 2026-10-14

- [x] Botones con icono «Instalar app» en cabecera/hero; aviso nativo compartido y ayuda accesible cuando no está disponible, sin declarar instalación solo por aceptar el aviso.
- [x] PNG192/512 y Apple180 derivados del favicon Ruta; identidad y destino de inicio de la PWA conservados.
- [x] Suite 179/179, seis pruebas nuevas de instalación, lint, TypeScript, auditoría y build de producción correctos. QA Chrome en seis anchos y once comprobaciones HTTP locales correctas; revisión independiente sin bloqueantes.
- [x] Corregido snapshot de auditoría JSON null en altas de tarjeta, reproducido por el test operativo existente antes y después.
- [x] Publicado código `807d0f8` y Worker `d7b6c2f8-b013-4fce-81f3-b84c5037b7de`; once comprobaciones HTTP públicas correctas, ambos botones visibles en Chrome y sin errores JS. Sin migraciones ni cambios a datos.
- [x] Preview cerrado y builds/cachés limpiados; 29 archivos de persistencia y tres configuraciones locales conservados por comparación de hashes. Dependencias disponibles para continuar.

## Simplificación de la landing — revisión local

- [x] Aplicada la propuesta aprobada con `landing-sin-relleno`: seis secciones, títulos directos, beneficios sin duplicación, roles por nombre y retirada de antetítulos, iconos decorativos, numeración y rutas ornamentales.
- [x] Solicitud de demostración específica hacia el WhatsApp público verificado de ALS DevStudio, con texto preparado y sin envío automático; instalación junto a su explicación en FAQ y en la cabecera.
- [x] `pnpm test`: 258/258 en 18 archivos; `pnpm lint` y `pnpm build` con TypeScript correctos. Revisión independiente sin bloqueantes; Chrome a 320/390/800/1280 px, enlaces internos, FAQ con teclado e ingreso/regreso comprobados.
- [x] Capturas y decisiones actualizadas en [revisión de la landing](docs/landing/README.md). Preview cerrado, viewport restablecido y `pnpm clean` completado; estado D1/R2 conservado.

Estado: validación local completada; commit y push a `main` autorizados por el propietario para publicar mediante Workers Builds. No requiere migraciones.
