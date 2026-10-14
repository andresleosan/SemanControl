# SemanControl

SemanControl digitaliza tarjetas de fiado y recorridos de cobro. Las Fases 1–4 incluyen operación del trabajador, bodega/cierre/cartera del administrador y tarjeta del cliente. Next.js App Router, TypeScript, Tailwind, Firebase Google, Workers/OpenNext, D1 y R2 privado.

La [landing comercial](docs/landing/README.md) está publicada en [semancontrol.pages.dev](https://semancontrol.pages.dev/), con demostración y contacto hacia ALS DevStudio; el acceso a la app sigue en `/login`.

## Qué incluye

- Configuración ejecutable de Next.js y Workers, bindings tipados `DB`, `RECEIPTS_BUCKET` y límite de creación de sesiones.
- Migración completa con restricciones de cantidades, reservas, movimientos auditables y reverso único de transferencia.
- Seed sintético: un administrador, dos trabajadores, cinco productos, un recorrido abierto con carga y diez clientes ordenados, sin teléfono. Cada saldo tiene un asiento de apertura.
- Verificación criptográfica de ID tokens Firebase, roles desde D1, middleware y helpers para autorizar cada handler.
- `/ruta`, atención de tarjeta y `/ruta/resumen`: carga compartida, cobros individuales, búsqueda/filtros, compresión WebP, QR y cola privada por UID/recorrido.
- `/admin/inventario`, `/admin/cierre`, `/admin/clientes`: productos, compras/ajustes de stock, despachos, trabajadores, cuadre físico, conciliación bancaria y altas con apertura auditada.
- `/mi-cuenta`: saldo e historial exclusivo del cliente, incluidos productos y comprobantes privados.
- `/login`, `/sesion` y `GET/POST/DELETE /api/auth/session`: Google, roles, renovación y cierre; el login abre el destino comercial del rol.
- Proyecciones de producto sin costo y protección adicional contra su serialización fuera de una API administrativa autorizada.

## Ejecutar en local

Requisitos: Node.js 22 o superior, pnpm 11.23.0 y Python 3 para las pruebas SQLite. El gestor está fijado en `packageManager`; el único lockfile del proyecto es `pnpm-lock.yaml`.

```powershell
pnpm install --frozen-lockfile
pnpm cf:typegen
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Abre `http://localhost:3000/login`. La base y los bindings usan simulaciones locales y no requieren crear recursos Cloudflare. Para comprobar el Worker compilado:

```powershell
pnpm build:worker
pnpm preview
```

`preview` usa normalmente `http://localhost:8787`. OpenNext avisa que el soporte Windows es parcial; se verifica el build y la ejecución local aquí. Para un pipeline de producción se recomienda Linux/WSL o CI Linux según [OpenNext](https://opennext.js.org/cloudflare).

## Configurar Google Sign-In real

El proyecto enlazado es `semancontrolapp`, con app web `1:377945438832:web:766ea96b50ec272ab512b5` y dominio `semancontrolapp.firebaseapp.com`. Google y los dominios local/producción ya están configurados. Los archivos `.env.local`, `.env.production.local` y `.dev.vars` de esta máquina contienen la configuración; no se versionan. Para otra máquina, recupera los valores con `firebase apps:sdkconfig WEB 1:377945438832:web:766ea96b50ec272ab512b5 --project semancontrolapp` y sigue los pasos siguientes. La identidad usa Firebase; cartera, inventario y permisos permanecen en D1 y los comprobantes en R2. Firestore no se utiliza, por decisión del propietario.

1. Crea o elige un proyecto Firebase, registra una app web y activa Authentication → Google.
2. Autoriza `localhost` y, cuando exista, el dominio de producción en Firebase Authentication.
3. Copia `.env.example` a `.env.local` y completa las cuatro variables `NEXT_PUBLIC_FIREBASE_*` desde la configuración de la app web. Son configuración pública; no añadas credenciales de cuenta de servicio.
4. Copia `.dev.vars.example` a `.dev.vars` y fija `FIREBASE_PROJECT_ID` al mismo proyecto. Actualiza también ese identificador público en `wrangler.toml` y regenera tipos. Mantén `NEXTJS_ENV=development` y `APP_ORIGIN=http://localhost:3000` en la copia local. Abre dev usando `localhost:3000`; `pnpm preview` fija su origen en `127.0.0.1:8787`.
5. Sustituye el correo sintético de un usuario preautorizado por el correo Google que probará su rol. Por ejemplo, únicamente en la base de prueba:

```powershell
pnpm exec wrangler d1 execute semancontrol-db --local --command "UPDATE users SET email = 'tu-correo@gmail.com' WHERE id = 'admin-demo' AND firebase_uid IS NULL;"
```

Para WORKER usa `worker-demo-1` o `worker-demo-2`. Para CLIENT configura `clients.linked_email` en `client-demo-01`; no necesita una fila CLIENT en `users`. No uses el mismo correo para probar varios roles. Normaliza los correos a minúsculas, sin espacios. Reinicia el servidor o vuelve a compilar si cambias las variables públicas del navegador.

Un correo desconocido recibe 403. El primer acceso enlaza el UID solo si está vacío; uno existente nunca se reemplaza automáticamente. Los usuarios ADMIN/WORKER se preaprovisionan explícitamente. ADMIN puede gestionar trabajadores y cambiar/desvincular el correo de una tarjeta con motivo; ese cambio elimina el UID anterior e invalida sus QR pendientes en el mismo batch. Desactivar el usuario o la tarjeta revoca permisos en la siguiente solicitud.

## Contratos y operación

`authenticate(request, env)` valida JWT y devuelve `Principal`. `apiRoute` autentica y exige el rol también dentro del handler, aunque el middleware proteja su ruta. `principal.clientId` identifica la única tarjeta del CLIENT. La sesión devuelve `{user, redirectTo}` y el login abre `/admin/cierre`, `/ruta` o `/mi-cuenta` según el rol. Los [contratos API](docs/contratos-api.md) documentan las operaciones y sus conflictos.

POST sesión requiere Bearer y Origin igual al origen público configurado en `APP_ORIGIN`; DELETE y las mutaciones comerciales exigen el mismo origen. No se confía en Host ni headers reenviados por el cliente. GET acepta Bearer o cookie. La cookie contiene el ID token, es HttpOnly y SameSite=Lax, Secure en HTTPS y vence con el token. `client-api` renueva tokens/cookie, detecta cambio de cuenta y falla explícitamente si Firebase no puede renovar la identidad. La verificación no consulta revocación remota de Firebase; los permisos locales D1 se consultan por request.

Las consultas públicas de productos no seleccionan `cost_price`. Para leerlo, se exige ADMIN y una ruta canónica `/api/admin/*`; la respuesta usa el helper de seguridad. No confíes en esconder un campo en la interfaz ni en un header de rol enviado por el navegador.

`total_stock` incluye bodega y calle. Entregar disminuye primero `dispatch_inventory.remaining_qty` y después `products.total_stock` en el mismo D1 batch, junto al saldo y el historial. Guardias SQL convierten UPDATE de cero filas en errores que revierten todo. Cerrar libera reservas, conserva sobrantes y registra efectivo/mercancía recibidos; solo una diferencia física con motivo genera ajuste de stock. No reañade la carga sobrante. Consulta [modelo de datos](docs/modelo-datos.md) y [recuperación](docs/rollback-fases-2-4.md).

ADMIN importa tarjetas físicas con saldo de apertura (OPENING); correcciones posteriores usan ADJUSTMENT. El margen suma cantidad × (precio fiado − costo maestro guardado al vender), no cobros ni utilidad neta. El costo histórico queda dentro de D1 y solo se utiliza en APIs ADMIN.

La ruta abierta permite atender tarjetas descargadas sin señal y conserva UUID, importes y fotos en IndexedDB. Solo una confirmación del servidor marca **Registrada**; conflictos se revisan explícitamente. La PWA nunca cachea HTML/API autenticados. Reabrir o recargar sin señal presenta un mensaje público; vuelve a la pestaña que ya estaba abierta o espera conexión para verificar la misma cuenta. No borres el almacenamiento del navegador con pendientes.

Cada trabajador declara haber sincronizado sus teléfonos antes de cerrar. Una operación tardía de un recorrido cerrado se envía como incidencia privada al administrador, sin reabrir ni cobrar nuevamente. ADMIN revisa el banco/cuadre físico, registra la compensación necesaria y vincula su ID; el sistema no aplica la compensación dos veces.

## Verificación

```powershell
pnpm test
pnpm test:db
pnpm typecheck
pnpm lint
pnpm build:worker
pnpm audit
python scripts/smoke_worker.py
```

Las pruebas de JWT firman tokens con claves RSA locales y las de autorización usan D1 real simulado por Miniflare. Esto no sustituye una prueba de Google Sign-In en el proyecto Firebase real. No hay bypass de autenticación ni credenciales reales dentro de fixtures.

El smoke HTTP requiere `pnpm preview` en otra terminal. También se puede ejecutar contra `pnpm dev` con `python scripts/smoke_worker.py --url http://localhost:3000`. Solo admite servidores locales y comprueba acceso, redirecciones, solicitudes sin sesión, token inválido, Origin, cierre de cookie y recursos PWA. Las pruebas de navegador usan Chrome instalado y datos D1/R2 efímeros; lee [QA de navegador](docs/qa-browser.md) para sus límites y ejecución.

Los overrides de `pnpm-workspace.yaml` conservan versiones corregidas de `@grpc/grpc-js` y `glob`; el linter usa ESLint + TypeScript + React Hooks para evitar una dependencia sin parche de `braces`. Miniflare se alinea con la versión que trae Wrangler. El lockfile fija la instalación verificada. `allowBuilds` autoriza solamente las versiones revisadas de `esbuild`, `protobufjs`, `@firebase/util` y `workerd`; no habilites indiscriminadamente scripts de otros paquetes.

## Reducir el peso local

```powershell
pnpm clean
# También retirar dependencias locales cuando no se va a trabajar:
pnpm clean:all
```

La limpieza elimina builds, cachés y temporales; conserva código, lockfile, configuración y `.wrangler/state` con D1/R2 local. `clean:all` también elimina `node_modules`; para continuar se ejecuta `pnpm install --frozen-lockfile`. El store compartido de pnpm permanece fuera de esta carpeta y se reutiliza en las siguientes instalaciones. Las rutas de limpieza son fijas y se comprueba que estén dentro del proyecto antes de borrarlas. No se incluye la caché global de otros proyectos.

## Producción

El entorno remoto se configura en `wrangler.production.toml`; `wrangler.toml` conserva la base local de desarrollo. La aplicación se publica en un Worker y el puente Pages conserva [semancontrol.pages.dev](https://semancontrol.pages.dev/). Los recursos D1/R2 remotos están separados de los datos sintéticos locales. Consulta [la guía de publicación](docs/deploy-cloudflare.md) para compilar, aplicar migraciones y desplegar con pnpm.

**Google Sign-In está activo en producción desde el 14 de octubre de 2026.** El proyecto `semancontrolapp`, sus cuatro variables públicas y el `FIREBASE_PROJECT_ID` del Worker están enlazados. La publicación fue confirmada por el propietario y pasó 13 comprobaciones HTTP públicas, además de la revisión del acceso en Chrome. Google real y navegación ADMIN se comprobaron previamente en local. Las pantallas privadas permanecen protegidas. No se ha cargado el seed en producción; el administrador inicial ya fue preautorizado en D1 con el correo confirmado por el propietario. Consulta [la integración Firebase](docs/firebase-auth.md) para conocer la validación y el rollback.

El favicon activo es la opción **3, Ruta**. Las [tres propuestas originales](docs/favicon-options/preview.html) están disponibles para comparar.

La especificación está en [SPEC_SEMANCONTROL.md](SPEC_SEMANCONTROL.md), decisiones y costo previsto en [STACK.md](STACK.md), y avance en [tasks.md](tasks.md). La [propuesta de Fases 2–4](docs/propuesta-fases-2-4.md) está aprobada y aplicada.
