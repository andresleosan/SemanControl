# QA de navegador reproducible

Ejecutar desde la raíz con las dependencias instaladas por pnpm:

```powershell
pnpm exec vitest run tests/browser.test.ts
```

La suite usa `@playwright/test` desde Vitest y el Chrome instalado (`channel: "chrome"`, headless). En este equipo se encuentra en `C:/Program Files/Google/Chrome/Application/chrome.exe`. No descarga Chromium. Los hooks abren un servidor HTTP en `127.0.0.1` con puerto aleatorio y lo cierran junto con todos los contextos y Miniflare, incluso si una prueba falla.

## Qué se ejecuta realmente

- Componentes React actuales de ruta, visita, cuadre, inventario, directorio, cierre y Mi cuenta, compilados desde `src/` con esbuild; se usa el CSS fuente y el preflight real de Tailwind.
- Almacenamiento IndexedDB, cola offline, sincronización y compresión WebP mediante canvas del navegador, sin reemplazarlos.
- Servicios actuales de administración y operaciones, a través de un adaptador HTTP de prueba con `createApiRoute`: restricciones de rol, origen, proyección pública de respuestas, validación, transacciones y reglas contables.
- D1 y R2 aislados en memoria mediante Miniflare, con `0001_init.sql`, `0002_operations.sql`, `0003_incidents.sql` y `seed.sql` completos, incluidos sus triggers. La suite consulta SQL y R2 para verificar el resultado; no solo confirma mensajes de pantalla. No modifica `.wrangler/state`.
- `public/sw.js` y `public/offline.html` actuales. El servidor simula `/offline.html` → HTTP 307 → `/offline`, como los assets de Workers, para comprobar que el fallback sigue siendo utilizable en navegación sin conexión.

## Sustituciones y límites

Las sustituciones viven exclusivamente en `tests/browser-fixture/`. Una cookie de fixture selecciona un principal conocido y sustituye la verificación de identidad de Firebase; `useSession`, `getFirebaseAuth` y el cierre de sesión usan esa identidad. El cliente HTTP sigue haciendo solicitudes reales. El límite de frecuencia devuelve éxito en este entorno aislado. `next/link` usa enlaces normales y `usePathname` lee la ruta del navegador.

La suite no verifica el inicio de sesión real con Google, la emisión/renovación de tokens y cookies, el servidor de Next/RSC, la instalación PWA en un teléfono ni un despliegue real de Workers. Esos aspectos requieren las pruebas de autenticación separadas y un entorno configurado con credenciales reales. No existe un bypass de autenticación en `src/` ni en producción.

La integración raíz comprobó además el Worker compilado real en `127.0.0.1:8787`: 22 comprobaciones HTTP de permisos/Origin/recursos y un Chrome sin fixtures abrió `/login`, esperó el service worker, desactivó la red y navegó a `/ruta`. Recibió el fallback público **Tu ruta sigue conservada**, sin errores JS y con ancho 390 px; se detectó el enlace manifest. No sustituyó identidad ni accedió a datos financieros en esa comprobación.

## Escenarios a 390 × 844

1. **Trabajador, banco y cliente:** filtrar y buscar tarjetas; abonar efectivo y entregar dos productos; descartar una respuesta después del commit real; conservar la operación en IndexedDB y reabrirla con el mismo UUID, sin duplicar el movimiento ni el descuento de stock; generar un PNG y comprimirlo a WebP antes de subirlo a R2; registrar la transferencia; declarar el efectivo; confirmar en banco sin descontar dos veces y rechazar mediante un único reverso; consultar productos, abonos y saldo como CLIENT sin costos privados y con rechazo de una API ADMIN.
2. **Pago offline con saldo cambiado:** guardar sin conexión, registrar una visita concurrente con el segundo trabajador, reconectar, observar el conflicto y confirmar explícitamente el mismo cobro. La operación original queda conservada junto a su reemplazo.
3. **Administración:** crear y editar producto, comprar unidades, reservar carga sin cambiar el total, ajustar saldo mediante historial y cerrar un recorrido únicamente después de la declaración del trabajador. Un faltante físico deja stock y devolución auditados.
4. **Service worker:** instalar el código actual tras la redirección del fallback, consultar HTML/API/RSC sin almacenarlos en Cache Storage y navegar offline al mensaje público de recuperación.
5. **Respuestas fuera de orden en ruta y cuadre:** cambiar B → A → B, retener la respuesta A y entregarla después de B. La ruta seleccionada debe conservar su carga y tarjetas, y el cuadre debe conservar sus sobrantes. La prueba espera las escrituras reales de snapshots y el render para observar el resultado tardío.
6. **Alta de tarjeta física con respuesta perdida:** registrar una apertura de $65.000, descartar la primera respuesta del servidor y volver a guardar con el mismo UUID. Solo debe existir una tarjeta y un movimiento de apertura con su motivo y autor.

Todos los escenarios registran errores JavaScript de página y miden `document.documentElement.scrollWidth`; un ancho mayor de 390 px hace fallar la prueba. Las tablas pueden desplazarse dentro de su propio contenedor sin ensanchar la página.

## Evidencia de cada corrida

La suite genera tres capturas de los flujos principales en `.wrangler/test-browser/`:

- `worker-visit.png`
- `admin-reconciliation.png`
- `client-history.png`

Si un escenario falla, agrega `failure-<escenario>-<página>.png` y un JSON con respuestas, operaciones de visita, errores JavaScript y elementos que exceden el viewport. Las capturas muestran datos sintéticos. Son artefactos de QA regenerables; no se sirven como assets de la aplicación.

La limpieza final retira `.wrangler/test-browser` tras revisar las capturas. La siguiente ejecución de la suite vuelve a producirlas.

Durante la implementación esta suite detectó dos formularios con desborde horizontal por el mínimo intrínseco de `fieldset` (513 px en Cierre y 414 px al armar un recorrido). El CSS debe permitir que esos formularios se ajusten al viewport; la prueba conserva la medición para impedir una regresión.

También reprodujo una respuesta atrasada que vaciaba el selector y las tarjetas en Mi ruta. Los contadores de solicitudes en ruta/cuadre y la lista de recorridos conservada por UID evitan que esa respuesta reemplace la selección actual.

Última verificación local: **14 de octubre de 2026, 7 de 7 pruebas aprobadas**, comando anterior, exit code 0, duración 15,36 s. Esto confirma los escenarios de esta fixture; no constituye una validación de Google Sign-In ni un despliegue a producción.

## Google real — 14 de octubre de 2026

Después de enlazar `semancontrolapp`, el propietario completó Google Sign-In desde una pestaña independiente sin Browser Use. El Worker compilado local confirmó `POST /api/auth/session` 200; D1 enlazó el UID del ADMIN preautorizado. Navegación y APIs de Cierre, Bodega y Tarjetas respondieron 200. La primera prueba en una pestaña automatizada quedó detenida al retornar a Firebase; la herramienta informó una respuesta de documento pausada y el problema desapareció al completar el acceso fuera de ese control. No se cambió el flujo del producto para resolverlo.

Esta comprobación cubre identidad real y navegación ADMIN en local. No demuestra todavía un acceso en el dominio público actualizado ni una prueba manual de cierre/renovación; estos últimos conservan su cobertura automatizada.

Tras la confirmación de publicación se verificó `https://semancontrol.pages.dev/login` en Chrome: botón Google habilitado y cero errores JS. Se completaron 13/13 comprobaciones HTTP públicas de configuración Firebase, permisos, Origin, cookie Secure y recursos PWA. Versión publicada: `022bea53-5fd5-4d63-831d-a7c6cac40dcd`. No se repitió el consentimiento Google dentro de Browser Use; el propietario puede acceder desde su pestaña normal.

## Landing publicada — 14 de octubre de 2026

La portada y su enlace Ingresar se verificaron en Chrome sobre el dominio público tras publicar `e74e8c9b-618a-42bd-bd2f-ce39a19d77d6`: contenido correcto, Google habilitado en `/login` y sin errores JS en ambas pantallas. Las 16 comprobaciones HTTP públicas de marketing, SEO, permisos, sesión y PWA fueron correctas. La revisión local cubrió cinco anchos de 320 a 1280 px, FAQ con clic/Enter, contraste y enlaces; la evidencia móvil se corrigió con una captura del viewport real. [Informe y capturas](landing/README.md).
