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
