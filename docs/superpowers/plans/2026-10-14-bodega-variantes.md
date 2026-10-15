# Bodega y variantes — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** administrar productos por variantes con ingreso de bodega contextual y ganancia porcentual.

**Architecture:** categorías opcionales sobre los IDs vendibles actuales; transacciones de inventario y ventas existentes. Separar catálogo administrativo del resto de inventario para mantener componentes manejables.

**Tech Stack:** Next 16.3.8/React, TypeScript, D1 SQLite, Vitest y Playwright; pnpm.

**Spec:** `docs/superpowers/specs/2026-10-14-bodega-variantes.md`.

## Restricciones

No reescribir ventas o cambiar stock existente; costos privados; categoría/variante en nombres públicos completos; sin cambios remotos. Limpiar builds/cachés y preservar `.wrangler/state`.

## Revisión

Variantes duplicadas por mayúsculas; ediciones con categoría anterior; costo cero/precio menor al costo; cambio rápido de selección y reintentos; productos legados sin categoría.

## 1. Modelo y backend

- [x] Pruebas rojas para alta/edición sin motivo, categoría compartida, stock separado, duplicados, nombres en ruta/venta y snapshot histórico.
- [x] Migración `0004_product_categories.sql`, tipos, `saveProduct`, proyecciones ADMIN/WORKER y snapshot de visita. Incorporar migración en fixtures y documentar reversión.
- [x] Pruebas de backend y esquema verdes; revisión del diff.

## 2. Catálogo e ingresos de bodega

- [x] Pruebas rojas de ganancia/grupos y navegación del catálogo.
- [x] Crear componente de catálogo con producto principal/variante, cálculo automático y unidades iniciales/a agregar dentro del mismo formulario (preferencia explícita del usuario); correcciones de conteo como acción secundaria.
- [x] Reemplazar formulario general y etiquetas Calle/Casa; mantener trabajadores y armado de recorridos.
- [x] Navegador: Yogurt Fresa/Mora, ingreso de unidades, carga de ruta, sin motivo en producto y porcentajes correctos. Servicios reales prueban nombres en ruta/venta y conservación de la ficha histórica.

## 3. Verificación y entrega

- [x] Suite completa, TypeScript, lint, build y auditoría; QA móvil/escritorio y revisión independiente.
- [x] Documentar contratos, modelo y evidencia; limpiar regenerables y verificar persistencia intacta.

Evidencia final: 210 Vitest + 37 SQLite + 4 Pages = 251 pruebas; TypeScript, lint, build y auditoría correctos. Regresiones de respuesta perdida y cambio de pestaña conservan el UUID en guardado e ingreso/corrección; auditoría de metadatos no afirma un stock anterior leído fuera del batch. Capturas y resultados en `tasks.md` y `docs/design/README.md`. Los 34 archivos controlados de datos/configuración conservan sus hashes tras limpiar.
