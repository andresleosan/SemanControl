"""HTTP checks against a running local Next.js/Workers server, without credentials."""

import argparse
import json
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def run(base):
    parsed = urllib.parse.urlparse(base)
    if parsed.scheme not in ("http", "https") or parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise ValueError("Este smoke test solo admite un servidor local.")
    opener = urllib.request.build_opener(NoRedirect)
    results = []

    def check(method, path, expected, headers=None):
        request = urllib.request.Request(base + path, method=method, headers=headers or {})
        try:
            response = opener.open(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read().decode("utf-8")
            actual = response.status
            assert actual == expected, f"{method} {path}: esperado {expected}, recibido {actual}; {body[:150]}"
            assert "cost_price" not in body, f"Costo expuesto en {path}"
            results.append({"method": method, "path": path, "status": actual})
            return response.headers, body

    headers, body = check("GET", "/login", 200)
    assert "Continuar con Google" in body
    assert headers.get("X-Content-Type-Options") == "nosniff"
    for path in ("/admin/cierre", "/ruta", "/mi-cuenta", "/sesion"):
        headers, _ = check("GET", path, 307)
        assert urllib.parse.urlparse(headers["Location"]).path == "/login"
        assert headers.get("Cache-Control") == "no-store"
    for path in ("/api/admin/productos", "/api/ruta/visita", "/api/mi-cuenta"):
        _, body = check("GET", path, 401, {"X-Role": "ADMIN"})
        assert json.loads(body)["error"]["code"] == "AUTH_REQUIRED"
    headers, _ = check("GET", "/api/auth/session", 401)
    assert headers.get("Cache-Control") == "no-store"
    check("POST", "/api/auth/session", 403, {"Origin": "https://untrusted.example"})
    check("POST", "/api/auth/session", 401, {"Origin": base})
    check("POST", "/api/auth/session", 401, {"Origin": base, "Authorization": "Bearer invalid.token.value"})
    check("DELETE", "/api/auth/session", 403, {"Origin": "https://untrusted.example"})
    headers, body = check("DELETE", "/api/auth/session", 200, {"Origin": base})
    assert json.loads(body) == {"ok": True}
    assert "Max-Age=0" in headers["Set-Cookie"]
    assert "HttpOnly" in headers["Set-Cookie"]
    check("POST", "/api/comprobantes", 401, {"Origin": base})
    for path in ("/api/vinculo/qr?data=x", "/api/admin/incidencias", "/api/ruta/incidencias/test/comprobante"):
        check("GET", path, 401)
    for path in ("/vincular", "/manifest.webmanifest", "/sw.js", "/pwa-icon.svg"):
        check("GET", path, 200)
    print(json.dumps({"checks_passed": len(results), "results": results}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8787")
    run(parser.parse_args().url.rstrip("/"))
