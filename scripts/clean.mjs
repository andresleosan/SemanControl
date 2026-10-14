import { existsSync, realpathSync, rmSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

// Solo archivos generados del proyecto. Nunca elimina .wrangler/state ni el store.
const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const args = process.argv.slice(2);
if (args.some((arg) => !["--dependencies", "--dry-run"].includes(arg))) {
  throw new Error("Opciones válidas: --dependencies, --dry-run");
}

const targets = [
  ".next", ".open-next", ".wrangler/tmp", ".wrangler/test-browser", "coverage", "test-results",
  "playwright-report", "tests/__pycache__", "tsconfig.tsbuildinfo",
];
if (args.includes("--dependencies")) targets.push("node_modules");

function assertWithinRoot(path) {
  const local = relative(root, path);
  if (!local || local.startsWith("..") || isAbsolute(local)) {
    throw new Error(`Se rechazó una ruta fuera del proyecto: ${path}`);
  }
}

for (const name of targets) {
  const target = resolve(root, name);
  assertWithinRoot(target);
  if (!existsSync(target)) continue;
  assertWithinRoot(realpathSync(target));
  const parent = realpathSync(dirname(target));
  if (parent !== root) assertWithinRoot(parent);
  if (args.includes("--dry-run")) {
    process.stdout.write(`Regenerable: ${name}\n`);
  } else {
    // fs.rm elimina enlaces dentro del árbol sin seguir sus destinos.
    rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    process.stdout.write(`Eliminado: ${name}\n`);
  }
}
