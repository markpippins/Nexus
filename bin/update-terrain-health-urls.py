#!/usr/bin/env python3
"""
Update healthCheckUrl on all internal runnable services in the terrain registry.

Run this after rebuilding terrain from scratch, or whenever a new batch
of health endpoints needs to be persisted.

Usage:
  python3 bin/update-terrain-health-urls.py [--dry-run]

All updates are idempotent — safe to run multiple times.
"""

import json
import sys
import urllib.request

TERRAIN = "http://localhost:8084/api/v1"

# Internal UI services that serve /health on their dev-server port.
# Most bind to 0.0.0.0; Angular apps bind [::1] and need IPv6 URLs.
HEALTH_URLS = {
    # ── Vite / Bun dev servers (bind 0.0.0.0, HTTP/1.1) ──
    "plurality-ui":             "http://localhost:3004/health",
    "duality-ui":               "http://localhost:3002/health",
    "view-architect":           "http://localhost:3003/health",
    "file-system-server":       "http://localhost:4042/health",
    "secure-file-system-server": "http://localhost:4040/health",
    "assembly-ui":              "http://localhost:4214/api/health",  # Angular Vite
    "conduit-ui":               "http://localhost:4201/health",
    "tackle-ui":                "http://localhost:4202/health",
    "execution-ui":             "http://localhost:4205/health",
    "peb-ui":                   "http://localhost:4206/health",
    "semantic-kernel-ui":       "http://localhost:4207/health",
    "vision-ui":                "http://localhost:4208/health",
    "wind-ui":                  "http://localhost:4209/health",
    "data-explorer-ui":         "http://localhost:4212/health",
    "monaco-judge":             "http://localhost:4016/health",
    "nebula-control-plane":     "http://localhost:4014/health",

    # ── Angular dev servers (bind [::1] only — need IPv6 URL) ──
    "nexus-console":            "http://[::1]:4200/health",
    "cascade-ui":               "http://[::1]:4203/health",
    "nebula-ui":                "http://[::1]:4210/health",
}

# Services that are currently unreachable or have no HTTP endpoint.
# Documented here for awareness; not updated.
#
#   cascade-* subscribers     port=0   (NATS subscribers, no HTTP)
#   mildred-dam-api           port=3140 (custom endpoint)
#   substance                 port=3115 (no standard /health)
#   voyager-srv               port=3114 (no standard /health)
#   wrp-bridge-daemon         port=None (no HTTP)


def fetch_all() -> list[dict]:
    req = urllib.request.Request(f"{TERRAIN}/runnable-services",
                                 headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read())
    if isinstance(data, dict):
        return data.get("data", data.get("services", data.get("items", [])))
    return data if isinstance(data, list) else []


def update_service(svc: dict, url: str, dry_run: bool) -> bool:
    if svc.get("healthCheckUrl") == url:
        print(f"  {svc['name']:25s} already set → {url}")
        return True

    if dry_run:
        print(f"  {svc['name']:25s} WOULD update → {url}")
        return False

    svc["healthCheckUrl"] = url
    body = json.dumps(svc).encode()
    req = urllib.request.Request(f"{TERRAIN}/runnable-services/{svc['id']}",
                                 data=body, method="PUT",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        resp = json.loads(r.read())
    ok = resp.get("healthCheckUrl") == url
    mark = "✅" if ok else "❌"
    print(f"  {svc['name']:25s} {mark} → {resp.get('healthCheckUrl', 'ERROR')}")
    return ok


def main():
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("DRY RUN — no changes will be made.\n")

    items = fetch_all()
    by_name = {s["name"]: s for s in items}

    updated = 0
    skipped = 0
    missing = 0

    for name, url in HEALTH_URLS.items():
        svc = by_name.get(name)
        if not svc:
            print(f"  {name:25s} ⚠️  NOT FOUND in terrain")
            missing += 1
            continue
        if update_service(svc, url, dry_run):
            updated += 1
        elif dry_run:
            skipped += 1

    print(f"\nUpdated: {updated}  Skipped: {skipped}  Missing: {missing}")
    if dry_run:
        print("(dry run — re-run without --dry-run to apply)")


if __name__ == "__main__":
    main()
