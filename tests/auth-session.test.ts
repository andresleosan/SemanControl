import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import type { SessionEnvironment } from "../src/lib/auth/types";

let mf: Miniflare;
let env: SessionEnvironment;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
const projectId = "semancontrol-local";
const now = Math.floor(Date.now() / 1000);

beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", compatibilityDate: "2026-08-01", d1Databases: ["DB"] }));
  const DB = await mf.getD1Database("DB") as unknown as D1Database;
  const migration = await readFile(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
  for (const table of ["users", "clients"]) {
    const statement = migration.match(new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?\\n\\);`))?.[0];
    if (!statement) throw new Error(`Missing migration table ${table}`);
    await DB.prepare(statement).run();
  }
  env = { DB, FIREBASE_PROJECT_ID: projectId, APP_ORIGIN: "https://example.test", AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) } };
});
afterAll(async () => { await mf?.dispose(); });
beforeEach(async () => {
  env.APP_ORIGIN = "https://example.test";
  await env.DB.batch([env.DB.prepare("DELETE FROM users"), env.DB.prepare("DELETE FROM clients")]);
  await env.DB.prepare("INSERT INTO users (id, firebase_uid, email, name, role) VALUES ('worker-1', 'google-uid', 'worker@example.com', 'Trabajador', 'WORKER')").run();
});

async function signedToken() {
  return new SignJWT({ sub: "google-uid", aud: projectId, iss: `https://securetoken.google.com/${projectId}`, iat: now - 2, exp: now + 300, auth_time: now - 10, email: "worker@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" }, role: "ADMIN" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(keys.privateKey);
}
async function handlers() {
  const { createSessionHandlers } = await import("../src/lib/auth/session");
  const { createFirebaseTokenVerifier } = await import("../src/lib/auth/verify-token");
  return createSessionHandlers(async () => env, createFirebaseTokenVerifier(async () => keys.publicKey));
}

describe("session boundary", () => {
  it("stores a bounded HttpOnly Google token cookie and returns the D1 role", async () => {
    const { POST } = await handlers();
    const response = await POST(new Request("https://example.test/api/auth/session", { method: "POST", headers: { Origin: "https://example.test", Authorization: `Bearer ${await signedToken()}`, "Content-Type": "application/json", "x-user-role": "ADMIN" }, body: JSON.stringify({ role: "ADMIN" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { userId: "worker-1", firebaseUid: "google-uid", email: "worker@example.com", name: "Trabajador", role: "WORKER", clientId: null }, redirectTo: "/ruta" });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("semancontrol_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(Number(cookie.match(/Max-Age=(\d+)/)?.[1])).toBeGreaterThan(0);
    expect(Number(cookie.match(/Max-Age=(\d+)/)?.[1])).toBeLessThanOrEqual(300);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("uses a local HTTP cookie without Secure during development", async () => {
    env.APP_ORIGIN = "http://localhost:3000";
    const { POST } = await handlers();
    const response = await POST(new Request("http://localhost:3000/api/auth/session", { method: "POST", headers: { Origin: "http://localhost:3000", Authorization: `Bearer ${await signedToken()}` } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("uses the configured public origin when OpenNext reconstructs the internal URL", async () => {
    const { POST } = await handlers();
    const response = await POST(new Request("http://localhost/api/auth/session", { method: "POST", headers: { Origin: "https://example.test", Authorization: `Bearer ${await signedToken()}` } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("uses the configured HTTP preview origin despite an internal HTTPS URL", async () => {
    env.APP_ORIGIN = "http://127.0.0.1:8787";
    const { POST } = await handlers();
    const response = await POST(new Request("https://localhost/api/auth/session", { method: "POST", headers: { Origin: "http://127.0.0.1:8787", Authorization: `Bearer ${await signedToken()}` } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("ignores untrusted Host and X-Forwarded-Host headers when checking origin", async () => {
    const { POST } = await handlers();
    const response = await POST(new Request("https://example.test/api/auth/session", { method: "POST", headers: { Origin: "https://attacker.test", Host: "attacker.test", "X-Forwarded-Host": "attacker.test", Authorization: `Bearer ${await signedToken()}` } }));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["", "not-a-url", "ftp://example.test", "https://user:password@example.test", "https://example.test/path", "https://example.test?query=1", "https://example.test#hash"])("rejects invalid APP_ORIGIN configuration %s", async (origin) => {
    env.APP_ORIGIN = origin;
    const { POST, DELETE } = await handlers();
    for (const [method, handler] of [["POST", POST], ["DELETE", DELETE]] as const) {
      const response = await handler(new Request("https://example.test/api/auth/session", { method, headers: { Origin: "https://example.test", Authorization: `Bearer ${await signedToken()}` } }));
      expect(response.status).toBe(503);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(await response.json()).toMatchObject({ error: { code: "AUTH_NOT_CONFIGURED" } });
    }
  });

  it.each([undefined, "https://attacker.test", "null"])("denies POST with untrusted origin %s", async (origin) => {
    const { POST } = await handlers();
    const response = await POST(new Request("https://example.test/api/auth/session", { method: "POST", headers: { ...(origin ? { Origin: origin } : {}), Authorization: `Bearer ${await signedToken()}` } }));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("requires Bearer on POST instead of recycling a cookie", async () => {
    const { POST } = await handlers();
    const response = await POST(new Request("https://example.test/api/auth/session", { method: "POST", headers: { Origin: "https://example.test", Cookie: `semancontrol_session=${await signedToken()}` } }));
    expect(response.status).toBe(401);
  });

  it("denies excessive sessions through the runtime rate limiter", async () => {
    const { createSessionHandlers } = await import("../src/lib/auth/session");
    const { createFirebaseTokenVerifier } = await import("../src/lib/auth/verify-token");
    const limited = { ...env, AUTH_RATE_LIMITER: { limit: async () => ({ success: false }) } };
    const { POST } = createSessionHandlers(async () => limited, createFirebaseTokenVerifier(async () => keys.publicKey));
    const response = await POST(new Request("https://example.test/api/auth/session", { method: "POST", headers: { Origin: "https://example.test", Authorization: `Bearer ${await signedToken()}` } }));
    expect(response.status).toBe(429);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("revalidates the D1 role and activation on every GET", async () => {
    const { GET } = await handlers();
    const request = new Request("https://example.test/api/auth/session", { headers: { Cookie: `semancontrol_session=${await signedToken()}` } });
    const before = await GET(request);
    expect(before.status).toBe(200);
    await env.DB.prepare("UPDATE users SET is_active = 0 WHERE id = 'worker-1'").run();
    const after = await GET(request);
    expect(after.status).toBe(403);
    expect(after.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects malformed Bearer rather than falling back to a valid cookie", async () => {
    const { GET } = await handlers();
    const response = await GET(new Request("https://example.test/api/auth/session", { headers: { Authorization: "Basic injected", Cookie: `semancontrol_session=${await signedToken()}` } }));
    expect(response.status).toBe(401);
  });

  it("logs out only from the same origin and expires the cookie", async () => {
    const { DELETE } = await handlers();
    const denied = await DELETE(new Request("https://example.test/api/auth/session", { method: "DELETE", headers: { Origin: "https://attacker.test" } }));
    expect(denied.status).toBe(403);
    const response = await DELETE(new Request("https://example.test/api/auth/session", { method: "DELETE", headers: { Origin: "https://example.test" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("expires a Secure cookie at the configured origin when the DELETE URL is reconstructed", async () => {
    const { DELETE } = await handlers();
    const response = await DELETE(new Request("http://localhost/api/auth/session", { method: "DELETE", headers: { Origin: "https://example.test" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
