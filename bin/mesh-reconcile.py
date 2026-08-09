#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""
bin/mesh-reconcile.py
=====================

Read-only reconciliation of the three service catalogs:

    terrain   (terrain.runnable_services + terrain.mcp_servers)  — runtime plane,
                                                                    "what is observed"
    registry  (registry.services + registry.service_identity_map) — declared plane,
                                                                    "what should exist"
    sysadmin  (config/sysadmin-config.json)                       — monitored plane,
                                                                    "what the outage
                                                                     detector watches"

The registry↔terrain join uses ``registry.service_identity_map`` (V053, stable IDs,
current-valid rows) exactly as its doctrine requires — names are only a fallback
for rows the map does not yet cover, and those joins are labelled ``name-fallback``
so they are auditable.

The report has three parts:

1. Coverage matrix — per-catalog counts and pair intersections.
2. Drift sections — registry-only, terrain-only, sysadmin-watched-but-not-in-terrain,
   port mismatches on matched services, and heartbeat/status contradictions.
3. Exit code — 0 unless a *contradiction* (port mismatch or status contradiction) is
   found; ``--strict`` additionally fails on any catalog-coverage gap.

Usage
-----

::

    PGPASSWORD=... bin/mesh-reconcile.py               # human report (default)
    PGPASSWORD=... bin/mesh-reconcile.py --json        # machine-readable JSON
    PGPASSWORD=... bin/mesh-reconcile.py --quiet       # drift lines only
    PGPASSWORD=... bin/mesh-reconcile.py --strict      # fail on any gap too
    PGPASSWORD=... bin/mesh-reconcile.py --list        # no exit-code decision

Environment
-----------

``PGPASSWORD`` is required at run time. ``PGHOST`` / ``PGPORT`` / ``PGDATABASE`` /
``PGUSER`` default to the same values mesh-register.py uses (localhost / 5432 /
nexus / pguser). psycopg2 is preferred; the script degrades to ``psql -c``
subprocesses when it is unavailable (same pattern as mesh-register.py).

Exit codes
----------

* 0 — no contradictions (or ``--list`` used).
* 1 — contradictions found (port mismatch / status contradiction); with
      ``--strict``, also any coverage gap.
* 3 — DB read error.
* 4 — required environment (PGPASSWORD) or driver missing.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys

NEXUS_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
CONFIG_FILE = os.path.join(NEXUS_ROOT, "config", "sysadmin-config.json")

PGHOST = os.environ.get("PGHOST", "localhost")
PGPORT = os.environ.get("PGPORT", "5432")
PGDATABASE = os.environ.get("PGDATABASE", "nexus")
PGUSER = os.environ.get("PGUSER", "pguser")

# ── Driver ─────────────────────────────────────────────────────────────────

def _run_sql(sql: str) -> list[tuple]:
    """Execute a read-only query via psycopg2 (preferred) or psql."""
    try:
        import psycopg2  # type: ignore
        with psycopg2.connect(
            host=PGHOST, port=PGPORT, dbname=PGDATABASE, user=PGUSER,
            password=os.environ.get("PGPASSWORD"),
        ) as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
                return list(cur.fetchall())
    except ImportError:
        pass
    psql = shutil.which("psql")
    if not psql:
        raise RuntimeError("neither psycopg2 nor psql is available")
    env = dict(os.environ)
    out = subprocess.run(
        [psql, "-h", PGHOST, "-p", PGPORT, "-U", PGUSER, "-d", PGDATABASE,
         "-tA", "-F", "\t", "-c", sql],
        capture_output=True, text=True, env=env, timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(f"psql failed: {out.stderr.strip()[:300]}")
    rows = []
    for line in out.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        rows.append(tuple(parts))
    return rows


def require_pgpassword() -> None:
    if not os.environ.get("PGPASSWORD"):
        print("mesh-reconcile: PGPASSWORD is required", file=sys.stderr)
        sys.exit(4)


# ── Catalog loaders ────────────────────────────────────────────────────────

def load_registry() -> dict[str, dict]:
    """registry.services → {id: {id, name, port, status}}"""
    rows = _run_sql(
        "SELECT id, name, COALESCE(default_port, 0), status FROM registry.services"
    )
    return {int(r[0]): {"id": int(r[0]), "name": r[1], "port": int(r[2] or 0),
                        "status": r[3]} for r in rows}


def load_identity_map() -> dict[int, dict]:
    """Current-valid registry↔terrain identity mappings by registry id.

    V076 migration: derives identity from asset_relation (equivalent edges)
    instead of the deprecated registry.service_identity_map.
    Falls back to service_identity_map if asset_relation is unavailable.
    """
    # Primary: derive from asset_relation equivalent edges
    try:
        rows = _run_sql(
            "SELECT rs.id, trs.id, 'asset-equivalent', 1.0 "
            "FROM semantics.asset_relation ar "
            "JOIN registry.services rs ON rs.asset_id = ar.from_asset_id "
            "JOIN terrain.runnable_services trs ON trs.asset_id = ar.to_asset_id "
            "WHERE ar.relation_type = 'equivalent' AND ar.expired_at IS NULL "
            "UNION "
            "SELECT rs2.id, trs2.id, 'asset-shared', 1.0 "
            "FROM semantics.canonical_asset ca "
            "JOIN registry.services rs2 ON rs2.asset_id = ca.id "
            "JOIN terrain.runnable_services trs2 ON trs2.asset_id = ca.id "
            "WHERE ca.expired_at IS NULL"
        )
        if rows:
            return {int(r[0]): {"terrain_id": int(r[1]), "method": r[2],
                                "confidence": float(r[3] or 0)} for r in rows}
    except Exception:
        pass
    # Fallback: legacy service_identity_map (deprecated, removed in V078)
    rows = _run_sql(
        "SELECT registry_service_id, terrain_service_id, match_method, "
        "COALESCE(match_confidence, 0) "
        "FROM registry.service_identity_map "
        "WHERE valid_until IS NULL OR valid_until > now()"
    )
    return {int(r[0]): {"terrain_id": int(r[1]), "method": r[2],
                        "confidence": float(r[3] or 0)} for r in rows}


def load_registry_health() -> dict[str, str]:
    """Latest heartbeat-derived state per service_name from status_events."""
    rows = _run_sql(
        "SELECT DISTINCT ON (service_name) service_name, new_state "
        "FROM registry.status_events ORDER BY service_name, changed_at DESC"
    )
    return {r[0]: r[1] for r in rows}


def load_terrain() -> dict[str, dict]:
    """terrain.runnable_services + terrain.mcp_servers → {name: {...}}"""
    out: dict[str, dict] = {}
    for table, kind in (("runnable_services", "runnable_service"),
                        ("mcp_servers", "mcp_server")):
        try:
            rows = _run_sql(
                f"SELECT id, name, COALESCE(port, 0), status FROM terrain.{table}"
            )
        except RuntimeError:
            continue
        for r in rows:
            out[r[1]] = {"id": int(r[0]), "name": r[1], "port": int(r[2] or 0),
                         "status": r[3], "kind": kind}
    return out


def load_sysadmin() -> dict[str, dict]:
    """config/sysadmin-config.json → {id: {id, port, checkMethod, systemdUnit}}"""
    with open(CONFIG_FILE, encoding="utf-8") as f:
        data = json.load(f)
    out: dict[str, dict] = {}
    for s in data.get("services", []):
        out[s["id"]] = {
            "id": s["id"], "port": int(s.get("port") or 0),
            "checkMethod": s.get("checkMethod", ""),
            "systemdUnit": s.get("systemdUnit", ""),
        }
    return out


# ── Matching helpers ───────────────────────────────────────────────────────

def base_name(name: str) -> str:
    """Normalize service names for loose matching: strip -srv/-mcp/-service."""
    n = name.lower().strip()
    for suffix in ("-service", "-srv", "-mcp", "-server"):
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    return n


def suffix_class(name: str) -> str:
    """The kind of a service name: 'mcp', 'srv', or 'other'.

    Prevents -srv/-mcp base-name collisions (e.g. assembly-srv vs
    assembly-mcp) from being treated as the same service in fallback matching.
    """
    n = name.lower().strip()
    if n.endswith("-mcp"):
        return "mcp"
    if n.endswith(("-srv", "-service", "-server")):
        return "srv"
    return "other"


def match_registry_to_terrain(registry: dict, terrain: dict,
                              idmap: dict) -> dict[int, dict]:
    """Registry service → terrain service (via identity map, else name)."""
    result: dict[int, dict] = {}
    by_base: dict[str, list[str]] = {}
    for tname in terrain:
        by_base.setdefault(base_name(tname), []).append(tname)
    claimed: set[str] = set()  # terrain names bound by a strong match
    terrain_ids = {t["id"] for t in terrain.values()}

    # Pass 1 — strong matches: identity map, then exact name. These always
    # win, regardless of registry iteration order.
    for rid, rsvc in registry.items():
        mapped = idmap.get(rid)
        if mapped and mapped["terrain_id"] in terrain_ids:
            tname = next(t["name"] for t in terrain.values()
                         if t["id"] == mapped["terrain_id"])
            result[rid] = {"terrain_name": tname, "method": mapped["method"],
                           "confidence": mapped["confidence"]}
            claimed.add(tname)
        elif rsvc["name"] in terrain:
            result[rid] = {"terrain_name": rsvc["name"], "method": "name-exact",
                           "confidence": 1.0}
            claimed.add(rsvc["name"])

    # Pass 2 — fallback for the rest: unique compatible, unclaimed base match
    # (retired terrain-srv must not steal the JVM terrain from an exact match).
    for rid, rsvc in registry.items():
        if rid in result:
            continue
        cands = [c for c in by_base.get(base_name(rsvc["name"]), [])
                 if c not in claimed and _compatible(c, rsvc["name"])]
        if len(cands) == 1:
            result[rid] = {"terrain_name": cands[0], "method": "name-fallback",
                           "confidence": 0.7}
            claimed.add(cands[0])
    return result


def _compatible(a: str, b: str) -> bool:
    """True if two names may be the same service for fallback matching."""
    ca, cb = suffix_class(a), suffix_class(b)
    return ca == cb or ca == "other" or cb == "other"


def _unique_base_candidate(base: str, candidates: dict, name: str) -> str | None:
    """Return the unique compatible candidate for a base name, else None."""
    matches = [n for n in candidates.get(base, [])
               if _compatible(n, name)]
    return matches[0] if len(matches) == 1 else None


def match_sysadmin(terrain: dict, registry: dict, sysadmin: dict) -> dict[str, dict]:
    """sysadmin id → where it appears in terrain / registry."""
    out: dict[str, dict] = {}
    terrain_by_base: dict[str, list[str]] = {}
    for tname in terrain:
        terrain_by_base.setdefault(base_name(tname), []).append(tname)
    registry_by_base: dict[str, list[str]] = {}
    for rsvc in registry.values():
        registry_by_base.setdefault(base_name(rsvc["name"]), []).append(rsvc["name"])
    for sid in sysadmin:
        tname = (sid if sid in terrain
                 else _unique_base_candidate(base_name(sid), terrain_by_base, sid))
        rname = (sid if sid in registry
                 else _unique_base_candidate(base_name(sid), registry_by_base, sid))
        out[sid] = {"terrain_name": tname, "registry_name": rname}
    return out


# ── Report ─────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="3-way service catalog reconciliation.")
    ap.add_argument("--json", action="store_true", help="machine-readable JSON output")
    ap.add_argument("--quiet", action="store_true", help="drift lines only")
    ap.add_argument("--strict", action="store_true", help="fail on any coverage gap too")
    ap.add_argument("--list", action="store_true", help="print report, always exit 0")
    args = ap.parse_args()

    require_pgpassword()

    try:
        registry = load_registry()
        idmap = load_identity_map()
        rhealth = load_registry_health()
        terrain = load_terrain()
        sysadmin = load_sysadmin()
    except RuntimeError as e:
        print(f"mesh-reconcile: DB error: {e}", file=sys.stderr)
        return 3

    r2t = match_registry_to_terrain(registry, terrain, idmap)
    s2t = match_sysadmin(terrain, registry, sysadmin)

    registry_only = [r for rid, r in registry.items() if rid not in r2t]
    terrain_only = [t for tname, t in terrain.items()
                    if tname not in {v["terrain_name"] for v in r2t.values()}]

    # sysadmin-watched but not present in terrain (runtime plane)
    sysadmin_missing_terrain = [
        sid for sid, m in s2t.items() if m["terrain_name"] is None]

    # Port mismatches on matched pairs
    port_mismatches = []
    for rid, m in r2t.items():
        rsvc = registry[rid]
        t = terrain[m["terrain_name"]]
        if rsvc["port"] and t["port"] and rsvc["port"] != t["port"]:
            port_mismatches.append({
                "registry": rsvc["name"], "registry_port": rsvc["port"],
                "terrain": t["name"], "terrain_port": t["port"],
                "match_method": m["method"],
            })

    # Status contradictions: terrain OFFLINE vs registry heartbeat HEALTHY (or reverse)
    contradictions = []
    for rid, m in r2t.items():
        rsvc = registry[rid]
        t = terrain[m["terrain_name"]]
        rh = rhealth.get(rsvc["name"])
        if rh == "HEALTHY" and t["status"] == "OFFLINE":
            contradictions.append({
                "kind": "registry-healthy-terrain-offline",
                "service": rsvc["name"], "registry_state": rh,
                "terrain_state": t["status"],
            })
        if rh == "OFFLINE" and t["status"] == "ONLINE":
            contradictions.append({
                "kind": "registry-offline-terrain-online",
                "service": rsvc["name"], "registry_state": rh,
                "terrain_state": t["status"],
            })
    contradictions.extend({
        "kind": "port-mismatch",
        "registry": p["registry"], "registry_port": p["registry_port"],
        "terrain": p["terrain"], "terrain_port": p["terrain_port"],
        "match_method": p["match_method"],
    } for p in port_mismatches)

    gaps = {
        "registry_only": sorted(r["name"] for r in registry_only),
        "terrain_only": sorted(t["name"] for t in terrain_only),
        "sysadmin_missing_terrain": sorted(sysadmin_missing_terrain),
    }
    has_gaps = any(gaps.values())
    actionable = contradictions or (has_gaps and args.strict)

    report = {
        "coverage": {
            "registry": len(registry), "terrain": len(terrain),
            "sysadmin": len(sysadmin),
            "registry_mapped_to_terrain": len(r2t),
            "identity_map_current_rows": len(idmap),
        },
        "gaps": gaps,
        "contradictions": contradictions,
        "verdict": "CONTRADICTIONS" if contradictions else (
            "GAPS" if args.strict and has_gaps else "OK"),
    }

    if args.json:
        print(json.dumps(report, indent=2, default=str))
    elif not args.quiet:
        c = report["coverage"]
        print(f"coverage: registry={c['registry']} terrain={c['terrain']} "
              f"sysadmin={c['sysadmin']} (registry↔terrain mapped: "
              f"{c['registry_mapped_to_terrain']}, identity-map rows: "
              f"{c['identity_map_current_rows']})")
        for section, rows in (("registry-only", report["gaps"]["registry_only"]),
                              ("terrain-only", report["gaps"]["terrain_only"]),
                              ("sysadmin-watched-not-in-terrain",
                               report["gaps"]["sysadmin_missing_terrain"])):
            if rows:
                print(f"\n[{section}] ({len(rows)})")
                for name in rows:
                    print(f"  - {name}")
        if port_mismatches:
            print(f"\n[port-mismatches] ({len(port_mismatches)})")
            for p in port_mismatches:
                print(f"  - {p['registry']} ({p['registry_port']}) vs "
                      f"{p['terrain']} ({p['terrain_port']}) [{p['match_method']}]")
        if report["contradictions"]:
            print(f"\n[contradictions] ({len(report['contradictions'])})")
            for c_ in report["contradictions"]:
                print(f"  - {c_}")
    else:
        # --quiet: only the signal — coverage line + contradictions
        c = report["coverage"]
        print(f"coverage: registry={c['registry']} terrain={c['terrain']} "
              f"sysadmin={c['sysadmin']}")
        for c_ in report["contradictions"]:
            print(f"  - {c_}")
    if not args.json:
        print(f"\nverdict: {report['verdict']}")

    if args.list:
        return 0
    return 1 if actionable else 0


if __name__ == "__main__":
    sys.exit(main())
