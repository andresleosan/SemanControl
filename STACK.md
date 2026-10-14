# SemanControl — decisiones de base

## Gestor de paquetes y espacio local

Se usa pnpm 11.23.0 por preferencia del usuario, con versión fijada en package.json y un único pnpm-lock.yaml importado desde la instalación verificada. Los overrides y scripts de instalación permitidos se configuran en pnpm-workspace.yaml. OpenNext detecta el gestor por lockfile; se retiró package-lock.json para que use pnpm.

pnpm enlaza paquetes desde un store compartido en la misma unidad, evitando copias entre proyectos. No reduce por sí solo el contenido de Next.js/Firebase ni sus builds: `pnpm clean` retira archivos regenerables y `pnpm clean:all` también node_modules, conservando datos locales. [Estructura oficial](https://pnpm.io/symlinked-node-modules-structure), [importación del lockfile](https://pnpm.io/cli/import).

Se configura `nodeLinker: hoisted` y `packageImportMethod: hardlink`. Se reprodujo un fallo de enlaces al empaquetar OpenNext con pnpm isolated en Windows; el layout hoisted mantiene pnpm y su store compartido con una estructura que el adaptador puede copiar. Esta elección evita pedir WSL o modificar el adaptador. [Caso del proyecto OpenNext](https://github.com/opennextjs/opennextjs-cloudflare/issues/414), [opciones oficiales de pnpm](https://pnpm.io/settings/node-modules).

## Arquitectura

Monolito modular Next.js App Router + TypeScript. Las consultas D1 y operaciones R2 viven en servidor, a través de bindings Workers por request. Se elige OpenNext (`@opennextjs/cloudflare`) y runtime Node.js de Next.js con `nodejs_compat`; `wrangler.toml` se conserva por el requisito del proyecto. No se separan servicios porque el negocio inicial tiene un equipo, una base y ciclos de entrega comunes. No se usa `next-on-pages`, cuyo repositorio está archivado.

Referencias: [OpenNext setup](https://opennext.js.org/cloudflare/get-started), [bindings](https://opennext.js.org/cloudflare/bindings), [estado de next-on-pages](https://github.com/cloudflare/next-on-pages).

Next.js se fija en **16.3.8**. Se probó 16.4.0: compilaba, pero la ejecución en Workers fallaba al cargar `preview-props.json`; se confirmó el problema en [OpenNext #1355](https://github.com/opennextjs/opennextjs-cloudflare/issues/1355). No se parchea código generado ni node_modules; se usa una versión que el adaptador admite y se verifica con HTTP real.

Se conserva `middleware.ts` en el runtime Edge por compatibilidad de OpenNext. Next.js 16 avisa que la convención se llama ahora `proxy`; su runtime Node de middleware todavía no es compatible en este adaptador, según [su matriz de soporte](https://opennext.js.org/cloudflare). El aviso no impide build ni ejecución, comprobados con solicitudes HTTP. La autorización de cada operación también vive en helpers del servidor, no depende únicamente del middleware.

## Identidad y permisos

Firebase web SDK solo Google. El backend verifica firma RS256 y claims del ID token mediante jose y claves públicas de Google. No necesita clave privada de una cuenta de servicio para esta verificación. D1 decide roles y tarjeta accesible; no se aceptan roles enviados por el navegador. Las API consultan estos permisos por request y las cookies de acceso son HttpOnly, SameSite=Lax, Secure en HTTPS y limitadas a la vigencia del token. `APP_ORIGIN` define el origen público autorizado para POST/DELETE de sesión y si la cookie debe ser Secure; no se usa el URL interno reconstruido por Next.js para esos controles. El SDK refresca su ID token al usar el cliente; un token vencido requiere renovar sesión. La revocación local inmediata se realiza desactivando `users.is_active` o la tarjeta/vínculo correspondiente. La verificación offline de firma no consulta revocación en Firebase; esa integración adicional se evaluará si se administra revocación desde su consola.

Referencia: [verificación oficial de Firebase](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

## Identidad visual inicial

Base de acceso, sin definir aún las vistas comerciales. Referencias de categoría consultadas: [Alegra Colombia](https://www.alegra.com/colombia/) y [Siigo](https://www.siigo.com/). Ambas agrupan operaciones financieras con verbos directos y acceso separado; la decisión para SemanControl se adapta al recorrido de los viernes y al uso con una mano, sin copiar assets ni pantallas.

- Fondo #f3f6f8 y superficie blanca: legibilidad en la calle, sin fondos decorativos.
- Texto #172b3a y secundario #405766: contraste alto para dirección y dinero.
- Acción #155f4b: identifica el único siguiente paso; foco #1558aa: distingue navegación de teclado.
- Tipografía Arial/system sans para texto y tabular-nums para cifras: funciona sin descargar fuentes y evita cambios de ancho al actualizar saldos.
- Layout vertical estrecho, acciones de al menos 48px; tono claro y práctico.
- Firma: el número de tarjeta/ruta es el ancla visual, por la secuencia física del negocio. Iconos Lucide y cifras tabulares, sin emojis.

## Costos previstos

Esta fase se ejecuta completamente en local y no crea servicios facturables. Estimación de producción, no contrato: para unos 100 clientes y 4–5 recorridos/mes, aproximadamente 500 visitas y hasta 50 MB/mes de captures de 100 KB, D1 y R2 Standard deberían caber en sus cuotas gratuitas bajo estas hipótesis. Workers puede usar plan gratuito si CPU y tamaño del bundle lo permiten; reservar aproximadamente US$5/mes de base si requiere Workers Paid, más excesos de uso y dominio. El tamaño comprimido se comprueba al construir; no asumir que Next.js entra en Free. Google Sign-In no requiere SMS ni autenticación telefónica.

Referencias consultadas el 2026-10-14: [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/). No se verificaron alertas de facturación de una cuenta real porque no se conectó ni se desplegó; configurarlas al habilitar producción. La estimación depende de consultas indexadas y volumen real de lectura/CPU.

Medición final Fases 1–4: dry-run de Wrangler reportó **1504.13 KiB gzip** para el Worker y 40 assets. El tamaño por sí solo entra en Free. CPU y tráfico de producción aún no se midieron, por lo que el costo previsto sigue condicionado al uso. Una transferencia excepcional puede ocupar hasta 500 KB; con 500 comprobantes/mes en ese máximo serían aproximadamente 250 MB/mes, sin contar retención histórica. La estimación normal de 50 MB/mes utiliza 100 KB por comprobante.

## Alcance implementado y límites de verificación

Fases 1–4: operación atómica/idempotente, comprobantes privados, conciliación, cierres, QR firmado de 10 min/uso único, IndexedDB por UID/recorrido, PWA y las ocho pantallas. Login abre el destino del rol. La cola confirma con el servidor y mantiene incidencias tras cierre para una revisión administrativa; la compensación se registra y luego se referencia, sin volver a aplicar el cobro.

La clave HMAC de vínculos se genera criptográficamente y se almacena exclusivamente en D1 `app_secrets`; no es una variable pública ni viaja al navegador. Los tokens se almacenan como SHA-256 y se revocan al cambiar el vínculo. `qrcode` 1.5.4 genera SVG local sin enviar tarjetas a un servicio externo. Los costos históricos están en `movement_items.unit_cost_price`, excluidos de toda lectura pública y protegidos por el serializador.

El service worker cachea únicamente assets públicos (máximo 60 chunks) y un fallback sin datos personales, normalizando redirecciones del servidor de assets. No cachea API, comprobantes ni HTML autenticado. Una aplicación abierta continúa con snapshots del usuario; la reapertura sin señal necesita recuperar conectividad para revalidar su cuenta. D1 no puede comprobar pendientes de un teléfono desconectado: el trabajador declara su sincronización y las operaciones tardías conservan una incidencia.

QA usa Chrome instalado, componentes reales y servicios D1/R2 reales en Miniflare. Identidad Firebase y navegación de Next se sustituyen solo en el harness de tests; la verificación JWT tiene sus pruebas separadas. Google real y producción requieren configuración del usuario. La prueba de crecimiento del historial midió 63 consultas con 61 recorridos; el mismo resultado ahora requiere 3 consultas, evitando N+1 en administración.
