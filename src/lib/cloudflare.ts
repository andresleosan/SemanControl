import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}
