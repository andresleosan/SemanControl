import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { authenticate, readSessionToken } from "@/lib/auth/server";
import { requireRole } from "@/lib/auth/principal";
import { requiredRolesForPath } from "@/lib/auth/paths";
import { ApiError, errorResponse } from "@/lib/security/errors";

export async function middleware(request: NextRequest): Promise<Response> {
  const roles = requiredRolesForPath(request.nextUrl.pathname);
  if (roles === null) return NextResponse.next();
  try {
    readSessionToken(request);
    const principal = await authenticate(request, await getEnv());
    if (roles.length) requireRole(principal, roles);
    return NextResponse.next();
  } catch (error) {
    if (!request.nextUrl.pathname.startsWith("/api/") && error instanceof ApiError && error.status === 401) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      const response = NextResponse.redirect(url);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    return errorResponse(error);
  }
}

export const config = {
  matcher: ["/admin/:path*", "/ruta/:path*", "/mi-cuenta/:path*", "/sesion/:path*", "/api/admin/:path*", "/api/ruta/:path*", "/api/mi-cuenta/:path*"],
};
