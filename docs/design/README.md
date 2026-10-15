# Revisión de diseño de SemanControl — 2026-10-14

Se analizaron administración, trabajador y cliente y se aplicaron mejoras locales sobre sus flujos existentes. El benchmark se hizo con el MCP de Mobbin y leyendo las imágenes devueltas, junto con la especificación y la propuesta aprobada de Fases 2–4.

## Referencias y decisiones

| Referencia consultada en Mobbin | Patrón observado | Aplicación en SemanControl |
| --- | --- | --- |
| [Airtable](https://mobbin.com/screens/1ccf6613-4abd-420f-9d18-ac7b40a04848) | Navegación lateral, tabla con estados y filtros próximos a los registros. | Administración: contexto lateral en escritorio, controles segmentados, búsqueda y estados de conciliación. |
| [Asana](https://mobbin.com/screens/04f565e9-e2d7-4dc0-bbda-35d6d8fb8200) | Trabajo organizado por estado, acción de creación accesible y navegación inferior. | Trabajador: filtros con conteos, progreso confirmado, navegación inferior y creación de tarjeta al alcance del pulgar. |
| [YNAB](https://mobbin.com/screens/5bd8e423-cf79-45c2-b12c-a68d5ccfce0d) | Saldo destacado, movimientos organizados por fecha, importes fáciles de recorrer. | Cliente: saldo primero e historial agrupado por fecha de Bogotá, con productos y estados bancarios visibles. |

Las referencias sirven como patrones de estructura; los componentes, textos e identidad de SemanControl son propios. No se incorporan imágenes de Mobbin al producto ni se enlazan sus URLs de imagen temporales.

## Hallazgos y cambios aplicados

| Área | Fricción anterior | Resultado local |
| --- | --- | --- |
| Compartido | Jerarquía y navegación casi idénticas para necesidades distintas. | Navegación lateral en escritorio, inferior en móvil y tarjeta cliente sin navegación redundante. Manrope compartida con la marca, cifras tabulares y espacios coherentes. |
| Compartido | Pendientes, revisiones y rechazos con el mismo badge verde; hover peligroso pasaba a verde. | Tonos con texto: ámbar pendiente, azul revisión, verde confirmado, rojo rechazo, gris estado neutro. Hover rojo y controles deshabilitados reconocibles. |
| Administración | Tablas extensas con desplazamiento horizontal en el teléfono. | Una sola tabla semántica por conjunto, presentada como fichas con etiquetas en móvil; formularios de conteo conservan esperado, recibido y diferencia. |
| Administración | Edición fuera de la vista, conciliación sin filtros. | Foco en el editor; filtros y búsqueda locales de transferencias con conteos. Diferencias expresadas como Faltan/Sobran/Coincide. Consecuencia del rechazo junto a la acción. |
| Trabajador | Paneles anidados, filtros que ocupaban varias filas y cliente poco destacado. | Progreso de tarjetas con visitas confirmadas, carga compacta, filtros con conteos y número de tarjeta como ancla del listado. |
| Trabajador | Navegación sin recorrido y atención sin gestión de posición/foco. | Enlaces conservan `dispatch_id`; abrir enfoca el título, volver restaura posición y foco a la tarjeta. |
| Trabajador | Efectivo local pendiente alejado del total confirmado; conflictos llamados pendientes de sincronizar. | Cuadre diferencia cobros confirmados y cobros físicos locales. Cola distingue sincronización, revisión e incidencia administrativa. |
| Trabajador | Footer y navegación podían competir; error lejos de guardar. | Atención tiene una sola barra inferior financiera con cliente, importe, estado y error próximo al botón. |
| Cliente | Actualización antes del saldo e historial de tablas densas. | Actualización dentro de la tarjeta, saldo destacado y movimientos por fecha con detalle completo en filas adaptables. |
| Cliente | Saldo anterior a favor mostraba una convención distinta al saldo final. | Importe absoluto acompañado de etiqueta a favor, sin modificar el valor contable. |

La cola local y el resumen del servidor pueden referirse a la misma visita si se perdió una respuesta. El aviso del cuadre explica esa incertidumbre y pide sincronizar/revisar; no se suman ambos importes ni se afirma que un pendiente local está ausente del servidor.

## Identidad visual

- Verde `#155f4b`: acción principal y saldo; conserva la marca.
- Tinta `#17372d`: nombres, importes y títulos; secundario `#52665e` para referencias y fechas.
- Fondo `#f4f7f5`, superficies blancas y bordes `#dce5df`: separación sin decoración que compita con cifras.
- Manrope servida con `next/font`: continuidad con login/landing, sin solicitud a terceros al navegar; fallback local y cifras tabulares.
- Firma: número físico de tarjeta, progreso del recorrido y saldo explicado. Los estados incluyen texto además de color.
- Se evitan gráficos decorativos, métricas inventadas y pantallas financieras intercambiables entre roles.

## Evidencia visual

Las capturas contienen únicamente los datos ficticios del harness existente. Este usa los componentes de producción y servicios D1/R2 efímeros; identidad Firebase y navegación Next se sustituyen para probar roles sin iniciar sesiones reales. Las capturas finales incorporan la fuente Manrope compilada por Next. No representan datos ni sesiones de producción.

| Pantalla | Vista móvil | Escritorio |
| --- | --- | --- |
| Bodega | [Captura](screenshots/preview-admin-inventory-390.png) | [Captura](screenshots/preview-admin-inventory-1440.png) |
| Directorio | [Captura](screenshots/preview-admin-clients-390.png) | [Captura](screenshots/preview-admin-clients-1440.png) |
| Cierre | [Captura](screenshots/preview-admin-closure-390.png) | [Captura](screenshots/preview-admin-closure-1440.png) |
| Hoja de ruta | [Captura](screenshots/preview-worker-route-390.png) | [Captura](screenshots/preview-worker-route-1440.png) |
| Atención | [Captura](screenshots/preview-worker-visit-390.png) | [Captura](screenshots/preview-worker-visit-1440.png) |
| Cuadre | [Captura](screenshots/preview-worker-summary-390.png) | [Captura](screenshots/preview-worker-summary-1440.png) |
| Tarjeta cliente | [Captura](screenshots/preview-client-account-390.png) | [Captura](screenshots/preview-client-account-1440.png) |

También se conservan capturas completas `before-*` y `after-*` para comparar bodega, ruta y tarjeta cliente. El cierre final incluye un recorrido seleccionado; su captura inicial muestra el selector sin detalle y no debe interpretarse como comparación del mismo estado.

## Verificación

- `pnpm verify`: 179 pruebas Vitest (incluidas 7 de navegador), 34 SQLite y 4 del puente Pages; TypeScript, ESLint y build Next/OpenNext correctos. Total: 217 pruebas.
- `pnpm exec vitest run tests/browser.test.ts`: 7/7 pasan tras los ajustes de la revisión independiente.
- `pnpm build:worker`: build final correcto después de los últimos ajustes de presentación.
- `pnpm audit`: sin vulnerabilidades conocidas.
- Matriz visual de 7 pantallas × 4 anchos (320, 390, 768 y 1440 px), con Manrope: 28 casos sin desborde horizontal del documento ni errores JavaScript. Las tablas administrativas tampoco requieren scroll horizontal en los casos móviles medidos.
- Estrés de presentación con `$ 999.999.999.999` en tarjetas/KPIs: sin desborde del documento. Es una sustitución temporal del texto en el DOM para probar layout, no una operación financiera.
- Apertura y regreso desde tarjeta #10: foco H1 y scroll inicial cero al abrir; foco restaurado a la tarjeta al volver, en los cuatro anchos. Enlace a cuadre conserva recorrido.
- Revisión independiente de permisos/cálculos y contraste: sin nuevos cambios de autorización o cálculo; contraste de textos/badges/botones principales al menos 5,69:1. Esto no sustituye una auditoría completa WCAG ni una prueba en un teléfono real con teclado y lector de pantalla.
- Resultado medido: [matriz visual](qa-visual-qa.json).
- Hashes SHA-256: 33 archivos existentes de persistencia/configuración conservados. Builds y temporales se retiran con `pnpm clean`; las capturas entregables permanecen en esta carpeta.

Se leyeron las guías de CSS, fuentes y Link de la versión instalada de Next. Se mantienen los avisos conocidos del proyecto sobre middleware/OpenNext en Windows y fallback de Google Sans; no impidieron compilar.

## Oportunidades pendientes

1. Historial del navegador para la atención que se abre dentro de la ruta: esta revisión corrige foco/posición y preserva el funcionamiento offline, pero no cambia el modelo de navegación.
2. Confirmación contextual adicional antes de rechazar un pago. Se acercó la explicación del reverso a la acción; no se añadió otro paso a esa mutación.
3. Carga bajo demanda de comprobantes y directorio con panel de detalle para volúmenes mayores. Los filtros actuales ya reducen las tarjetas montadas, pero Todas sigue siendo el filtro inicial.
4. Recuperación de vínculo vencido y navegación de `/sesion`; quedaron fuera del rediseño de las pantallas operativas de esta tarea.
5. Prueba manual de operación offline/comprobantes en dispositivos reales, pendiente operativa registrada previamente en `tasks.md`.

No se cambia backend, contratos, migraciones, permisos, cálculos, almacenamiento ni sincronización. Las mejoras quedan locales y listas para revisión; esta tarea no publica ni migra producción.
