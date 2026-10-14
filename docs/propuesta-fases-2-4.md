# Propuesta para completar SemanControl — aprobada 2026-10-14

La propuesta fue aprobada por el usuario para construir las Fases 2, 3 y 4 con pnpm. Conserva el mismo stack y los tres roles. No agrega teléfono, GPS ni servicios separados. Los cambios de dinero y stock ya aprobados se mantienen.

## 1. Guardar exactamente la operación confirmada

Cada visita conserva UUID, trabajador y hash del contenido. Repetir la misma operación devuelve el resultado anterior; reutilizar la clave con otro contenido devuelve conflicto y no cambia datos. Conocer una clave no permite leer la visita de otro trabajador.

El servidor calcula precios y totales; compara revisión del saldo, precio confirmado e inventario. Si cambiaron, no aplica una parte de la visita ni reemplaza importes silenciosamente: muestra el cambio para confirmarlo nuevamente. Un único D1 batch actualiza carga, stock, saldo, movimiento y detalles con guardias SQL reales. La revisión por cliente ordena incluso movimientos del mismo segundo.

Migración adicional: revisión/secuencia del cliente y metadatos de idempotencia. Esto no cambia el criterio aprobado de transferencias provisionales y rechazo mediante reverso único.

## 2. Ruta compartida y trabajo con señal intermitente

Un recorrido tiene carga compartida entre sus trabajadores. Efectivo y transferencias se desglosan por trabajador; sobrantes pertenecen al recorrido completo. Si hay varios recorridos, se selecciona uno explícitamente. “Visitados” se calcula por cliente y recorrido, muestra quién atendió y permite una segunda visita intencional. “Hoy” usa America/Bogota.

Recomiendo una cola local sencilla en IndexedDB frente a bloquear todo el formulario sin señal: conserva visita, foto y UUID en el teléfono y muestra **Pendiente de sincronizar**. Solo la respuesta del servidor permite mostrar **Registrada**. No se inventa una reserva de stock garantizada offline. Los reintentos preservan el contenido y renuevan sesión antes de sincronizar; conflictos y denegaciones quedan visibles, conservando los datos del cobro o entrega física para revisión. Los datos locales se separan por usuario y recorrido y no se exponen a otra cuenta.

El cierre requiere confirmación de devolución y que cada trabajador declare haber sincronizado sus pendientes. El servidor no puede comprobar una cola que permanece en un teléfono desconectado. Si aparece una operación tardía, se conserva como incidencia para conciliación administrativa; no se reabre automáticamente el recorrido ni se descarta el cobro.

Alternativa de menor alcance: operar solo con conexión, guardando borradores locales. Ahorra parte de la sincronización, pero limita el trabajo puerta a puerta cuando falla la señal. La recomendación es la cola con estados y revisión explícitos.

## 3. Comprobantes privados y legibles

Cada comprobante tendrá propietario, cliente, recorrido y estado de asociación. El servidor valida WebP, tamaño y dimensiones y lo asocia una sola vez a una visita. ADMIN revisa; CLIENT solo ve los de su tarjeta; WORKER solo accede a los recorridos permitidos. R2 permanece privado. Si la foto sube y falla la visita, queda temporalmente disponible para reintentar; la limpieza solo elimina archivos huérfanos tras el plazo documentado.

Se mantiene el perfil normal 1000px/calidad 0.75 y objetivo inferior a 100 KB, con vista previa ampliable. Propongo permitir, con aviso de peso, un máximo excepcional de 1600px y 500 KB cuando sea necesario para leer referencias bancarias. Si no queda legible, se solicita repetir o recortar la imagen. Esta excepción modifica la regla original y requiere aprobación.

Migración adicional: comprobantes y unicidad de asociación. El QR de vinculación será firmado, de un solo uso, con expiración de 10 minutos; solo puede vincular una tarjeta sin UID, y un vínculo existente se corrige por ADMIN con auditoría.

## 4. Cuadre y cambios con responsable

ADMIN registra efectivo esperado/recibido y mercancía esperada/devuelta; cualquier diferencia exige motivo. Cerrar conserva sobrantes, libera reservas y bloquea visitas nuevas. Puede cerrarse físicamente con transferencias pendientes, que siguen disponibles para conciliación posterior.

Las compras, ajustes de stock, cierres, cambios de cuenta vinculada y decisiones bancarias registran responsable, hora, motivo y valores anteriores/nuevos. La corrección de una visita registrada se hace mediante compensaciones auditables, no borrando el historial. Rechazar una transferencia continúa generando un único reverso.

Para el primer alcance, la carga se congela tras la primera visita; reponer mercancía en la calle requeriría un flujo adicional y queda para una versión posterior. La gestión básica de trabajadores permitirá preautorizar correos Google y desactivar accesos desde ADMIN, sin editar SQL manualmente.

Migraciones adicionales: eventos de conciliación, cuadre/cierre, movimientos de inventario y auditoría administrativa.

## 5. Una ganancia que los datos puedan explicar

Reemplazar **Ganancia Proyectada** por **Margen estimado de ventas registradas**: suma de cantidad × (precio fiado histórico − costo maestro registrado al vender), por período. Se guarda ese costo histórico privado al entregar y nunca se selecciona ni serializa para WORKER/CLIENT. Los abonos no se suman como nueva ganancia y este indicador no pretende medir utilidad neta ni el costo real por lote.

Los saldos heredados sin detalle se muestran separados como **Saldo heredado sin margen calculable**. No se inventa su ganancia ni se recalculan ventas anteriores con costos actuales. El stock no tendrá FIFO ni costo promedio ponderado en esta versión: el costo usado será el costo maestro vigente al registrar cada venta.

Migración adicional: snapshot privado de costo en el detalle, ampliando la protección de todos los campos de costo del backend.

## Ejecución y comprobación

1. Fase 2: migraciones y APIs, permisos por recorrido/tarjeta, transacciones, idempotencia, comprobantes y auditoría.
2. Fase 3: hoja de ruta, atención, resumen, compresor, QR y PWA con cola local.
3. Fase 4: inventario/despachos, clientes/cartera, gestión básica de trabajadores, cierre/conciliación y tarjeta del cliente.

Verificar con pnpm, D1/R2 locales, pruebas de concurrencia y reintento, y flujos completos en navegador móvil. Google real requiere la configuración Firebase descrita en README. La aprobación de esta propuesta autoriza construir las tres fases y sus migraciones locales sin más aprobaciones entre fases; publicar y migrar producción se acuerda cuando exista una versión completa revisable.

## Alcance aprobado

Los cinco puntos anteriores y las Fases 2–4 están autorizados. Cambios principales: carga compartida, cola local con confirmación del servidor, excepción de peso del comprobante, cierre con conciliación posterior, carga congelada y KPI basado en margen histórico registrado. El alta ADMIN permite registrar el saldo físico mediante OPENING; correcciones posteriores son ADJUSTMENT. Las incidencias tardías se resuelven vinculando la compensación existente, sin aplicar el pago nuevamente; stock físico se concilia con el cierre antes de ajustar.
