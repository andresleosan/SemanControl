import { createServer, type Server } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createApiRoute, readJson } from "../../src/lib/api";
import type { Principal, Role } from "../../src/lib/auth/types";
import { clientDetail, clientRow, clientsView, closureView, history, inventoryView } from "../../src/lib/admin/read-model";
import { adjustBalance, changeStock, closeDispatch, createDispatch, decideTransfer, saveClient, saveProduct, saveWorker } from "../../src/lib/admin/write-model";
import { confirmSynchronized, createRouteClient, readRoute, readRouteClient, readRouteSummary } from "../../src/lib/operations/route";
import { registerVisit } from "../../src/lib/operations/visits";
import { readReceipt, readReceiptForm, uploadReceipt } from "../../src/lib/operations/receipts";
import { listIncidents, resolveIncident } from "../../src/lib/incidents";
import { ApiError } from "../../src/lib/security/errors";

export const dispatchId = "route-demo-2026-10-16";
export const principals: Record<string, Principal> = {
  worker: { userId: "worker-demo-1", firebaseUid: "browser-worker-1", email: "trabajador1@semancontrol.example", name: "Trabajador de prueba 1", role: "WORKER", clientId: null },
  worker2: { userId: "worker-demo-2", firebaseUid: "browser-worker-2", email: "trabajador2@semancontrol.example", name: "Trabajador de prueba 2", role: "WORKER", clientId: null },
  admin: { userId: "admin-demo", firebaseUid: "browser-admin", email: "admin@semancontrol.example", name: "Administrador de prueba", role: "ADMIN", clientId: null },
  client: { userId: "client-demo-01", firebaseUid: "browser-client", email: "cliente01@semancontrol.example", name: "Cliente de prueba 01", role: "CLIENT", clientId: "client-demo-01" },
};

/** Execute unchanged migrations, including complete trigger bodies. */
async function migrate(db: D1Database, sql: string) {
  let statement = "", trigger = false;
  for (const line of sql.split("\n")) {
    if (!statement && (!line.trim() || line.trim().startsWith("--"))) continue;
    statement += `${line}\n`;
    if (/CREATE TRIGGER/i.test(statement)) trigger = true;
    if ((!trigger && /;\s*$/.test(line)) || (trigger && /^END;\s*$/i.test(line.trim()))) {
      await db.prepare(statement).run(); statement = ""; trigger = false;
    }
  }
}

let assets: Promise<{ js: string; css: string }> | undefined;
async function compileUi() {
  const fixture = resolve("tests/browser-fixture");
  const result = await build({
    entryPoints: [resolve(fixture, "browser-entry.tsx")], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    alias: {
      "@/lib/client-api": resolve(fixture, "client-identity.ts"), "@/lib/auth/client": resolve(fixture, "client-identity.ts"),
      "firebase/auth": resolve(fixture, "client-identity.ts"), "next/link": resolve(fixture, "platform.tsx"), "next/navigation": resolve(fixture, "platform.tsx"),
      "@": resolve("src"),
    },
  });
  // The UI uses semantic sc-* CSS. Preserve Tailwind's actual reset as well.
  const globals = await readFile(resolve("src/app/globals.css"), "utf8");
  const preflight = await readFile(resolve("node_modules/tailwindcss/preflight.css"), "utf8");
  return { js: result.outputFiles[0].text, css: `${preflight}\n${globals.replace('@import "tailwindcss";', "")}` };
}

export class BrowserHarness {
  private mf!: Miniflare;
  private server!: Server;
  db!: D1Database;
  bucket!: R2Bucket;
  origin = "";
  visits: { payload: Record<string, unknown>; status: number; response: unknown }[] = [];
  responses: { path: string; role: Role; status: number; body: string }[] = [];

  async start() {
    assets ??= compileUi();
    const ui = await assets;
    const publicFiles = await Promise.all(["sw.js", "offline.html", "pwa-icon.svg"].map((name) => readFile(resolve("public", name), "utf8")));
    this.mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('fixture')}}", compatibilityDate: "2026-10-14", d1Databases: ["DB"], r2Buckets: ["RECEIPTS_BUCKET"] }));
    this.db = await this.mf.getD1Database("DB") as unknown as D1Database;
    this.bucket = await this.mf.getR2Bucket("RECEIPTS_BUCKET") as unknown as R2Bucket;
    for (const name of ["migrations/0001_init.sql", "migrations/0002_operations.sql", "migrations/0003_incidents.sql", "seed.sql"]) await migrate(this.db, await readFile(resolve(name), "utf8"));
    this.server = createServer(async (incoming, outgoing) => {
      try {
        const url = new URL(incoming.url ?? "/", this.origin);
        // Mimic Workers' extensionless asset redirect so the actual service worker
        // must normalize the cached response before serving navigation offline.
        if (url.pathname === "/offline.html") { outgoing.writeHead(307, { Location: "/offline" }); outgoing.end(); return; }
        if (["/sw.js", "/offline", "/pwa-icon.svg"].includes(url.pathname)) {
          const index = url.pathname === "/sw.js" ? 0 : url.pathname === "/offline" ? 1 : 2;
          outgoing.writeHead(200, { "Content-Type": index === 0 ? "text/javascript" : index === 1 ? "text/html; charset=utf-8" : "image/svg+xml", "Cache-Control": "no-store" });
          outgoing.end(publicFiles[index]); return;
        }
        const identity = /(?:^|;\s*)browser_fixture=([^;]+)/.exec(incoming.headers.cookie ?? "")?.[1];
        const principal = identity ? principals[identity] : undefined;
        if (!principal) { outgoing.writeHead(401); outgoing.end("Fixture identity required"); return; }
        if (url.pathname === "/fixture.js" || url.pathname === "/fixture.css") {
          outgoing.writeHead(200, { "Content-Type": url.pathname.endsWith(".js") ? "text/javascript" : "text/css", "Cache-Control": "no-store" });
          outgoing.end(url.pathname.endsWith(".js") ? ui.js : ui.css); return;
        }
        if (!url.pathname.startsWith("/api/")) {
          outgoing.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          outgoing.end(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><title>SemanControl QA aislado</title></head><body><div id="root"></div><script>window.__browserFixturePrincipal=${JSON.stringify(principal)}</script><script src="/fixture.js"></script></body></html>`); return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
        const request = new Request(url, { method: incoming.method, headers: new Headers(incoming.headers as Record<string, string>), ...(["GET", "HEAD"].includes(incoming.method ?? "GET") ? {} : { body: new Uint8Array(Buffer.concat(chunks)) }) });
        const response = await this.handle(request, principal);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (response.headers.get("Content-Type")?.includes("json")) this.responses.push({ path: url.pathname, role: principal.role, status: response.status, body: new TextDecoder().decode(bytes) });
        outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(bytes);
      } catch (error) { outgoing.writeHead(500); outgoing.end(String(error)); }
    });
    await new Promise<void>((done) => this.server.listen(0, "127.0.0.1", done));
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("Fixture port unavailable");
    this.origin = `http://127.0.0.1:${address.port}`;
    await mkdir(resolve(".wrangler/test-browser"), { recursive: true });
  }

  private async handle(request: Request, principal: Principal) {
    const env = { DB: this.db, RECEIPTS_BUCKET: this.bucket, APP_ORIGIN: this.origin, AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) } } as unknown as CloudflareEnv;
    // Firebase verification is the only server identity substitution. Role, origin,
    // public response filtering and all SQL/R2 business rules run production code.
    const route = createApiRoute(async () => env, async () => principal);
    const url = new URL(request.url), path = url.pathname, post = request.method === "POST";
    if (path === "/api/auth/session") return route(request, ["ADMIN", "WORKER", "CLIENT"], async () => ({ user: principal }));
    if (path === "/api/admin/inventario") return route(request, ["ADMIN"], async () => inventoryView(this.db));
    if (path === "/api/admin/productos") return route(request, ["ADMIN"], async () => saveProduct(this.db, principal, await readJson(request)));
    if (path === "/api/admin/trabajadores") return route(request, ["ADMIN"], async () => saveWorker(this.db, principal, await readJson(request)));
    if (path === "/api/admin/compras" || path === "/api/admin/stock") return route(request, ["ADMIN"], async () => changeStock(this.db, principal, await readJson(request), path.endsWith("compras")));
    if (path === "/api/admin/recorridos") return route(request, ["ADMIN"], async () => createDispatch(this.db, principal, await readJson(request)));
    if (path === "/api/admin/clientes") return route(request, ["ADMIN"], async () => post ? saveClient(this.db, principal, await readJson(request)) : clientsView(this.db, url.searchParams));
    if (path.startsWith("/api/admin/clientes/")) return route(request, ["ADMIN"], async () => clientDetail(this.db, decodeURIComponent(path.slice("/api/admin/clientes/".length))));
    if (path === "/api/admin/ajustes") return route(request, ["ADMIN"], async () => adjustBalance(this.db, principal, await readJson(request)));
    if (path === "/api/admin/cierre") return route(request, ["ADMIN"], async () => post ? closeDispatch(this.db, principal, await readJson(request)) : closureView(this.db, url.searchParams.get("dispatch_id")));
    if (path === "/api/admin/transferencias") return route(request, ["ADMIN"], async () => decideTransfer(this.db, principal, await readJson(request)));
    if (path === "/api/admin/incidencias") return route(request, ["ADMIN"], async () => post ? resolveIncident(this.db, principal, await readJson(request)) : listIncidents(this.db, url.searchParams.get("dispatch_id")));
    if (path === "/api/ruta") return route(request, ["WORKER"], async () => readRoute(this.db, principal, url.searchParams.get("dispatch_id")));
    if (path.startsWith("/api/ruta/cliente/")) return route(request, ["WORKER"], async () => readRouteClient(this.db, principal, decodeURIComponent(path.slice("/api/ruta/cliente/".length)), url.searchParams.get("dispatch_id") ?? ""));
    if (path === "/api/ruta/clientes") return route(request, ["WORKER"], async () => createRouteClient(this.db, principal, await readJson(request)));
    if (path === "/api/ruta/resumen") return route(request, ["WORKER"], async () => post ? confirmSynchronized(this.db, principal, String((await readJson(request)).dispatch_id)) : readRouteSummary(this.db, principal, url.searchParams.get("dispatch_id") ?? ""));
    if (path === "/api/ruta/visita") {
      let payload: Record<string, unknown> = {};
      const result = await route(request, ["WORKER"], async () => { payload = await readJson(request); return registerVisit(this.db, principal, payload); });
      this.visits.push({ payload, status: result.status, response: await result.clone().json() }); return result;
    }
    if (path === "/api/comprobantes") return route(request, ["WORKER"], async () => uploadReceipt(env, principal, await readReceiptForm(request)));
    if (path.startsWith("/api/comprobantes/")) return route(request, ["ADMIN", "WORKER", "CLIENT"], async () => readReceipt(env, principal, path.slice("/api/comprobantes/".length)));
    if (path === "/api/mi-cuenta") return route(request, ["CLIENT"], async () => ({ client: await clientRow(this.db, principal.clientId!), history: await history(this.db, principal.clientId!) }));
    return route(request, ["ADMIN", "WORKER", "CLIENT"], async () => { throw new ApiError(404, "FIXTURE_ROUTE_MISSING", `Ruta no cubierta: ${path}`); });
  }

  async stop() {
    if (this.server) { this.server.closeAllConnections(); await new Promise<void>((done) => this.server.close(() => done())); }
    await this.mf?.dispose();
  }
}
