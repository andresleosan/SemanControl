import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoots: string[] = [];
const migrations = ["0001_init.sql", "0004_product_categories.sql", "0005_opening_items.sql"];
const metadata = (names: string[]) => JSON.stringify([{ results: names.map(name => ({ name })), success: true, meta: { rows_read: names.length, rows_written: 0 } }]);

afterEach(() => {
  const temporaryDirectory = realpathSync(tmpdir());
  for (const directory of temporaryRoots.splice(0)) {
    const local = relative(temporaryDirectory, realpathSync(directory));
    if (!local || local.startsWith("..") || isAbsolute(local)) throw new Error("Unsafe test cleanup path");
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(response: string, commandExit = 0) {
  const directory = mkdtempSync(join(tmpdir(), "semancontrol-schema-"));
  temporaryRoots.push(directory);
  for (const child of ["scripts", "migrations", "node_modules/wrangler/bin", "node_modules/.bin"]) mkdirSync(join(directory, child), { recursive: true });
  const source = join(root, "scripts/check-production-schema.mjs");
  if (existsSync(source)) writeFileSync(join(directory, "scripts/check-production-schema.mjs"), readFileSync(source));
  const project = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  writeFileSync(join(directory, "package.json"), JSON.stringify({ type: "module", scripts: { "deploy:production": project.scripts["deploy:production"] } }));
  for (const name of migrations) writeFileSync(join(directory, "migrations", name), "-- Fixture only\n");
  writeFileSync(join(directory, "wrangler.production.toml"), "# Fixture only\n");
  writeFileSync(join(directory, "wrangler-response.json"), response);
  // Only the external CLI boundary is emulated. The real package script, guard,
  // process arguments, exit handling and publication ordering all run normally.
  writeFileSync(join(directory, "node_modules/wrangler/bin/wrangler.js"), `
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
assert.deepEqual(process.argv.slice(2), ["d1", "execute", "DB", "--config", path.join(process.cwd(), "wrangler.production.toml"), "--remote", "--command", "SELECT name FROM d1_migrations ORDER BY name", "--json"]);
process.stdout.write(fs.readFileSync("wrangler-response.json", "utf8"));
if (${commandExit} !== 0) process.stderr.write("SYNTHETIC_PRIVATE_DIAGNOSTIC");
process.exitCode = ${commandExit};
`);
  writeFileSync(join(directory, "publish.mjs"), "import {writeFileSync} from 'node:fs'; writeFileSync('published.txt', JSON.stringify(process.argv.slice(2)));\n");
  writeFileSync(join(directory, "node_modules/.bin/opennextjs-cloudflare.cmd"), '@node "%~dp0/../../publish.mjs" %*\r\n');
  writeFileSync(join(directory, "node_modules/.bin/opennextjs-cloudflare"), '#!/bin/sh\nexec node "$(dirname "$0")/../../publish.mjs" "$@"\n', { mode: 0o755 });
  return directory;
}

function isolatedEnv(): NodeJS.ProcessEnv {
  const allowed = ["PATH", "Path", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP"];
  const env = Object.fromEntries(allowed.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  return {
    ...env, CI: "true", COREPACK_ENABLE_PROJECT_SPEC: "0", NODE_ENV: "test",
    FIREBASE_PROJECT_ID: "schema-fixture", APP_ORIGIN: "http://127.0.0.1", NEXTJS_ENV: "production",
    WRANGLER_SEND_METRICS: "false", WRANGLER_LOG: "log", WRANGLER_WRITE_LOGS: "false",
  };
}

function deploy(directory: string) {
  if (!process.env.npm_execpath) throw new Error("Run this test through pnpm test");
  return spawnSync(process.execPath, [process.env.npm_execpath, "--dir", resolve(directory), "run", "deploy:production"], {
    cwd: directory, shell: false, encoding: "utf8", timeout: 10000,
    env: isolatedEnv(),
  });
}

test("pending production migrations stop the real deploy script before publication", () => {
  const directory = fixture(metadata(["0001_init.sql"]));
  const result = deploy(directory);
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(existsSync(join(directory, "published.txt"))).toBe(false);
  expect(result.stderr).toContain("0004_product_categories.sql");
  expect(result.stderr).toContain("0005_opening_items.sql");
  expect(result.stderr).toMatch(/respaldo/i);
});

test("an up-to-date production schema allows the existing publisher to run", () => {
  const directory = fixture(metadata(migrations));
  const result = deploy(directory);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(JSON.parse(readFileSync(join(directory, "published.txt"), "utf8"))).toEqual(["deploy", "--config", "wrangler.production.toml"]);
});

test("a Wrangler authentication or command failure blocks publication and suppresses its diagnostics", () => {
  const directory = fixture(metadata(migrations), 1);
  const result = deploy(directory);
  expect(result.status).not.toBe(0);
  expect(existsSync(join(directory, "published.txt"))).toBe(false);
  expect(result.stderr).toMatch(/verificar.*producción/i);
  expect(result.stdout + result.stderr).not.toContain("SYNTHETIC_PRIVATE_DIAGNOSTIC");
});

test.each([
  "SYNTHETIC_PRIVATE_DIAGNOSTIC",
  "[]",
  JSON.stringify([{ success: false, results: migrations.map(name => ({ name })) }]),
  JSON.stringify([{ success: true, results: [{ name: null }] }]),
])("invalid metadata fails closed without exposing raw output: %s", response => {
  const directory = fixture(response);
  const result = deploy(directory);
  expect(result.status).not.toBe(0);
  expect(existsSync(join(directory, "published.txt"))).toBe(false);
  expect(result.stderr).toMatch(/verificar.*producción/i);
  expect(result.stdout + result.stderr).not.toContain("SYNTHETIC_PRIVATE_DIAGNOSTIC");
});

