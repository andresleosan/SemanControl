export type { Role, Principal, FirebaseIdentity } from "./types";
export { authenticate } from "./server";
export { requireRole, resolvePrincipal } from "./principal";
export { verifyFirebaseToken } from "./verify-token";
export { roleHome } from "./paths";
export { ApiError, errorResponse } from "../security/errors";
