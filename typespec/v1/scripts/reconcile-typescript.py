#!/usr/bin/env python3
"""
reconcile-typescript.py — TypeSpec ↔ TypeScript coverage proof (step 1 of
the monolith cutover).

Mechanically extracts the HTTP route surface (method + path) and MCP tool
catalog (tool name) from each TypeScript service under ./typescript, extracts
the corresponding operations from the TypeSpec contracts under
./typespec/v1/<service>/typescript, and diffs the two. Exit code 0 only when
every declared route/tool has a matching contract operation.

Conventions (documented in typespec/v1/typescript-conventions.md):
  * REST services: one TypeSpec op per route. `@route("<path>")` + verb
    decorator (@get/@post/...). Path params `:id` in Express map to `{id}`.
  * MCP servers: each tool is an operation with `@route("/tools/<tool-name>")`
    + `@post`, where <tool-name> is the literal tool name from `server.tool(...)`.

Usage:
    python3 typespec/v1/scripts/reconcile-typescript.py            # full report
    python3 typespec/v1/scripts/reconcile-typescript.py --service ui-event-bus

The manifest below is the authoritative list of TS services. Adding a service
to the manifest but not yet modeling it reports it as "unmodeled" (not an
error) until its contract exists.
"""

import argparse
import json
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
TS_DIR = os.path.join(REPO, "typescript")
TSP_DIR = os.path.join(REPO, "typespec", "v1")

# ---------------------------------------------------------------------------
# Authoritative service manifest.  type: "rest" | "mcp".
# ---------------------------------------------------------------------------
MANIFEST = [
    # REST services (smallest -> largest)
    {"name": "ui-event-bus", "type": "rest"},
    {"name": "harness-srv", "type": "rest"},
    {"name": "ui-tools", "type": "rest"},
    {"name": "tools-aggregator", "type": "rest"},
    {"name": "role-memory-srv", "type": "rest"},
    {"name": "knowledge-srv", "type": "rest"},
    {"name": "tackle-prompt-sync-srv", "type": "rest"},
    {"name": "cascade-srv", "type": "rest"},
    {"name": "shrapnel", "type": "rest"},
    {"name": "execution-srv", "type": "rest"},
    {"name": "kernel-srv", "type": "rest"},
    {"name": "voyager-srv", "type": "rest"},
    {"name": "conduit-srv", "type": "rest"},
    {"name": "semantics-srv", "type": "rest"},
    {"name": "peb-srv", "type": "rest"},
    {"name": "assembly-srv", "type": "rest"},
    {"name": "wind-srv", "type": "rest"},
    {"name": "tackle-srv", "type": "rest"},
    {"name": "nebula-srv", "type": "rest"},
    # mcp-bridge is an MCP-over-SSE transport proxy: it exposes raw HTTP
    # routes (/sse, /messages, /health), not a static tool catalog.
    {"name": "mcp-bridge", "type": "rest"},
    # MCP tool servers (smallest -> largest)
    {"name": "service-broker-mcp", "type": "mcp"},
    {"name": "knowledge-mcp", "type": "mcp"},
    {"name": "vision-mcp", "type": "mcp"},
    {"name": "terrain-mcp", "type": "mcp"},
    {"name": "peb-mcp", "type": "mcp"},
    {"name": "tackle-mcp", "type": "mcp"},
    {"name": "nebula-mcp", "type": "mcp"},
]

HTTP_VERBS = {"get", "post", "put", "patch", "delete", "head", "options", "all"}
# Express `app.all(...)` covers multiple verbs; treat `all` as a wildcard.
ROUTE_RE = re.compile(
    r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*(get|post|put|patch|delete|head|options|all)\s*\(\s*['\"]([^'\"]+)['\"]"
)
CHAIN_ROUTE_RE = re.compile(r"\.route\s*\(\s*['\"]([^'\"]+)['\"]")
CHAIN_VERB_RE = re.compile(r"\.(get|post|put|patch|delete|head|options|all)\s*\(\s*\)")
TOOL_RE = re.compile(
    r"\b(?:server|mcp)\s*\.\s*tool\s*\(\s*['\"]([^'\"]+)['\"]"
)
# raw node http.createServer route guards: `if (req.method === "GET" && url.pathname === "/sse")`
RAW_HTTP_RE = re.compile(
    r"req\.method\s*===?\s*['\"]([A-Z]+)['\"]\s*&&\s*url\.pathname\s*===?\s*['\"]([^'\"]+)['\"]"
)
REGISTER_TOOL_RE = re.compile(r"registerTool\s*\(\s*['\"]([^'\"]+)['\"]")
# Express router mount: `app.use('/api', createRoutes(pool))` — a mounted
# router's routes are served under this prefix, which the reconciler must
# prepend so `router.get('/links')` reconciles to `GET /api/links`.
MOUNT_RE = re.compile(r"\.use\s*\(\s*['\"]([^'\"]+)['\"]")

TSP_ROUTE_RE = re.compile(r"@route\s*\(\s*\"([^\"]+)\"\s*\)")
TSP_VERB_RE = re.compile(r"@(get|post|put|patch|delete|head|options)\b")


def norm_path(p: str) -> str:
    """Normalize Express `:param` to TypeSpec `{param}` and strip trailing slash."""
    p = re.sub(r":([A-Za-z_][A-Za-z0-9_]*)", r"{\1}", p)
    if len(p) > 1 and p.endswith("/"):
        p = p.rstrip("/")
    return p


def ts_routes(service: str) -> set[str]:
    """Extract `METHOD /path` route strings from a REST service's source."""
    out: set[str] = set()
    src_root = os.path.join(TS_DIR, service, "src")
    if not os.path.isdir(src_root):
        return out
    texts: list[str] = []
    for root, _dirs, files in os.walk(src_root):
        for fn in files:
            if not fn.endswith((".ts", ".js")):
                continue
            with open(os.path.join(root, fn), encoding="utf-8", errors="replace") as f:
                texts.append(f.read())
    # Router mount prefixes (e.g. `app.use('/api', ...)`).
    mount_prefixes: set[str] = set()
    for text in texts:
        for m in MOUNT_RE.finditer(text):
            mount_prefixes.add(m.group(1).rstrip("/"))
    for text in texts:
        for m in ROUTE_RE.finditer(text):
            obj, verb, path = m.group(1), m.group(2), m.group(3)
            p = norm_path(path)
            # Routes declared on a mounted router (object other than
            # `app`/`server`) inherit the service's mount prefix when exactly
            # one prefix exists — `router.get('/links')` → `GET /api/links`.
            if obj not in ("app", "server") and len(mount_prefixes) == 1:
                p = norm_path(next(iter(mount_prefixes)) + path)
            out.add(f"{verb.upper()} {p}")
        for m in RAW_HTTP_RE.finditer(text):
            out.add(f"{m.group(1).upper()} {norm_path(m.group(2))}")
        # `.route('/x').get().post()` chains (method without path arg)
        for cm in CHAIN_ROUTE_RE.finditer(text):
            base = norm_path(cm.group(1))
            # scan forward a short window for chained verbs
            window = text[cm.end() : cm.end() + 200]
            for vm in CHAIN_VERB_RE.finditer(window):
                out.add(f"{vm.group(1).upper()} {base}")
    return out


def ts_tools(service: str) -> set[str]:
    """Extract MCP tool names from an MCP server's source."""
    out: set[str] = set()
    src_root = os.path.join(TS_DIR, service, "src")
    if not os.path.isdir(src_root):
        return out
    for root, _dirs, files in os.walk(src_root):
        for fn in files:
            if not fn.endswith((".ts", ".js")):
                continue
            with open(os.path.join(root, fn), encoding="utf-8", errors="replace") as f:
                text = f.read()
            for m in TOOL_RE.finditer(text):
                out.add(m.group(1))
            for m in REGISTER_TOOL_RE.finditer(text):
                out.add(m.group(1))
    return out


def tsp_rest_ops(service: str) -> set[str]:
    """Extract `METHOD /path` operations from a REST TypeSpec contract."""
    out: set[str] = set()
    tsp_dir = os.path.join(TSP_DIR, service, "typescript")
    if not os.path.isdir(tsp_dir):
        return out
    for fn in sorted(os.listdir(tsp_dir)):
        if not fn.endswith(".tsp"):
            continue
        with open(os.path.join(tsp_dir, fn), encoding="utf-8") as f:
            lines = f.read().splitlines()
        current_route = ""
        for line in lines:
            rm = TSP_ROUTE_RE.search(line)
            if rm:
                current_route = norm_path(rm.group(1))
                # an operation-level route on the same line as a verb pairs directly
                vm = TSP_VERB_RE.search(line)
                if vm:
                    out.add(f"{vm.group(1).upper()} {current_route}")
                continue
            vm = TSP_VERB_RE.search(line)
            if vm and current_route:
                out.add(f"{vm.group(1).upper()} {current_route}")
    return out


def tsp_tool_ops(service: str) -> set[str]:
    """Extract tool names from an MCP TypeSpec contract (`/tools/<name>` routes)."""
    out: set[str] = set()
    tsp_dir = os.path.join(TSP_DIR, service, "typescript")
    if not os.path.isdir(tsp_dir):
        return out
    for fn in sorted(os.listdir(tsp_dir)):
        if not fn.endswith(".tsp"):
            continue
        with open(os.path.join(tsp_dir, fn), encoding="utf-8") as f:
            text = f.read()
        for m in TSP_ROUTE_RE.finditer(text):
            p = m.group(1)
            if p.startswith("/tools/"):
                out.add(p[len("/tools/"):])
    return out


def reconcile(entry: dict) -> dict:
    name, kind = entry["name"], entry["type"]
    tsp_dir = os.path.join(TSP_DIR, name, "typescript")
    modeled = os.path.isdir(tsp_dir)
    result = {"name": name, "type": kind, "modeled": modeled, "missing": [], "extra": []}
    if not modeled:
        return result
    if kind == "rest":
        src = ts_routes(name)
        contract = tsp_rest_ops(name)
    else:
        src = ts_tools(name)
        contract = tsp_tool_ops(name)
    result["missing"] = sorted(src - contract)
    result["extra"] = sorted(contract - src)
    result["covered"] = len(src - (src - contract))
    result["total"] = len(src)
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description="TypeSpec <-> TypeScript coverage proof")
    ap.add_argument("--service", help="only reconcile one service")
    ap.add_argument("--json", action="store_true", help="emit JSON report")
    args = ap.parse_args()

    entries = [e for e in MANIFEST if e["name"] == args.service] if args.service else MANIFEST
    if args.service and not entries:
        print(f"unknown service: {args.service}", file=sys.stderr)
        return 2

    results = [reconcile(e) for e in entries]
    if args.json:
        print(json.dumps(results, indent=2))
        return 0

    total_missing = 0
    total_covered = 0
    total_declared = 0
    print(f"{'SERVICE':<24} {'TYPE':<6} {'STATUS':<10} {'COVERED':<8} {'DECLARED':<9} {'MISSING':<7}")
    print("-" * 70)
    for r in results:
        if not r["modeled"]:
            status = "UNMODELED"
            cov = "-"
            decl = "-"
            miss = "-"
            total_declared += 0
        else:
            total_covered += r.get("covered", 0)
            total_declared += r.get("total", 0)
            total_missing += len(r["missing"])
            cov = f"{r.get('covered', 0)}/{r.get('total', 0)}"
            decl = str(r.get("total", 0))
            miss = str(len(r["missing"]))
            status = "OK" if not r["missing"] else "GAPS"
        print(f"{r['name']:<24} {r['type']:<6} {status:<10} {cov:<8} {decl:<9} {miss:<7}")

    print("-" * 70)
    print(f"TOTAL modeled: {sum(1 for r in results if r['modeled'])}/{len(results)} | "
          f"declared {total_declared} | covered {total_covered} | missing {total_missing}")
    print()

    any_gaps = False
    for r in results:
        for m in r["missing"]:
            any_gaps = True
            print(f"  MISSING  {r['name']}: {m}")
        for x in r["extra"]:
            print(f"  EXTRA    {r['name']}: {x} (in contract, not in source)")

    if not any_gaps and total_missing == 0:
        print("COVERAGE COMPLETE: every modeled route/tool has a matching contract operation.")
        return 0
    if args.service:
        # single-service mode: nonzero on gaps so it can gate CI
        return 1 if total_missing else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
