import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GoogleSignInButton } from "../src/app/login/sign-in-button";

const publicConfiguration = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "test-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "semancontrol-test.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "semancontrol-test",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123:web:test",
};

function configureFirebase() {
  for (const [key, value] of Object.entries(publicConfiguration)) vi.stubEnv(key, value);
}

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

  it("recognizes complete configuration without requiring browser auth", async () => {
    configureFirebase();
    const { isFirebaseConfigured } = await import("../src/lib/auth/client");
    expect(isFirebaseConfigured()).toBe(true);
  });

  it.each(Object.keys(publicConfiguration))("rejects configuration missing %s", async (key) => {
    configureFirebase();
    vi.stubEnv(key, "");
    const { isFirebaseConfigured } = await import("../src/lib/auth/client");
    expect(isFirebaseConfigured()).toBe(false);
  });

  it("disables Google access and explains the pending setup when configuration is incomplete", () => {
    configureFirebase();
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "");
    const html = renderToStaticMarkup(createElement(GoogleSignInButton));
    expect(html).toMatch(/<button\b[^>]*\bdisabled=""/);
    expect(html).toContain("Acceso con Google pendiente");
    expect(html).toContain("El administrador está preparando el acceso. Vuelve a intentarlo más tarde.");
  });

  it("enables Google access when its configuration is complete", () => {
    configureFirebase();
    const html = renderToStaticMarkup(createElement(GoogleSignInButton));
    expect(html).not.toMatch(/<button\b[^>]*\bdisabled=""/);
    expect(html).toContain("Continuar con Google");
  });
});
