import { getEnv } from "@/lib/cloudflare";
import { createSessionHandlers } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const { GET, POST, DELETE } = createSessionHandlers(getEnv);
