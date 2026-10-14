# Landing comercial de SemanControl

Versión preparada el 14 de octubre de 2026 para revisión final del propietario. Reemplaza la redirección de `/` por una portada pública; el acceso operativo continúa en `/login`. No modifica autenticación, datos comerciales, roles, service worker ni migraciones.

## Resultado

Presentación para negocios que venden fiado y cobran en recorridos: portada con ejemplo de tarjetas, beneficios, transición del papel al registro digital, preparación/visita/cierre, vistas por rol, preguntas frecuentes y contacto. Los cuatro enlaces comerciales van a `https://www.alsdevstudio.com/`, destino indicado por el propietario; los enlaces de ingreso llevan a `/login`.

Los ejemplos están identificados como datos ficticios y se generan con HTML/CSS/SVG. No consultan APIs ni datos de producción. Las preguntas explican los límites de la operación sin conexión y el acceso mediante Google autorizado. La landing ofrece demostración y puesta en marcha; no presenta precios, inscripción libre, clientes, cifras comerciales o testimonios inventados.

CSS limitado a los componentes de marketing y fuente Manrope servida por el propio sitio con `next/font`. La portada es indexable, con canonical, Open Graph y Twitter Card; `robots.txt` excluye las áreas operativas y `sitemap.xml` incluye solo la portada. El layout conserva su `noindex` predeterminado para las demás vistas.

## Validación

- `pnpm test`: 173/173, incluidas siete pruebas existentes de navegador sobre D1/R2 aislados.
- `pnpm test:pages`: 4/4; `pnpm test:db`: 34/34. Total: 211 pruebas.
- TypeScript, ESLint y `pnpm audit` correctos; sin vulnerabilidades conocidas.
- `pnpm build:production`: build final Next.js/OpenNext correcto después de las correcciones de texto y estilos.
- Dry-run: 50 assets, Worker 1502,42 KiB gzip. No publicación.
- HTTP sobre Worker compilado: 9/9 comprobaciones de portada, cuatro enlaces comerciales, metadata, privacidad de indexación, sitemap, imagen social, login y protección de rutas; smoke existente 22/22 correcto.
- Chrome a 320, 360, 390, 768 y 1280 px: ancho del documento igual al disponible, sin solapamiento de filas en la ilustración. Escritorio verificado también al tamaño normal del navegador.
- Pregunta frecuente de señal: abre con clic y cierra con Enter. Los cinco enlaces internos encuentran su sección. Consola sin errores JS.
- Contraste de párrafos, preguntas, captions y pie revisado sobre fondos reales: ningún resultado inferior a 4,5:1.
- Revisión independiente: sin hallazgos de seguridad o mensajes fuera del alcance. Se corrigió la cascada de títulos para que los estilos de marketing no agrandaran el título del ejemplo del producto.

Capturas de esta versión:

- [Escritorio](desktop.jpg)
- [Móvil a 390 px](mobile.jpg)
- [Proceso del recorrido](process.jpg)

Las capturas son evidencia de diseño, no datos reales. La prueba local está disponible en `http://127.0.0.1:8787/` mientras se resuelve la publicación. El preview y los builds se conservan temporalmente para revisar/publicar la versión; al cerrar esa etapa se ejecuta la limpieza, preservando configuración y D1/R2 locales.

## Publicación y recuperación

Pendiente de la confirmación final de publicación prevista en AGENTS.md. No requiere migraciones ni volver a publicar el puente Pages.

Versión de producción anterior a la landing: `022bea53-5fd5-4d63-831d-a7c6cac40dcd`. Si fuera necesario revertir el nuevo Worker, recuperar esa versión con `pnpm exec wrangler rollback 022bea53-5fd5-4d63-831d-a7c6cac40dcd --config wrangler.production.toml`.
