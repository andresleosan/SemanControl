import "server-only";
import { ApiError, errorResponse } from "../security/errors";
import { roleHome } from "./paths";
import { resolvePrincipal } from "./principal";
import { readSessionToken, SESSION_COOKIE } from "./server";
import type { Principal, SessionEnvironment, TokenVerifier } from "./types";
import { verifyFirebaseToken } from "./verify-token";

function configuredOrigin(env: SessionEnvironment): URL {
  try {
    if (typeof env.APP_ORIGIN !== "string" || !/^https?:\/\/[^/?#]+\/?$/i.test(env.APP_ORIGIN.trim())) throw new Error("Invalid origin");
    const url = new URL(env.APP_ORIGIN.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid origin");
    return url;
  } catch {
    throw new ApiError(503, "AUTH_NOT_CONFIGURED", "El origen de la aplicación no está configurado correctamente.");
  }
}
function assertSameOrigin(request: Request, appOrigin: URL): void {
  if (request.headers.get("Origin") !== appOrigin.origin) {
    throw new ApiError(403, "ORIGIN_FORBIDDEN", "La solicitud debe proceder del mismo sitio.");
  }
}
function cookie(appOrigin: URL, token: string, maxAge: number, expiresAt: number): string {
  const secure = appOrigin.protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${new Date(expiresAt * 1000).toUTCString()}${secure}`;
}
function sessionResponse(user: Principal, headers: Record<string, string> = {}): Response {
  return Response.json({ user, redirectTo: roleHome(user.role) }, { headers: { "Cache-Control": "no-store", Vary: "Cookie, Authorization", ...headers } });
}

export function createSessionHandlers(getEnvironment: () => Promise<SessionEnvironment>, verifyToken: TokenVerifier = verifyFirebaseToken) {
  return {
    async POST(request: Request): Promise<Response> {
      try {
        const env = await getEnvironment();
        const appOrigin = configuredOrigin(env);
        assertSameOrigin(request, appOrigin);
        const token = readSessionToken(request, true);
        const identity = await verifyToken(token, env.FIREBASE_PROJECT_ID);
        const rate = await env.AUTH_RATE_LIMITER.limit({ key: `session:${identity.uid}` });
        if (!rate.success) throw new ApiError(429, "RATE_LIMITED", "Espera un momento antes de intentar iniciar sesión nuevamente.");
        const user = await resolvePrincipal(env.DB, identity);
        const maxAge = identity.expiresAt - Math.floor(Date.now() / 1000);
        if (maxAge <= 0) throw new ApiError(401, "INVALID_TOKEN", "La sesión ha vencido. Inicia sesión nuevamente.");
        return sessionResponse(user, { "Set-Cookie": cookie(appOrigin, token, maxAge, identity.expiresAt) });
      } catch (error) { return errorResponse(error); }
    },
    async GET(request: Request): Promise<Response> {
      try {
        const token = readSessionToken(request);
        const env = await getEnvironment();
        const identity = await verifyToken(token, env.FIREBASE_PROJECT_ID);
        return sessionResponse(await resolvePrincipal(env.DB, identity));
      } catch (error) { return errorResponse(error); }
    },
    async DELETE(request: Request): Promise<Response> {
      try {
        const env = await getEnvironment();
        const appOrigin = configuredOrigin(env);
        assertSameOrigin(request, appOrigin);
        return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": cookie(appOrigin, "", 0, 0) } });
      } catch (error) { return errorResponse(error); }
    },
  };
}
