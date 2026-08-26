#!/usr/bin/env python3
"""T25 1.2 (plan 1304) — terrain -> registry seed/sync job.

Per R-A-2026-08-15-008 section 4 (runtime facts flow one way):
  - app services missing from the registry catalog  -> POST /api/v1/registry/register
  - app services already present                    -> POST /api/v1/registry/heartbeat/{name}
  - infra fixtures stay terrain-only                (postgresql, redis, nats, mongodb, ollama)
  - aliases skipped                                 (shrapnel-srv -> registry `shrapnel`;
                                                     topology-server -> registry `terrain`)

Idempotent: register upserts by name (plan 1291 bridge), heartbeat is
idempotent. Never touches catalog metadata of origin='seed' rows — it only
adds missing entries and refreshes runtime freshness. Covers the Node/Python
fleet that does not self-register (0.3 gap) without touching those services.

Usage:
  python3 bin/terrain-registry-sync.py [--dry-run]
Env: TERRAIN_URL  (default http://localhost:8084)
     REGISTRY_URL (default http://localhost:8085)
"""

import argparse
import json
import os
import sys
import urllib.request

TERRAIN_URL = os.environ.get("TERRAIN_URL", "http://localhost:8084")
REGISTRY_URL = os.environ.get("REGISTRY_URL", "http://localhost:8085")

INFRA = {"postgresql", "redis", "nats", "mongodb", "ollama"}
ALIASES = {"shrapnel-srv", "topology-server"}

# Framework name per migratable service (mirrors the item-4 staged SQL mapping).
FRAMEWORK_BY_NAME = {
    "assembly-ui": "Express", "barbie-ui": "Express",
    "data-explorer-ui": "Express", "duality-ui": "Express", "execution-ui": "Express",
    "monaco-judge": "Express", "nebula-control-plane": "Express", "peb-ui": "Express",
    "plurality-ui": "Express", "semantic-kernel-ui": "Express", "semantics-ui": "Express",
    "tackle-ui": "Express", "throttler-ui": "Express", "view-architect": "Express",
    "vision-ui": "Express", "wind-ui": "Express",
    "cascade": "Python", "cascade-assembly-subscriber": "Python",
    "cascade-assessment-subscriber": "Python", "cascade-event-bridge": "Python",
    "cascade-kernel-subscriber": "Python", "cascade-obs-subscriber": "Python",
    "cascade-pg-bridge": "Python",
    "apidocs-srv": "Express", "cpf-api": "typescript", "atlas": "Spring Boot",
    "losm-host": "FastAPI", "operator-svc": "auto",
}
# Fallback by terrain service_type_id when the name map misses.
FRAMEWORK_BY_TYPE = {14: "Express", 15: "Spring Boot", 16: "Python", 12: "gRPC"}


def get_json(url):
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.load(r)


def post_json(url, payload):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status, json.load(r)


def registry_names():
    names = set()
    page = 0
    while True:
        d = get_json(f"{REGISTRY_URL}/api/v1/services?page={page}")
        items = d.get("data", d) if isinstance(d, dict) else d
        if not items:
            break
        for i in items:
            if i.get("name"):
                names.add(i["name"].lower())
        meta = (d.get("meta") or {}) if isinstance(d, dict) else {}
        if meta.get("last_page") is None or page >= meta["last_page"]:
            break
        page += 1
    return names


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="report only, make no calls")
    args = ap.parse_args()

    terrain = get_json(f"{TERRAIN_URL}/api/v1/runnable-services")
    services = terrain.get("data", terrain) if isinstance(terrain, dict) else terrain
    reg = registry_names()

    registered, heartbeated, skipped, already = [], [], [], []
    for s in sorted(services, key=lambda x: (x.get("name") or "").lower()):
        name = (s.get("name") or "").lower()
        if name in INFRA:
            skipped.append((s["name"], "infra fixture"))
            continue
        if name in ALIASES:
            skipped.append((s["name"], "alias of existing registry row"))
            continue
        framework = FRAMEWORK_BY_NAME.get(s["name"]) or FRAMEWORK_BY_TYPE.get(s.get("serviceTypeId")) or "auto"
        payload = {
            "serviceName": s["name"],
            "port": s.get("port") if isinstance(s.get("port"), int) else None,
            "framework": framework,
            "version": s.get("version") or None,
            "healthCheck": s.get("healthCheckUrl"),
            "hostname": "localhost",  # plan 1291 bridge -> deployment upsert
            "metadata": {"sync": "terrain-registry-sync", "terrainId": s.get("id")},
        }
        if name in reg:
            if args.dry_run:
                already.append((s["name"], "in registry"))
            else:
                try:
                    status, _ = post_json(f"{REGISTRY_URL}/api/v1/registry/heartbeat/{s['name']}", {})
                    heartbeated.append((s["name"], status))
                except Exception as e:
                    already.append((s["name"], f"heartbeat ERR {e}"))
        else:
            if args.dry_run:
                registered.append((s["name"], "WOULD register"))
            else:
                try:
                    status, resp = post_json(f"{REGISTRY_URL}/api/v1/registry/register", payload)
                    registered.append((s["name"], status))
                except Exception as e:
                    registered.append((s["name"], f"ERR {e}"))

    print(f"terrain services: {len(services)} | registry catalog: {len(reg)}")
    print(f"registered: {len(registered)} | heartbeated: {len(heartbeated)} "
          f"| already-present: {len(already)} | skipped: {len(skipped)}")
    for n, st in registered:
        print(f"  register {n}: {st}")
    for n, st in heartbeated[:10]:
        print(f"  heartbeat {n}: {st}")
    if skipped:
        print("  skipped:", ", ".join(f"{n} ({r})" for n, r in skipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
