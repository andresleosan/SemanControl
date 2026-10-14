import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";

let mf: Miniflare;
let db: D1Database;
const identity = { uid: "google-uid", email: "person@example.com", name: "Google Name", expiresAt: 4102444800, issuedAt: 1, authTime: 1 };

beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", compatibilityDate: "2026-08-01", d1Databases: ["DB"] }));
  db = await mf.getD1Database("DB") as unknown as D1Database;
  const migration = await readFile(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
  for (const table of ["users", "clients"]) {
    const statement = migration.match(new RegExp(`CREATE TABLE ${table} \\([\\s\\S]*?\\n\\);`))?.[0];
    if (!statement) throw new Error(`Missing migration table ${table}`);
    await db.prepare(statement).run();
  }
});
afterAll(async () => { await mf?.dispose(); });
beforeEach(async () => { await db.batch([db.prepare("DELETE FROM users"), db.prepare("DELETE FROM clients")]); });

async function user(role = "WORKER", uid: string | null = null, active = 1) {
  await db.prepare("INSERT INTO users (id, email, name, role, firebase_uid, is_active) VALUES (?, ?, ?, ?, ?, ?)")
    .bind("user-1", "person@example.com", "D1 Name", role, uid, active).run();
}
async function card(uid: string | null = null, active = 1) {
  await db.prepare("INSERT INTO clients (id, linked_email, name, firebase_uid, is_active, address, address_reference, route_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind("card-1", "person@example.com", "Card Name", uid, active, "Calle de prueba", "Reja azul", 1).run();
}

describe("D1 authorization and account linking", () => {
  it("uses the D1 worker role and claims only the initially empty UID", async () => {
    const { resolvePrincipal } = await import("../src/lib/auth/principal");
    await user();
    expect(await resolvePrincipal(db, identity)).toEqual({ userId: "user-1", firebaseUid: "google-uid", email: "person@example.com", name: "D1 Name", role: "WORKER", clientId: null });
    expect(await db.prepare("SELECT firebase_uid FROM users WHERE id = 'user-1'").first()).toEqual({ firebase_uid: "google-uid" });
  });

  it("never substitutes another UID just because the verified email matches", async () => {
    const { resolvePrincipal } = await import("../src/lib/auth/principal");
    await user("ADMIN", "existing-uid");
    await expect(resolvePrincipal(db, identity)).rejects.toMatchObject({ status: 403 });
    expect(await db.prepare("SELECT firebase_uid FROM users WHERE id = 'user-1'").first()).toEqual({ firebase_uid: "existing-uid" });
  });

  it("keeps a registered UID as the identity when Google changes its email", async () => {
    const { resolvePrincipal } = await import("../src/lib/auth/principal");
    await user("ADMIN", "google-uid");
    expect(await resolvePrincipal(db, { ...identity, email: "new@example.com" })).toMatchObject({ userId: "user-1", role: "ADMIN", email: "person@example.com" });
  });

  it("denies deactivated staff even if a client card could otherwise match", async () => {
    const { resolvePrincipal } = await import("../src/lib/auth/principal");
    await user("WORKER", null, 0); await card();
    await expect(resolvePrincipal(db, identity)).rejects.toMatchObject({ status: 403 });
    expect(await db.prepare("SELECT firebase_uid FROM clients").first()).toEqual({ firebase_uid: null });
  });

  it("derives CLIENT from an active card without creating a users row", async () => {
    const { resolvePrincipal } = await import("../src/lib/auth/principal");
    await card();
    expect(await resolvePrincipal(db, identity)).toEqual({ userId: "card-1", firebaseUid: "google-uid", email: "person@example.com", name: "Card Name", role: "CLIENT", clientId: "card-1" });
    expect(await db.prepare("SELECT count(*) AS count FROM users").first()).toEqual({ count: 0 });
  });

  it("denies a client card linked to a different UID without replacing it", async () => {
    const { resolvePrincipal } = await import("../src/lib/auth/principal");
    await card("existing-uid");
    await expect(resolvePrincipal(db, identity)).rejects.toMatchObject({ status: 403 });
    expect(await db.prepare("SELECT firebase_uid FROM clients").first()).toEqual({ firebase_uid: "existing-uid" });
  });

  it("denies inactive client cards and users CLIENT without an active card", async () => {
    const { resolvePrincipal } = await import("../src/lib/auth/principal");
    await user("CLIENT"); await card(null, 0);
    await expect(resolvePrincipal(db, identity)).rejects.toMatchObject({ status: 403 });
    expect(await db.prepare("SELECT firebase_uid FROM users").first()).toEqual({ firebase_uid: null });
  });

  it("verifies and links an existing CLIENT user together with its card", async () => {
    const { resolvePrincipal } = await import("../src/lib/auth/principal");
    await user("CLIENT"); await card();
    expect(await resolvePrincipal(db, identity)).toMatchObject({ userId: "user-1", role: "CLIENT", clientId: "card-1" });
    expect(await db.prepare("SELECT firebase_uid FROM users").first()).toEqual({ firebase_uid: "google-uid" });
    expect(await db.prepare("SELECT firebase_uid FROM clients").first()).toEqual({ firebase_uid: "google-uid" });
  });

  it("prevents a competing first login from taking the same card", async () => {
    const { resolvePrincipal } = await import("../src/lib/auth/principal");
    await card();
    const results = await Promise.allSettled([resolvePrincipal(db, identity), resolvePrincipal(db, { ...identity, uid: "competitor-uid" })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const saved = await db.prepare("SELECT firebase_uid FROM clients").first<{ firebase_uid: string }>();
    const winner = results.find((result) => result.status === "fulfilled");
    expect(winner?.status === "fulfilled" && winner.value.firebaseUid).toBe(saved?.firebase_uid);
  });

  it("denies an unknown identity instead of creating STAFF", async () => {
    const { resolvePrincipal } = await import("../src/lib/auth/principal");
    await expect(resolvePrincipal(db, identity)).rejects.toMatchObject({ status: 403 });
    expect(await db.prepare("SELECT count(*) AS count FROM users").first()).toEqual({ count: 0 });
  });

  it("requires the persisted role to match the authorized roles", async () => {
    const { resolvePrincipal, requireRole } = await import("../src/lib/auth/principal");
    await user();
    const principal = await resolvePrincipal(db, identity);
    expect(() => requireRole(principal, ["ADMIN"])).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() => requireRole(principal, ["WORKER"])).not.toThrow();
  });
});

describe("request authentication", () => {
  it.each([
    new Request("https://example.test/api/ruta"),
    new Request("https://example.test/api/ruta", { headers: { Authorization: "Bearer invalid", "x-user-role": "ADMIN" } }),
    new Request("https://example.test/api/ruta", { headers: { Cookie: "semancontrol_session=invalid" } }),
  ])("denies missing or invalid tokens before touching D1", async (request) => {
    const { authenticate } = await import("../src/lib/auth/server");
    const inaccessibleDb = { prepare() { throw new Error("D1 must not be read for an invalid token"); } } as unknown as D1Database;
    await expect(authenticate(request, { DB: inaccessibleDb, FIREBASE_PROJECT_ID: "semancontrol-local" })).rejects.toMatchObject({ status: 401 });
  });
});
