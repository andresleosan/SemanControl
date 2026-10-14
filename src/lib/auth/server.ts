import "server-only";
import { ApiError } from "../security/errors";
import { resolvePrincipal } from "./principal";
import type { AuthEnvironment, Principal, TokenVerifier } from "./types";
import { verifyFirebaseToken } from "./verify-token";

export const SESSION_COOKIE = "semancontrol_session";

export function readSessionToken(request: Request, bearerOnly = false): string {
  const authorization = request.headers.get("Authorization");
  if (authorization !== null) {
    const match = /^Bearer ([^\s,]+)$/i.exec(authorization);
    if (!match || match[1].length > 8192) throw new ApiError(401, "INVALID_TOKEN", "La sesión no es válida.");
    return match[1];
  }
  if (!bearerOnly) {
    const values = (request.headers.get("Cookie") ?? "").split(";")
      .map((part) => part.trim()).filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
    if (values.length === 1) {
      const token = values[0].slice(SESSION_COOKIE.length + 1);
      if (token && token.length <= 8192) return token;
    }
  }
  throw new ApiError(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
}

export function createAuthenticator(verifyToken: TokenVerifier) {
  return async (request: Request, env: AuthEnvironment): Promise<Principal> => {
    const identity = await verifyToken(readSessionToken(request), env.FIREBASE_PROJECT_ID);
    return resolvePrincipal(env.DB, identity);
  };
}

export const authenticate: (request: Request, env: AuthEnvironment) => Promise<Principal> = createAuthenticator(verifyFirebaseToken);
