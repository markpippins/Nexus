#!/usr/bin/env python3
"""serve_docs.py — one port, browsable API docs for every *-srv.

Serves the committed `openapi.yaml` specs of all *-srv services behind a
single-page index with:

  - a sidebar of services (name, endpoint count, description)
  - an embedded **Swagger UI** panel (service switchable from the sidebar)
  - per-service **ReDoc** pages
  - raw spec access at `/specs/<service>.yaml`

Routes:
    GET /                      index (generated at request time)
    GET /specs/<service>.yaml  raw OpenAPI spec (YAML)
    GET /redoc/<service>       ReDoc page for one service
    GET /health                status JSON

Usage:
    python tools/api-docs/serve_docs.py [--port 3180] [--host 127.0.0.1]
    python tools/api-docs/serve_docs.py --tls-cert CERT --tls-key KEY

When --tls-cert/--tls-key are given, a second HTTPS listener is started on
--tls-host:--tls-port (default 0.0.0.0:8443) in addition to the plain-HTTP
listener, so LAN clients can reach the index over TLS while localhost
tooling (health checks, drift CI) keeps using plain HTTP. If the cert/key
files don't exist, a self-signed certificate is generated automatically
with openssl (SANs: localhost, hostname, and the host's non-loopback IPv4
addresses).

Requires no third-party packages. Swagger UI and ReDoc are loaded from CDN
(needs internet access in the browser). "Try it out" targets the servers
declared in each spec (the services' own ports).
"""
import argparse
import http.server
import json
import os
import socket
import socketserver
import ssl
import subprocess
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

SWAGGER_JS = "https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"
SWAGGER_CSS = "https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"
REDOC_JS = "https://cdn.jsdelivr.net/npm/redoc@2.1.5/bundles/redoc.standalone.js"

EXCLUDED = {"pty-srv", "terrain-srv"}  # no committed openapi.yaml


def find_specs():
    specs = []
    for base in ("typescript", "python"):
        d = os.path.join(ROOT, base)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if not name.endswith("-srv") or name in EXCLUDED:
                continue
            svc_dir = os.path.join(d, name)
            spec_path = os.path.join(svc_dir, "openapi.yaml")
            if not os.path.exists(spec_path):
                continue
            specs.append({
                "name": name,
                "base": base,
                "path": spec_path,
                "url": f"/specs/{name}.yaml",
            })
    return specs


def service_meta(spec_path):
    try:
        import yaml
        with open(spec_path, encoding="utf-8") as f:
            spec = yaml.safe_load(f) or {}
        info = spec.get("info") or {}
        npaths = len(spec.get("paths") or {})
        nops = sum(len(v) for v in (spec.get("paths") or {}).values() if isinstance(v, dict))
        return info.get("title", ""), (info.get("description") or ""), npaths, nops
    except Exception:
        return "", "", 0, 0


INDEX_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nexus — Service API Docs</title>
<link rel="stylesheet" href="{SWAGGER_CSS}">
<style>
  :root {{
    --bg: #0f172a; --panel: #1e293b; --panel2: #273449; --line: #334155;
    --text: #e2e8f0; --muted: #94a3b8; --accent: #38bdf8; --good: #34d399;
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); }}
  header {{ padding: 18px 26px; border-bottom: 1px solid var(--line); background: linear-gradient(180deg, #16233a, var(--bg)); }}
  header h1 {{ margin: 0; font-size: 20px; letter-spacing: 0.3px; }}
  header p {{ margin: 4px 0 0; color: var(--muted); font-size: 13px; }}
  .wrap {{ display: flex; min-height: calc(100vh - 76px); }}
  aside {{ width: 300px; min-width: 300px; border-right: 1px solid var(--line); padding: 14px 10px; overflow-y: auto; max-height: calc(100vh - 76px); }}
  .svc {{ display: block; width: 100%; text-align: left; background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; transition: border-color .15s, background .15s, transform .1s; }}
  .svc:hover {{ border-color: var(--accent); background: var(--panel2); transform: translateX(2px); }}
  .svc.active {{ border-color: var(--accent); background: #0b2438; }}
  .svc .nm {{ font-weight: 600; font-size: 14px; }}
  .svc .ct {{ color: var(--muted); font-size: 12px; margin-top: 2px; }}
  .svc .badge {{ display: inline-block; background: #0e7490; color: #cffafe; border-radius: 999px; padding: 1px 8px; font-size: 11px; margin-left: 6px; }}
  main {{ flex: 1; min-width: 0; display: flex; flex-direction: column; }}
  .toolbar {{ display: flex; align-items: center; gap: 12px; padding: 10px 18px; border-bottom: 1px solid var(--line); background: var(--panel); }}
  .toolbar .t {{ font-weight: 600; }}
  .toolbar a {{ color: var(--accent); text-decoration: none; font-size: 13px; }}
  .toolbar a:hover {{ text-decoration: underline; }}
  #swagger {{ flex: 1; overflow: auto; background: var(--panel); }}
  .hint {{ color: var(--muted); font-size: 12px; padding: 2px 18px; }}
</style>
</head>
<body>
<header>
  <h1>Nexus — Service API Docs</h1>
  <p>All <code>*-srv</code> OpenAPI specs, one port. Specs are generated from source route registrations by <code>nexus/tools/api-docs/</code>.</p>
</header>
<div class="wrap">
  <aside id="list">{SIDEBAR}</aside>
  <main>
    <div class="toolbar">
      <span class="t" id="curTitle">Select a service</span>
      <a id="redocLink" href="#" target="_blank" rel="noopener">ReDoc ↗</a>
      <a id="rawLink" href="#" target="_blank" rel="noopener">raw spec ↗</a>
      <span class="hint" id="curCount"></span>
    </div>
    <div id="swagger"></div>
  </main>
</div>
<script src="{SWAGGER_JS}"></script>
<script>
const SPECS = {SPECS_JSON};
let ui = null;
function loadService(name) {{
  const spec = SPECS.find(s => s.name === name);
  if (!spec) return;
  document.querySelectorAll('.svc').forEach(b => b.classList.toggle('active', b.dataset.name === name));
  document.getElementById('curTitle').textContent = spec.title || name;
  document.getElementById('curCount').textContent = spec.nops + ' ops · ' + spec.npaths + ' paths';
  document.getElementById('redocLink').href = '/redoc/' + name;
  document.getElementById('rawLink').href = spec.url;
  if (ui) {{ ui.specUrl = spec.url; ui.spec = null; }}
  ui = SwaggerUI({{
    dom_id: '#swagger',
    url: spec.url,
    deepLinking: true,
    displayRequestDuration: true,
    persistAuthorization: true,
  }});
}}
function init() {{
  const first = SPECS[0];
  if (first) loadService(first.name);
  document.querySelectorAll('.svc').forEach(b => b.addEventListener('click', () => loadService(b.dataset.name)));
}}
window.addEventListener('DOMContentLoaded', init);
</script>
</body>
</html>
"""

REDOC_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — ReDoc</title>
<style>body {{ margin: 0; }}</style>
</head>
<body>
<div id="redoc"></div>
<script src="{REDOC_JS}"></script>
<script>Redoc.init('{spec_url}', {{ expandResponses: '200', hideDownloadButton: false }}, document.getElementById('redoc'));</script>
</body>
</html>
"""


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "apidocs-srv/1.0"

    def do_GET(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        try:
            if path == "/health":
                return self._json({"status": "ok", "service": "apidocs-index", "specs": len(find_specs())})
            if path == "/":
                return self._html(self._index())
            if path.startswith("/specs/") and path.endswith(".yaml"):
                return self._spec(path)
            if path.startswith("/redoc/"):
                return self._redoc(path)
            self._text(404, "text/plain", "not found")
        except BrokenPipeError:
            pass
        except Exception as e:  # pragma: no cover
            try:
                self._text(500, "text/plain", f"error: {e}")
            except Exception:
                pass

    def _index(self):
        items = []
        for s in find_specs():
            title, desc, npaths, nops = service_meta(s["path"])
            s["title"] = title or s["name"]
            s["npaths"], s["nops"] = npaths, nops
            items.append(s)
        sidebar = "\n".join(
            f'<button class="svc" data-name="{s["name"]}">'
            f'<div class="nm">{s["name"]}<span class="badge">{s["nops"]} ops</span></div>'
            f'<div class="ct">{s["base"]} · {s["npaths"]} paths</div></button>'
            for s in items
        )
        specs_json = json.dumps(items)
        return INDEX_TEMPLATE.format(
            SWAGGER_JS=SWAGGER_JS, SWAGGER_CSS=SWAGGER_CSS, REDOC_JS=REDOC_JS,
            SIDEBAR=sidebar, SPECS_JSON=specs_json,
        )

    def _spec(self, path):
        name = path[len("/specs/"): -len(".yaml")]
        for s in find_specs():
            if s["name"] == name:
                with open(s["path"], encoding="utf-8") as f:
                    return self._text(200, "application/yaml", f.read())
        return self._text(404, "text/plain", f"no spec for {name}")

    def _redoc(self, path):
        name = path[len("/redoc/"):].rstrip("/")
        for s in find_specs():
            if s["name"] == name:
                title, _, _, _ = service_meta(s["path"])
                page = REDOC_TEMPLATE.format(
                    REDOC_JS=REDOC_JS, title=title or name,
                    spec_url=f"/specs/{name}.yaml",
                )
                return self._html(page)
        return self._text(404, "text/plain", f"no spec for {name}")

    def _html(self, body):
        return self._text(200, "text/html; charset=utf-8", body)

    def _json(self, obj):
        return self._text(200, "application/json", json.dumps(obj))

    def _text(self, code, ctype, body):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)
        return None

    def log_message(self, fmt, *args):  # quiet
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


class TLSThreadingServer(ThreadingServer):
    """HTTPServer variant that wraps every accepted socket in TLS."""

    def __init__(self, addr, handler, context):
        super().__init__(addr, handler)
        self._tls_ctx = context

    def get_request(self):
        sock, addr = super().get_request()
        return self._tls_ctx.wrap_socket(sock, server_side=True), addr


CERT_DIR = os.path.join(HERE, "certs")
CERT_FILE = os.path.join(CERT_DIR, "apidocs-selfsigned.crt")
KEY_FILE = os.path.join(CERT_DIR, "apidocs-selfsigned.key")


def _lan_ipv4s():
    """Best-effort list of this host's non-loopback IPv4 addresses."""
    ips = set()
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                ips.add(ip)
    except OSError:
        pass
    # Fallback: parse `hostname -I`
    try:
        out = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=5)
        for tok in out.stdout.split():
            if "." in tok and not tok.startswith("127."):
                ips.add(tok)
    except Exception:
        pass
    return sorted(ips)


def ensure_cert(cert_path=CERT_FILE, key_path=KEY_FILE):
    """Generate a self-signed cert with openssl if the files are missing.

    SANs cover localhost, the hostname, and the host's non-loopback IPv4
    addresses so the cert is valid however clients reach it on the LAN.
    The private key is chmod 0600.
    """
    if os.path.exists(cert_path) and os.path.exists(key_path):
        return cert_path, key_path
    os.makedirs(os.path.dirname(cert_path), exist_ok=True)
    sans = ["DNS:localhost", "DNS:%s" % socket.gethostname()]
    sans += ["IP:%s" % ip for ip in _lan_ipv4s()]
    cmd = [
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", key_path, "-out", cert_path,
        "-days", "3650", "-subj", "/CN=apidocs",
        "-addext", "subjectAltName=" + ",".join(sans),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    try:
        os.chmod(key_path, 0o600)
    except OSError:
        pass
    print(f"generated self-signed cert: {cert_path} (SANs: {', '.join(sans)})")
    return cert_path, key_path


def run_tls_listener(host, port, cert_path, key_path):
    """Run the HTTPS listener in its own thread; exits on main-thread stop."""
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert_path, key_path)
    server = TLSThreadingServer((host, port), Handler, context)
    print(f"apidocs index (TLS): https://{host}:{port}  ({len(find_specs())} specs)")
    server.serve_forever()


def main():
    ap = argparse.ArgumentParser(description="Single-port browsable index for all *-srv OpenAPI specs.")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=3180)
    ap.add_argument("--tls-cert", default=None, help="path to TLS certificate; enables the HTTPS listener (self-signed generated if missing)")
    ap.add_argument("--tls-key", default=None, help="path to TLS private key (defaults to sibling of --tls-cert: <cert>.key)")
    ap.add_argument("--tls-host", default="0.0.0.0", help="bind address for the HTTPS listener")
    ap.add_argument("--tls-port", type=int, default=8443, help="port for the HTTPS listener")
    args = ap.parse_args()

    if args.tls_cert:
        cert_path = args.tls_cert
        key_path = args.tls_key or (os.path.splitext(cert_path)[0] + ".key")
        cert_path, key_path = ensure_cert(cert_path, key_path)
        threading.Thread(
            target=run_tls_listener,
            args=(args.tls_host, args.tls_port, cert_path, key_path),
            daemon=True,
        ).start()

    server = ThreadingServer((args.host, args.port), Handler)
    print(f"apidocs index: http://{args.host}:{args.port}  ({len(find_specs())} specs)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
