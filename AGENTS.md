# graphify

- Cuando el usuario escriba `/graphify`, usar la skill graphify instalada y sus instrucciones antes de hacer cualquier otra cosa.
- Especificación: `SPEC_SEMANCONTROL.md` y `docs/propuesta-fases-2-4.md`. El usuario aprobó las Fases 2–4 completas; no repetir aprobaciones entre fases. Despliegue y migración de producción se acuerdan sobre la versión final revisable.
- Usar pnpm, no npm; mantener solo `pnpm-lock.yaml` y las políticas de `pnpm-workspace.yaml`.
- Limpiar builds/cachés al terminar. No borrar código, configuración local ni `.wrangler/state` con los datos D1/R2. `pnpm clean:all` permite retirar también las dependencias regenerables.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
