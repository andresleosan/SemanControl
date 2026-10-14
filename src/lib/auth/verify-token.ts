import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { ApiError } from "../security/errors";
import type { TokenVerifier } from "./types";

// A fixed Google endpoint prevents attacker-controlled jku/x5u key sources.
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"), {
  timeoutDuration: 5000,
  cooldownDuration: 30000,
});

export function createFirebaseTokenVerifier(resolveKey: JWTVerifyGetKey): TokenVerifier {
  return async (token, projectId) => {
    if (!projectId?.trim()) throw new ApiError(503, "AUTH_NOT_CONFIGURED", "La autenticación no está configurada.");
    try {
      if (!token || token.length > 8192) throw new Error("Invalid token length");
      const { payload, protectedHeader } = await jwtVerify(token, resolveKey, {
        algorithms: ["RS256"],
        audience: projectId,
        issuer: `https://securetoken.google.com/${projectId}`,
        requiredClaims: ["exp", "iat", "auth_time", "sub", "email", "email_verified", "firebase"],
      });
      const now = Math.floor(Date.now() / 1000);
      const { sub, exp, iat, auth_time: authTime, email, firebase } = payload;
      if (
        typeof protectedHeader.kid !== "string" || protectedHeader.kid.length === 0 ||
        payload.aud !== projectId ||
        typeof sub !== "string" || sub.length === 0 || sub.length > 128 ||
        typeof exp !== "number" || !Number.isInteger(exp) || exp <= now ||
        typeof iat !== "number" || !Number.isInteger(iat) || iat < 0 || iat > now || iat >= exp ||
        typeof authTime !== "number" || !Number.isInteger(authTime) || authTime < 0 || authTime > now || authTime > iat ||
        typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        payload.email_verified !== true ||
        typeof firebase !== "object" || firebase === null ||
        !("sign_in_provider" in firebase) || firebase.sign_in_provider !== "google.com"
      ) throw new Error("Invalid Firebase claims");

      return { uid: sub, email: email.toLowerCase(), name: typeof payload.name === "string" ? payload.name : email, expiresAt: exp, issuedAt: iat, authTime };
    } catch {
      throw new ApiError(401, "INVALID_TOKEN", "La sesión no es válida o ha vencido. Inicia sesión nuevamente.");
    }
  };
}

export const verifyFirebaseToken: TokenVerifier = createFirebaseTokenVerifier(googleKeys);
