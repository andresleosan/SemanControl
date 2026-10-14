export type Role = "ADMIN" | "WORKER" | "CLIENT";
export type AuthEnvironment = Pick<CloudflareEnv, "DB" | "FIREBASE_PROJECT_ID">;
export type SessionEnvironment = AuthEnvironment & Pick<CloudflareEnv, "AUTH_RATE_LIMITER" | "APP_ORIGIN">;

export interface Principal {
  userId: string;
  firebaseUid: string;
  email: string;
  name: string;
  role: Role;
  clientId: string | null;
}

export interface FirebaseIdentity {
  uid: string;
  email: string;
  name: string;
  expiresAt: number;
  issuedAt: number;
  authTime: number;
}

export type TokenVerifier = (token: string, projectId: string) => Promise<FirebaseIdentity>;
