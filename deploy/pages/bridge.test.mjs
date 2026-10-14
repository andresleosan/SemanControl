import test from "node:test";
import assert from "node:assert/strict";
import bridge from "./public/_worker.js";

test("el backend recibe el origen público, identidad, query y cuerpo originales", async () => {
  const request = new globalThis.Request("https://semancontrol.pages.dev/api/admin/cobros?tarjeta=12", {
    method: "POST",
    headers: {
      Origin: "https://semancontrol.pages.dev",
      Cookie: "sc_session=fixture-token",
      Authorization: "Bearer fixture-token",
      "Content-Type": "application/json",
      "Idempotency-Key": "fixture-operation",
    },
    body: '{"amount":2500}',
  });
  const response = await bridge.fetch(request, {
    SEMANCONTROL: {
      async fetch(received) {
        return globalThis.Response.json({
          url: received.url,
          method: received.method,
          origin: received.headers.get("Origin"),
          cookie: received.headers.get("Cookie"),
          authorization: received.headers.get("Authorization"),
          contentType: received.headers.get("Content-Type"),
          operation: received.headers.get("Idempotency-Key"),
          body: await received.json(),
        });
      },
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    url: "https://semancontrol.pages.dev/api/admin/cobros?tarjeta=12",
    method: "POST",
    origin: "https://semancontrol.pages.dev",
    cookie: "sc_session=fixture-token",
    authorization: "Bearer fixture-token",
    contentType: "application/json",
    operation: "fixture-operation",
    body: { amount: 2500 },
  });
});

test("entrega el primer chunk sin esperar a que termine la respuesta y conserva Set-Cookie", { timeout: 2000 }, async () => {
  let writer;
  const stream = new globalThis.ReadableStream({
    start(controller) {
      writer = controller;
      controller.enqueue(new globalThis.TextEncoder().encode("primero"));
    },
  });
  const response = await bridge.fetch(new globalThis.Request("https://semancontrol.pages.dev/ruta"), {
    SEMANCONTROL: {
      async fetch() {
        return new globalThis.Response(stream, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            Vary: "Cookie, Authorization",
            "Set-Cookie": "sc_session=fixture-token; Path=/; HttpOnly; SameSite=Lax; Secure",
          },
        });
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Vary"), "Cookie, Authorization");
  assert.equal(response.headers.get("Set-Cookie"), "sc_session=fixture-token; Path=/; HttpOnly; SameSite=Lax; Secure");
  const reader = response.body.getReader();
  assert.equal(new globalThis.TextDecoder().decode((await reader.read()).value), "primero");
  writer.enqueue(new globalThis.TextEncoder().encode("segundo"));
  writer.close();
  assert.equal(new globalThis.TextDecoder().decode((await reader.read()).value), "segundo");
  assert.equal((await reader.read()).done, true);
});

test("conserva la redirección de acceso dentro de pages.dev", async () => {
  const response = await bridge.fetch(new globalThis.Request("https://semancontrol.pages.dev/admin/cierre"), {
    SEMANCONTROL: {
      async fetch(request) {
        return globalThis.Response.redirect(new globalThis.URL("/login?next=%2Fadmin%2Fcierre", request.url), 307);
      },
    },
  });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("Location"), "https://semancontrol.pages.dev/login?next=%2Fadmin%2Fcierre");
});

test("una denegación de API mantiene estado, cuerpo y política de caché", async () => {
  const response = await bridge.fetch(new globalThis.Request("https://semancontrol.pages.dev/api/admin/clientes"), {
    SEMANCONTROL: {
      async fetch() {
        return globalThis.Response.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
      },
    },
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { error: "UNAUTHENTICATED" });
});
