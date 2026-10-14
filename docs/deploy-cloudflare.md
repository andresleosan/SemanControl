# Publicar SemanControl en Cloudflare

La aplicación completa se ejecuta en un Worker OpenNext. El proyecto Pages `semancontrol` conserva `https://semancontrol.pages.dev` y reenvía todas las solicitudes al Worker con un Service binding. D1, comprobantes R2 privados, permisos y límite de sesiones permanecen en el Worker.

`wrangler.toml` sigue siendo la configuración local. `wrangler.production.toml` configura los recursos remotos; los scripts de producción siempre seleccionan ese archivo. No se aplica el seed sintético en producción ni se copia `.wrangler/state` a Cloudflare.

## Configuración que se debe completar

Esta publicación tiene Google Sign-In pendiente por elección del operador. `vars.FIREBASE_PROJECT_ID=""` deja la autenticación sin configurar: el verificador rechaza los tokens con 503 `AUTH_NOT_CONFIGURED`, sin permitir acceso a datos privados. Los recursos Cloudflare ya están confirmados. Para habilitar Google después, establece el project ID real y completa las cuatro variables públicas antes de volver a compilar:

| Campo | Valor requerido |
| --- | --- |
| `vars.FIREBASE_PROJECT_ID` | ID del proyecto Firebase que emitirá los tokens. |
| `d1_databases.database_name` | `semancontrol-db`. |
| `d1_databases.database_id` | UUID de esa misma base D1, ya configurado; nunca el identificador ficticio local. |
| `r2_buckets.bucket_name` | `semancontrol-receipts`, con acceso público deshabilitado. |
| `ratelimits.namespace_id` | `10014317`, elegido para este rate limiter; reservarlo para SemanControl dentro de la cuenta. |

`APP_ORIGIN` ya contiene el origen público exacto `https://semancontrol.pages.dev`. `NEXTJS_ENV=production` selecciona el entorno de producción del adaptador. Los IDs, nombres de recursos y configuración pública Firebase no son contraseñas. Las credenciales de Cloudflare se gestionan mediante la sesión Wrangler o secretos del entorno de despliegue, sin guardarlas en los TOML.

El Worker y ambos Service bindings usan el nombre `semancontrol`. Si se cambia el nombre del Worker, actualizar `name` y `WORKER_SELF_REFERENCE.service` en producción, además de `SEMANCONTROL.service` en `deploy/pages/wrangler.toml`.

## Firebase y acceso inicial

Para habilitar Google, completa las cuatro variables públicas de `.env.example` en `.env.production.local` (archivo ignorado por Git) o en las variables del entorno de build:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

Usa los valores de la app web Firebase real. El project ID debe coincidir con `FIREBASE_PROJECT_ID` del Worker. Mantén el authDomain proporcionado por Firebase; cambiarlo a `pages.dev` exigiría alojar/proxificar también los helpers de autenticación de Firebase.

En Firebase Authentication habilita Google y añade `semancontrol.pages.dev` a los dominios autorizados. El administrador inicial necesita un correo Google preautorizado en D1; no existe alta automática de administradores. Una autenticación Google correcta con correo desconocido devuelve 403.

Mientras Google permanezca pendiente, publica sin esas variables y el botón de acceso debe permanecer deshabilitado con un mensaje claro. No configures tokens ficticios, un bypass ni una identidad de administrador en el navegador. Las variables `NEXT_PUBLIC_*` quedan incorporadas al JavaScript del navegador al compilar. Cambiarlas requiere un build nuevo. Los valores `[vars]` del TOML son la fuente de configuración runtime de este despliegue; no confiar en valores distintos del dashboard que el TOML pueda sobrescribir.

## Verificar, preparar D1 y publicar

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm test:pages
pnpm test:db
pnpm typecheck
pnpm lint
pnpm check:pages
pnpm build:production
pnpm exec wrangler deploy --config wrangler.production.toml --dry-run
```

El último comando valida el paquete sin publicarlo. La publicación inicial permite revisar la interfaz de acceso con Google pendiente; no demuestra un inicio de sesión completo. Para activar la operación privada, recompila con Firebase real y comprueba autenticación y recursos contra una base de prueba antes de usar datos de negocio.

Revisa las migraciones pendientes con el archivo correcto:

```powershell
pnpm exec wrangler d1 migrations list DB --config wrangler.production.toml --remote
```

Antes de aplicar una migración sobre una base existente, exporta un backup a una ubicación privada fuera del repositorio y revisa [el procedimiento de recuperación](rollback-fases-2-4.md). Con el despliegue y la migración acordados sobre la versión final, aplica únicamente las migraciones revisadas:

```powershell
pnpm exec wrangler d1 migrations apply DB --config wrangler.production.toml --remote
pnpm deploy:production
pnpm deploy:pages
```

Publica primero el Worker y luego el puente. Los comandos `deploy` publican builds ya generados; no recompilan ni migran D1 implícitamente. El proyecto Pages debe existir en la misma cuenta con rama de producción `main`. Su configuración estándar está en `deploy/pages/wrangler.toml`, porque Pages deploy no admite una ruta de configuración personalizada. `pnpm deploy:pages` ejecuta el binario instalado en la raíz mediante un helper Node, con directorio de trabajo real `deploy/pages` y sin shell intermedio. El helper selecciona la cuenta confirmada mediante `CLOUDFLARE_ACCOUNT_ID`: Pages no acepta `account_id` en su TOML. Si se cambia de cuenta, actualizar ese identificador público en el helper y `account_id` en el TOML del Worker.

El Worker deshabilita `workers.dev` y URLs de versión/preview; el acceso público previsto es Pages. Verifica después de publicar: `/login`, redirección de `/admin/cierre` sin sesión al mismo dominio, Google real, el POST de sesión, cookie Secure, renovaciones, cierre de sesión y descarga privada de comprobantes según rol. Las pruebas locales con tokens RSA sintéticos no demuestran Google Sign-In real.

## Qué conserva el puente

`deploy/pages/public/_worker.js` pasa el Request original a `env.SEMANCONTROL.fetch(request)` y devuelve la respuesta directamente. Conserva método, URL/query, Origin, Authorization, Cookie, cuerpo, Set-Cookie, Location, códigos de error y streaming. No agrega caché ni cambia Host. `_routes.json` incluye todas las rutas, también assets y PWA, para servir siempre la misma versión del Worker.

El backend exige `Origin` exactamente igual a `APP_ORIGIN` para mutaciones. Los dominios alternativos de previews Pages no se autorizan automáticamente. Para previews operativas usa un Worker, D1 y bucket separados con su origen específico; no ampliar el control de origen basándose en headers proporcionados por el navegador.

`pnpm test:pages` utiliza un backend local en proceso, sin red ni credenciales. Comprueba el contrato de transporte del puente; la autorización sigue cubierta por las pruebas del servidor.

## Builds desde GitHub

Después de conectar `andresleosan/SemanControl` al Worker en Workers Builds, configura:

| Ajuste | Valor |
| --- | --- |
| Rama de producción | `main` |
| Comando de build | `pnpm build:production` |
| Comando de deploy | `pnpm deploy:production` |
| `PNPM_VERSION` | `11.23.0` |
| `NODE_VERSION` | Una versión Node 22 o superior ya verificada. |
| Variables del build | Las cuatro `NEXT_PUBLIC_FIREBASE_*`. |

Las variables del build y las variables runtime son independientes. El puente Pages se publica desde `deploy/pages` con su propio TOML; su contenido no necesita recompilar Next.js. Coordina ambos despliegues si cambia el nombre del Worker o el contrato del puente.

Después de verificar y publicar, `pnpm clean` retira los builds y cachés raíz, además de `deploy/pages/.wrangler/tmp`. Conserva cualquier directorio `state`. `pnpm clean:all` también retira las dependencias regenerables.

## Referencias

- [OpenNext en Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)
- [CLI OpenNext y opción `--config`](https://opennext.js.org/cloudflare/cli)
- [Variables de build y runtime](https://opennext.js.org/cloudflare/howtos/env-vars)
- [Pages Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)
- [Service bindings Pages](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)
- [Reenvío HTTP mediante Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)
- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
