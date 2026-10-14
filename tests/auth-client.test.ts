import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("lazy Firebase web client", () => {
  it("can import during server rendering and refuses browser auth on the server", async () => {
    const { getFirebaseAuth } = await import("../src/lib/auth/client");
    expect(() => getFirebaseAuth()).toThrow("navegador");
  });

  it("reports missing public configuration when login is attempted", async () => {
    vi.stubGlobal("window", {});
    for (const key of ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_APP_ID"]) vi.stubEnv(key, "");
    const { getFirebaseAuth } = await import("../src/lib/auth/client");
    expect(() => getFirebaseAuth()).toThrow("Firebase");
  });
});
