export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(error: unknown): Response {
  const known = error instanceof ApiError;
  return Response.json({ error: {
    code: known ? error.code : "INTERNAL_ERROR",
    message: known ? error.message : "No se pudo completar la solicitud.",
  } }, { status: known ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}
