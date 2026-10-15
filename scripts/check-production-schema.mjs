import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const migrationName = /^\d+_[A-Za-z0-9_-]+\.sql$/;

// The only remote data this check accepts are applied migration filenames.
export function pendingMigrations(localNames, output) {
  if (!localNames.length || localNames.some(name => !migrationName.test(name))) throw new Error("Invalid local migrations");
  const response = JSON.parse(output);
  if (!Array.isArray(response) || response.length !== 1 || response[0]?.success !== true || !Array.isArray(response[0].results)) {
    throw new Error("Invalid migration metadata");
  }
  const names = response[0].results.map(row => {
    if (!row || typeof row.name !== "string" || !migrationName.test(row.name)) throw new Error("Invalid migration metadata");
    return row.name;
  });
  const applied = new Set(names);
  return localNames.filter(name => !applied.has(name));
}

function main() {
  try {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const localNames = readdirSync(join(root, "migrations"), { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith(".sql"))
      .map(entry => entry.name).sort();
    const result = spawnSync(process.execPath, [
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "d1", "execute", "DB", "--config", join(root, "wrangler.production.toml"),
      "--remote", "--command", "SELECT name FROM d1_migrations ORDER BY name", "--json",
    ], {
      cwd: root, shell: false, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      timeout: 45000, maxBuffer: 1024 * 1024,
      env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false", WRANGLER_LOG: "log", WRANGLER_WRITE_LOGS: "false" },
    });
    if (result.error || result.status !== 0 || result.signal) throw new Error("Migration check failed");
    const pending = pendingMigrations(localNames, result.stdout);
    if (pending.length) {
      process.stderr.write(`Despliegue bloqueado: faltan migraciones D1 de producción:\n${pending.map(name => `- ${name}`).join("\n")}\nRevisa y acuerda su aplicación con un respaldo verificado antes de volver a publicar. Esta comprobación no aplica migraciones ni seed.\n`);
      return 1;
    }
    process.stdout.write(`Esquema D1 de producción verificado (${localNames.length} migraciones).\n`);
    return 0;
  } catch {
    // Wrangler diagnostics can contain sensitive data. Never forward raw output.
    process.stderr.write("No se pudo verificar el esquema D1 de producción. Despliegue bloqueado. Revisa el acceso de Wrangler, la configuración de producción y los metadatos de migraciones antes de reintentar.\n");
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = main();
