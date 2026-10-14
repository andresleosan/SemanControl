# Landing comercial de SemanControl

Versión revisada y publicada el 14 de octubre de 2026 en [semancontrol.pages.dev](https://semancontrol.pages.dev/), con confirmación del propietario. Reemplaza la redirección de `/` por una portada pública; el acceso operativo continúa en `/login`. La landing no modifica autenticación, datos comerciales, roles, service worker ni migraciones.

## Resultado

Presentación para negocios que venden fiado y cobran en recorridos: portada con ejemplo de tarjetas, beneficios, transición del papel al registro digital, preparación/visita/cierre, vistas por rol, preguntas frecuentes y contacto. Los cuatro enlaces comerciales van a `https://www.alsdevstudio.com/`, destino indicado por el propietario; los enlaces de ingreso llevan a `/login`.

Los ejemplos están identificados como datos ficticios y se generan con HTML/CSS/SVG. No consultan APIs ni datos de producción. Las preguntas explican los límites de la operación sin conexión y el acceso mediante Google autorizado. La landing ofrece demostración y puesta en marcha; no presenta precios, inscripción libre, clientes, cifras comerciales o testimonios inventados.

CSS limitado a los componentes de marketing y fuente Manrope servida por el propio sitio con `next/font`. La portada es indexable, con canonical, Open Graph y Twitter Card; `robots.txt` excluye las áreas operativas y `sitemap.xml` incluye solo la portada. El layout conserva su `noindex` predeterminado para las demás vistas.

## Validación

- `pnpm test`: 173/173, incluidas siete pruebas existentes de navegador sobre D1/R2 aislados.
- `pnpm test:pages`: 4/4; `pnpm test:db`: 34/34. Total: 211 pruebas.
- TypeScript, ESLint y `pnpm audit` correctos; sin vulnerabilidades conocidas.
- `pnpm build:production`: build final Next.js/OpenNext correcto después de las correcciones de texto y estilos.
- Dry-run previo a publicar: 50 assets, Worker 1502,42 KiB gzip.
- HTTP sobre Worker compilado: 9/9 comprobaciones de portada, cuatro enlaces comerciales, metadata, privacidad de indexación, sitemap, imagen social, login y protección de rutas; smoke existente 22/22 correcto.
- Chrome a 320, 360, 390, 768 y 1280 px: ancho del documento igual al disponible, sin solapamiento de filas en la ilustración. Escritorio verificado también al tamaño normal del navegador.
- Pregunta frecuente de señal: abre con clic y cierra con Enter. Los cinco enlaces internos encuentran su sección. Consola sin errores JS.
- Contraste de párrafos, preguntas, captions y pie revisado sobre fondos reales: ningún resultado inferior a 4,5:1.
- Revisión independiente: sin hallazgos de seguridad o mensajes fuera del alcance. Se corrigió la cascada de títulos para que los estilos de marketing no agrandaran el título del ejemplo del producto.

Capturas de esta versión:

- [Escritorio](desktop.jpg)
- [Móvil a 390 px](mobile.jpg)
- [Proceso del recorrido](process.jpg)

Las capturas son evidencia de diseño, no datos reales. La captura móvil se regeneró con el viewport real de 390 px; se corrigió la evidencia anterior que reducía una imagen del escritorio. Las capturas usan extensión JPEG acorde con su formato.

## Publicación y recuperación

El propietario confirmó «hagamos push y sigamos». Código subido a `origin/main` en el commit [`e32be62`](https://github.com/andresleosan/SemanControl/commit/e32be62). Se publicó el mismo build validado mediante `pnpm deploy:production`, sin migraciones, seed ni cambios al puente Pages.

Cloudflare confirmó la versión `e74e8c9b-618a-42bd-bd2f-ce39a19d77d6` al 100 %, creada el 14 de octubre de 2026 a las 23:02 UTC (18:02 America/Bogota), con inicio del Worker en 20 ms.

Validación pública posterior: **16/16 comprobaciones HTTP**. Portada, login, robots, sitemap e imagen social responden 200; los cuatro enlaces comerciales apuntan a ALS DevStudio; las tres áreas privadas redirigen a login y la API administrativa exige identidad. Se verificaron sesión sin identidad 401, origen incorrecto 403, token inválido 401, cierre de cookie Secure/HttpOnly/SameSite=Lax y recursos PWA 200. Chrome mostró la landing, el enlace Ingresar abrió `/login`, Google está habilitado y ambas pantallas no registraron errores JS. No se repitió el consentimiento Google automatizado; la prueba real previa está documentada en [Firebase](../firebase-auth.md).

[Captura de la portada publicada](published.jpg).

Preview local cerrado y `pnpm clean` completado. Se retiraron builds, cachés y temporales; hashes antes/después confirman los 29 archivos de persistencia local y los tres archivos de configuración sin cambios. Las dependencias quedan instaladas para continuar el desarrollo. Fuente, lockfile, capturas de revisión y backups se conservan.

Versión de producción anterior a la landing: `022bea53-5fd5-4d63-831d-a7c6cac40dcd`. Si fuera necesario revertir el nuevo Worker, recuperar esa versión con `pnpm exec wrangler rollback 022bea53-5fd5-4d63-831d-a7c6cac40dcd --config wrangler.production.toml`.

## Instalar app desde la landing — 14 de octubre de 2026

Solicitud del propietario: añadir un icono para instalar desde la portada. Se incorporan dos botones «Instalar app», en cabecera y hero, con un controlador compartido. Un clic utiliza `beforeinstallprompt` cuando el navegador lo ofrece; cada evento se consume una vez y el doble clic no abre solicitudes repetidas. Aceptar el aviso no se presenta como instalación confirmada: `appinstalled` o el modo standalone cambian la acción a «Abrir app». Sin aviso disponible, un diálogo explica Android/Chrome, iPhone/Safari y computador, con cierre por Escape y retorno del foco.

Se conserva el favicon Ruta y se añaden PNG 192/512 y Apple 180 opacos derivados del mismo SVG. `start_url=/ruta`, `scope=/`, display e identidad implícita del manifest se conservan. No hay servicios, permisos, dependencias ni migraciones nuevos. El service worker, Firebase y los datos D1/R2 permanecen fuera de este cambio.

Verificación: `pnpm test` 179/179 en 16 archivos, incluidas seis pruebas nuevas de instalación con React/Chrome real y eventos de instalación controlados, además de las siete pruebas operativas existentes; ESLint, TypeScript del build y auditoría pnpm correctos. Build de producción final correcto; dry-run de 52 assets y 1504,58 KiB gzip. Once comprobaciones HTTP del Worker compilado validan botones, contactos ALS, metadata, manifest, PNG, login y protección de rutas. Chrome a 320/390/768/901/930/1280 px confirma controles de 44 px o más, sin desbordamiento ni superposición de marca/acciones; consola sin errores. [Vista móvil](install-mobile.jpg).

La suite completa reprodujo un fallo anterior al abrir la auditoría de una tarjeta nueva: el JSON `null` se trataba como objeto. Se corrigió únicamente la validación del snapshot antes de mostrar sus campos; el mismo caso existente se comprobó fallando antes y pasando después, sin modificar la prueba. La suite final completa queda aprobada.

La revisión de seguridad independiente no encontró bloqueantes. Las pruebas no instalan software en el teléfono ni automatizan Google. La interacción local con el evento real de Chrome invocó la solicitud; la pestaña se cerró sin completar una instalación. La instalación final en un móvil queda a cargo de su propietario. El funcionamiento sin conexión conserva sus límites anteriores.

Rollback de esta actualización: versión `e74e8c9b-618a-42bd-bd2f-ce39a19d77d6`, mediante `pnpm exec wrangler rollback e74e8c9b-618a-42bd-bd2f-ce39a19d77d6 --config wrangler.production.toml`.

Código publicado en `origin/main` mediante [`807d0f8`](https://github.com/andresleosan/SemanControl/commit/807d0f8). `pnpm deploy:production` terminó con exit 0: versión `d7b6c2f8-b013-4fce-81f3-b84c5037b7de`, inicio del Worker en 18 ms. Once comprobaciones HTTP públicas pasaron sobre esa versión, incluidas las dimensiones reales de los PNG. Chrome confirma ambos botones visibles en el dominio público, sin errores JS. [Captura publicada](install-published.jpg). No se volvió a automatizar Google ni se completó una instalación en el computador de revisión.

Preview cerrado y `pnpm clean` completado. Hashes anteriores/posteriores confirman 29 archivos de estado local y tres configuraciones sin cambios; builds, cachés y temporales retirados. Las dependencias quedan listas para continuar. Capturas de revisión, backups, código y lockfile se conservan.

## Acceso y regreso al inicio — 14 de octubre de 2026

Se rediseña `/login` con la identidad de la portada: composición dividida en escritorio, recorrido ilustrado propio y entrada con Google; móvil concentra el acceso en una columna. La marca y el enlace visible «Volver al inicio» llevan a `/`. Se mejora el botón con el icono oficial de Google en color, Google Sans local, estado de carga y avisos legibles. La autenticación conserva su flujo, permisos, mensajes y destinos por rol.

Verificación previa: 179/179 pruebas existentes aprobadas, ESLint y TypeScript correctos, build Next/OpenNext de producción y dry-run correctos (78 assets; 1501,62 KiB gzip). Once comprobaciones HTTP del Worker compilado pasan, incluidos acceso habilitado, enlace, `noindex`, asset Google local, instalación de la landing y rechazo de API privada sin sesión. Chrome a 320/390/768/1280 px confirma ausencia de desbordamiento, enlaces de 44 px y botón de 56 px visible. Tab enfoca «Volver al inicio» y Enter abre la portada; «Ingresar» regresa a `/login`. Consola sin errores JS. Revisión independiente de seguridad sin bloqueantes; se corrigió el contraste del pie. No se automatizó el consentimiento Google ni se modificaron datos.

Rollback previsto: versión `d7b6c2f8-b013-4fce-81f3-b84c5037b7de`, mediante `pnpm exec wrangler rollback d7b6c2f8-b013-4fce-81f3-b84c5037b7de --config wrangler.production.toml`.

Código publicado en `origin/main` mediante [`88a2b0f`](https://github.com/andresleosan/SemanControl/commit/88a2b0f). Worker publicado: `1e707899-db38-43cf-a265-c8515c581766`, inicio en 17 ms. Las once comprobaciones HTTP públicas pasan; Chrome confirma acceso habilitado, consola sin errores y regreso efectivo a la landing mediante el enlace. [Escritorio publicado](login-published.jpg) · [Móvil publicado](login-mobile.jpg).

Preview y pestañas de revisión cerrados; viewport temporal restablecido. `pnpm clean` retiró builds, cachés y temporales. Comparación SHA-256 confirma configuración y datos persistentes D1/R2 sin cambios; solo cambian dos archivos de observabilidad de Miniflare por las solicitudes de revisión. Ningún archivo de `.wrangler/state` fue eliminado. Se conservan dependencias, código, capturas y backups.
