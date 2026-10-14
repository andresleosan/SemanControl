import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { chromium, expect as browserExpect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { build } from "esbuild";

type Choice = { outcome: "accepted" | "dismissed"; platform: string };
type PromptState = { calls: number; settle: (choice: Choice) => void };
type InstallWindow = Window & { __installTest?: PromptState };

let browser: Browser, server: Server, origin = "";
let contexts: BrowserContext[] = [], errors: string[] = [];

beforeAll(async () => {
  // Real React, real install controls and their CSS modules; no app transport,
  // authentication, service worker, Cloudflare bindings or persistent storage.
  const bundle = await build({
    entryPoints: [resolve("tests/install-fixture.tsx")], outdir: resolve(".wrangler/tmp/install-fixture"),
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' }, loader: { ".css": "local-css" },
  });
  const js = bundle.outputFiles.find((file) => file.path.endsWith(".js"))?.text;
  const css = bundle.outputFiles.find((file) => file.path.endsWith(".css"))?.text;
  if (!js || !css) throw new Error("Install fixture did not produce JavaScript and CSS");
  server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    response.setHeader("Cache-Control", "no-store");
    if (path === "/fixture.js" || path === "/fixture.css") {
      response.setHeader("Content-Type", path.endsWith(".js") ? "text/javascript" : "text/css");
      response.end(path.endsWith(".js") ? js : css); return;
    }
    if (path !== "/") { response.writeHead(404); response.end(); return; }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end('<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instalación aislada</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}header,main{padding:16px}h1{font-size:24px}</style><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Install fixture port unavailable");
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
}, 30000);

afterEach(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  contexts = [];
  const observed = errors; errors = [];
  expect(observed, "Uncaught install UI errors").toEqual([]);
});
afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
});

async function open(mode: "browser" | "standalone" | "ios" = "browser") {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 }, locale: "es-CO" });
  contexts.push(context);
  if (mode !== "browser") await context.addInitScript((display) => {
    if (display === "ios") Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    else {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        const result = original(query);
        if (query === "(display-mode: standalone)") Object.defineProperty(result, "matches", { value: true });
        return result;
      };
    }
  }, mode);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await browserExpect(page.locator("html")).toHaveAttribute("data-install-fixture-ready", "true");
  return page;
}

async function offer(page: Page, failure: "none" | "sync" | "async" = "none") {
  return page.evaluate((failureMode) => {
    let settle!: (choice: Choice) => void;
    const state: PromptState = { calls: 0, settle: (choice) => settle(choice) };
    const userChoice = new Promise<Choice>((done) => { settle = done; });
    (window as InstallWindow).__installTest = state;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(event, {
      userChoice: { value: userChoice },
      prompt: { value: () => {
        state.calls++;
        if (failureMode === "sync") throw new Error("Controlled unavailable prompt");
        return failureMode === "async" ? Promise.reject(new Error("Controlled unavailable prompt")) : Promise.resolve();
      } },
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }, failure);
}

async function settle(page: Page, outcome: Choice["outcome"]) {
  await page.evaluate((value) => (window as InstallWindow).__installTest!.settle({ outcome: value, platform: "web" }), outcome);
}
async function calls(page: Page) { return page.evaluate(() => (window as InstallWindow).__installTest!.calls); }
async function installed(page: Page) { await page.evaluate(() => window.dispatchEvent(new Event("appinstalled"))); }
const installButtons = (page: Page) => page.getByRole("button", { name: "Instalar app", exact: true });
const help = (page: Page) => page.getByRole("dialog", { name: "SemanControl en tu celular", exact: true });

describe("shared install controls in a real mobile browser", () => {
  it("opens useful fallback with click or Enter and restores focus after Escape without 320px overflow", async () => {
    const page = await open();
    const header = installButtons(page).first();
    await header.click();
    await browserExpect(help(page)).toBeVisible();
    await browserExpect(help(page)).toContainText("Android · Chrome");
    await browserExpect(help(page)).toContainText("iPhone · Safari");
    await browserExpect(page.getByRole("button", { name: "Cerrar instrucciones de instalación" })).toBeFocused();
    const layout = await page.evaluate(() => {
      const dialog = document.querySelector("dialog")!;
      const bounds = dialog.getBoundingClientRect();
      return { pageWidth: document.documentElement.scrollWidth, viewport: innerWidth, left: bounds.left, right: bounds.right, content: dialog.scrollWidth, box: dialog.clientWidth };
    });
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(layout.viewport);
    expect(layout.content).toBeLessThanOrEqual(layout.box);
    await page.keyboard.press("Escape");
    await browserExpect(help(page)).not.toBeVisible();
    await browserExpect(header).toBeFocused();
    await header.press("Enter");
    await browserExpect(help(page)).toBeVisible();
    await page.getByRole("button", { name: "Cerrar instrucciones de instalación" }).click();
    await browserExpect(header).toBeFocused();
  });

  it("shares one cancelable prompt across both controls and consumes dismissal before showing fallback", async () => {
    const page = await open();
    expect(await offer(page)).toBe(true);
    // Same-turn activation catches duplicate calls before React commits disabled.
    await installButtons(page).first().evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
      (document.querySelector("main button") as HTMLButtonElement).click();
    });
    expect(await calls(page)).toBe(1);
    for (const button of await installButtons(page).all()) await browserExpect(button).toBeDisabled();
    await settle(page, "dismissed");
    await browserExpect(installButtons(page).last()).toBeEnabled();
    await installButtons(page).last().click();
    await browserExpect(help(page)).toBeVisible();
    expect(await calls(page)).toBe(1);
    await browserExpect(page.getByRole("link", { name: "Abrir app", exact: true })).toHaveCount(0);
  });

  it("does not claim an accepted prompt installed the app before appinstalled confirms it", async () => {
    const page = await open();
    await offer(page);
    await installButtons(page).first().click();
    await settle(page, "accepted");
    await browserExpect(installButtons(page).first()).toBeEnabled();
    await browserExpect(installButtons(page)).toHaveCount(2);
    await browserExpect(page.getByRole("link", { name: "Abrir app", exact: true })).toHaveCount(0);
    await installed(page);
    await browserExpect(page.getByRole("link", { name: "Abrir app", exact: true })).toHaveCount(2);
  });

  it("clears a pending choice and open help when installation is confirmed externally", async () => {
    const page = await open();
    await installButtons(page).first().click();
    await browserExpect(help(page)).toBeVisible();
    await offer(page);
    // A late browser offer can arrive while help is open; exercise the shared
    // controller without invoking or accepting any operating-system install UI.
    await installButtons(page).last().evaluate((button) => (button as HTMLButtonElement).click());
    expect(await calls(page)).toBe(1);
    await browserExpect(installButtons(page).first()).toBeDisabled();
    await installed(page);
    await browserExpect(help(page)).not.toBeVisible();
    const links = page.getByRole("link", { name: "Abrir app", exact: true });
    await browserExpect(links).toHaveCount(2);
    await browserExpect(links.first()).toHaveAttribute("href", "/login");
    await settle(page, "dismissed");
    await browserExpect(links).toHaveCount(2);
    await browserExpect(installButtons(page)).toHaveCount(0);
  });

  it("recovers from synchronous and asynchronous prompt errors using manual installation help", async () => {
    for (const failure of ["sync", "async"] as const) {
      const page = await open();
      await offer(page, failure);
      await installButtons(page).first().click();
      await browserExpect(help(page)).toBeVisible();
      await browserExpect(page.getByRole("status")).toContainText("El navegador no pudo abrir la instalación");
      expect(await calls(page)).toBe(1);
      await page.getByRole("button", { name: "Cerrar instrucciones de instalación" }).click();
      await browserExpect(installButtons(page).first()).toBeEnabled();
      await installButtons(page).last().click();
      await browserExpect(help(page)).toBeVisible();
      expect(await calls(page)).toBe(1);
    }
  });

  it("opens the same local app instead of promoting installation in standalone and iOS home-screen mode", async () => {
    for (const mode of ["standalone", "ios"] as const) {
      const page = await open(mode);
      await browserExpect(installButtons(page)).toHaveCount(0);
      const links = page.getByRole("link", { name: "Abrir app", exact: true });
      await browserExpect(links).toHaveCount(2);
      for (const link of await links.all()) {
        await browserExpect(link).toHaveAttribute("href", "/login");
        expect(await link.evaluate((element) => (element as HTMLAnchorElement).origin)).toBe(origin);
      }
    }
  });
});
