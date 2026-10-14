import "server-only";
import { ApiError } from "../security/errors";
import type { FirebaseIdentity, Principal, Role } from "./types";

interface UserRow { id: string; firebase_uid: string | null; email: string; name: string; role: Role; is_active: number }
interface ClientRow { id: string; firebase_uid: string | null; linked_email: string | null; name: string; is_active: number }
const USER_COLUMNS = "id, firebase_uid, email, name, role, is_active";
const CLIENT_COLUMNS = "id, firebase_uid, linked_email, name, is_active";

function deny(): never {
  throw new ApiError(403, "ACCESS_DENIED", "Esta cuenta no tiene acceso activo o requiere que el administrador revise su vínculo.");
}
function assertCompatible(row: { firebase_uid: string | null; is_active: number }, uid: string) {
  if (row.is_active !== 1 || (row.firebase_uid !== null && row.firebase_uid !== uid)) deny();
}

async function findUser(db: D1Database, identity: FirebaseIdentity): Promise<UserRow | null> {
  const registered = await db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE firebase_uid = ?`).bind(identity.uid).first<UserRow>();
  return registered ?? db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`).bind(identity.email).first<UserRow>();
}
async function findClient(db: D1Database, identity: FirebaseIdentity): Promise<ClientRow | null> {
  const registered = await db.prepare(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE firebase_uid = ?`).bind(identity.uid).first<ClientRow>();
  return registered ?? db.prepare(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE linked_email = ?`).bind(identity.email).first<ClientRow>();
}

export async function resolvePrincipal(db: D1Database, identity: FirebaseIdentity): Promise<Principal> {
  let user = await findUser(db, identity);
  if (user) {
    assertCompatible(user, identity.uid);
    if (!["ADMIN", "WORKER", "CLIENT"].includes(user.role)) deny();
    if (user.role !== "CLIENT") {
      if (user.firebase_uid === null) {
        await db.prepare("UPDATE users SET firebase_uid = ? WHERE id = ? AND email = ? AND firebase_uid IS NULL AND is_active = 1")
          .bind(identity.uid, user.id, identity.email).run();
        user = await db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(user.id).first<UserRow>();
        if (!user || user.firebase_uid !== identity.uid || user.is_active !== 1 || user.role === "CLIENT") deny();
      }
      return { userId: user.id, firebaseUid: identity.uid, email: user.email, name: user.name, role: user.role, clientId: null };
    }
  }

  let client = await findClient(db, identity);
  if (!client) deny();
  assertCompatible(client, identity.uid);

  if (user) {
    // Both claims run in one D1 transaction. Each checks the counterpart's
    // compatible binding, so a racing login cannot leave a partial new link.
    await db.batch([
      db.prepare("UPDATE clients SET firebase_uid = ? WHERE id = ? AND linked_email = ? AND firebase_uid IS NULL AND is_active = 1 AND EXISTS (SELECT 1 FROM users WHERE id = ? AND is_active = 1 AND role = 'CLIENT' AND (firebase_uid IS NULL OR firebase_uid = ?))")
        .bind(identity.uid, client.id, identity.email, user.id, identity.uid),
      db.prepare("UPDATE users SET firebase_uid = ? WHERE id = ? AND email = ? AND firebase_uid IS NULL AND is_active = 1 AND role = 'CLIENT' AND EXISTS (SELECT 1 FROM clients WHERE id = ? AND is_active = 1 AND firebase_uid = ?)")
        .bind(identity.uid, user.id, identity.email, client.id, identity.uid),
    ]);
    user = await db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(user.id).first<UserRow>();
    if (!user || user.firebase_uid !== identity.uid || user.is_active !== 1 || user.role !== "CLIENT") deny();
  } else if (client.firebase_uid === null) {
    await db.prepare("UPDATE clients SET firebase_uid = ? WHERE id = ? AND linked_email = ? AND firebase_uid IS NULL AND is_active = 1")
      .bind(identity.uid, client.id, identity.email).run();
  }
  client = await db.prepare(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id = ?`).bind(client.id).first<ClientRow>();
  if (!client || client.firebase_uid !== identity.uid || client.is_active !== 1) deny();
  return {
    userId: user?.id ?? client.id, firebaseUid: identity.uid,
    email: user?.email ?? client.linked_email ?? identity.email,
    name: user?.name ?? client.name, role: "CLIENT", clientId: client.id,
  };
}

export function requireRole(principal: Principal, roles: readonly Role[]): void {
  if (!roles.includes(principal.role)) throw new ApiError(403, "ROLE_FORBIDDEN", "Tu cuenta no tiene permiso para esta sección.");
}
