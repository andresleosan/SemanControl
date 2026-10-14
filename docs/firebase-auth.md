# Firebase Authentication — 14 de octubre de 2026

## Configuración enlazada

- Proyecto: `semancontrolapp` (número `377945438832`).
- App web: `SemanControl`, ID `1:377945438832:web:766ea96b50ec272ab512b5`.
- Dominio de autenticación: `semancontrolapp.firebaseapp.com`.
- Google habilitado; dominios autorizados: `semancontrol.pages.dev`, `localhost`, `127.0.0.1`, `semancontrolapp.firebaseapp.com` y `semancontrolapp.web.app`.
- `.firebaserc` selecciona el proyecto; ambos TOML usan `FIREBASE_PROJECT_ID=semancontrolapp`.
- Las cuatro variables públicas del SDK se recuperaron de Firebase y se guardaron en `.env.local` y `.env.production.local`; `.dev.vars` configura desarrollo. Los tres archivos y los logs Firebase están ignorados por Git. No se creó ni descargó una clave privada de cuenta de servicio.

El propietario confirmó conservar D1 para permisos, cartera e inventario y R2 privado para comprobantes. Firestore existe en `us-east1`, pero no se usa ni recibe datos de la app. Sus reglas actuales deniegan todas las lecturas y escrituras; se verificaron sin modificarlas.

El ADMIN de producción continúa preautorizado y activo. No se ejecutó seed, migración ni cambios manuales sobre los datos remotos. Para probar Google en desarrollo se preautorizó el mismo correo únicamente en el usuario local `admin-demo`, después de exportar `.wrangler/backups/before-firebase-local.sql`.

## Cambio de código y comprobaciones

El cliente HTTP ahora rechaza una petición privada si Firebase confirma que no hay usuario conectado. Esto impide reutilizar una cookie de una cuenta anterior. La regresión reprodujo primero ese acceso incorrecto; tras la corrección devuelve `401 AUTH_REQUIRED` antes de enviar la petición. El caso deliberadamente sin configuración conserva su comportamiento anterior.

- `pnpm test`: 173/173 pruebas Vitest, incluidas siete de navegador con datos D1/R2 aislados.
- `pnpm test:pages`: 4/4 pruebas del puente Pages.
- `pnpm test:db`: 34/34 pruebas SQLite. Total: 211 pruebas.
- `pnpm typecheck` y `pnpm lint`: exit 0.
- `pnpm audit`: ninguna vulnerabilidad conocida.
- `pnpm check:pages`: puente compilado correctamente.
- `pnpm build:production`: build Next.js/OpenNext correcto, con las variables reales incorporadas.
- `pnpm exec wrangler deploy --config wrangler.production.toml --dry-run`: correcto, 40 assets y Worker de 1504,72 KiB gzip. No publica.
- `pnpm preview` y `python scripts/smoke_worker.py`: 22/22 comprobaciones HTTP locales correctas.
- `pnpm exec wrangler d1 migrations list DB --config wrangler.production.toml --remote`: ninguna migración pendiente.
- Revisión independiente de autenticación/configuración: sin hallazgos bloqueantes.

La versión compilada muestra el botón Google habilitado y abre el selector real de cuentas con el OAuth client del proyecto correcto. La primera prueba regresó al callback Firebase, pero quedó detenida antes del POST de sesión. El propietario reprodujo el bloqueo y la herramienta reportó una respuesta de documento pausada por Browser Use. Los helpers HTML/JS de Firebase responden 200; el 404 de `init.json` es tolerado explícitamente por el helper oficial. No se cambió el flujo de autenticación para intentar compensar esa interferencia.

El propietario confirmó que el acceso real funciona desde una pestaña independiente, fuera del control automatizado: **«Ahora entra al panel»**. D1 local confirma el usuario `admin-demo` activo, rol `ADMIN` y UID enlazado. Esto valida la identidad Google real y la resolución del permiso local; el bloqueo anterior quedó limitado a la prueba controlada por Browser Use. No se modificó el producto para resolverlo. La renovación/cierre se cubren por las pruebas automatizadas; no se afirma una prueba manual adicional de esos pasos.

El Worker local registró `POST /api/auth/session` 200 y navegación autenticada 200 a Cierre, Bodega y Tarjetas, junto con sus APIs administrativas. No se recopilaron ni registraron cookies, tokens o contenidos financieros en esta evidencia.

La versión local está validada y el propietario confirmó publicar la versión final. Tras comprobar el despliegue se cerró el servidor de preview y se ejecutó `pnpm clean:all` con exit 0. Se retiraron dependencias, builds, cachés y temporales regenerables. Los hashes anteriores/posteriores confirman que los 31 archivos de persistencia local D1/R2 y los tres archivos locales de configuración se conservaron sin cambios. Fuente, lockfile, backups y store compartido de pnpm permanecen.

## Publicación y recuperación

El propietario confirmó el despliegue y se ejecutó `pnpm deploy:production` con exit 0 el 14 de octubre de 2026. El Worker `semancontrol` está activo al 100 % con la versión **`022bea53-5fd5-4d63-831d-a7c6cac40dcd`**. El puente Pages existente ya apunta al mismo Worker y no necesitó volver a publicarse. No se aplicaron migraciones ni seed.

Validación pública sobre `https://semancontrol.pages.dev`: **13/13 comprobaciones HTTP**, verificadas a las 17:16 de America/Bogota. Incluyen login 200 con Google habilitado y configuración Firebase correcta en los chunks publicados; redirecciones de las tres áreas privadas; API sin sesión 401; Origin incorrecto 403; JWT inválido 401; cierre de cookie Secure/HttpOnly/SameSite=Lax; manifest, service worker e icono 200. Chrome mostró el botón **Continuar con Google** y cero errores JS. El inicio de sesión real del ADMIN se probó en local; no se automatizó nuevamente el consentimiento en producción por la interferencia documentada de Browser Use.

Versión anterior activa comprobada antes de publicar: `3fad04e5-7cab-4762-ae3c-a6c87579d92a`. Si la actualización falla, volver a ella con:

```powershell
pnpm exec wrangler rollback 3fad04e5-7cab-4762-ae3c-a6c87579d92a --config wrangler.production.toml
```

Ese rollback recupera el acceso pendiente del despliegue anterior y conserva D1/R2. No borra los usuarios creados al iniciar sesión en Firebase ni deshace vínculos UID realizados por accesos legítimos; no es necesario borrar identidades para revertir el Worker. Los dominios anteriores de Firebase se guardaron en `.wrangler/firebase-auth-domains-before.json` por si se necesita revisar su configuración.

Para reconstruir en otra máquina o en Workers Builds se deben establecer las cuatro `NEXT_PUBLIC_FIREBASE_*` antes del build. Recuperarlas desde la app web oficial según la guía de publicación; los archivos locales ignorados no viajan a GitHub.
