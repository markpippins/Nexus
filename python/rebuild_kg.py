#!/usr/bin/env python3
"""
Rebuild nexus/graph/nexus-knowledge-graph.json to contain ONLY:
  - work_requests
  - plans
(plus identity metadata). All other ontology sections are dropped (preserved
in the .bak / user backup for later semantic crawling).

Sources merged into the pared graph:
  1. nebula.implementation_plans  (DB, 338 rows, canonical plan records)
  2. nebula.work_requests         (DB, 1911 rows)
  3. .conduit-data/WORK_REQUESTS  (1891 historic WR JSON files)
  4. Existing KG plans/wr not covered by DB (graph-only historic entries)
  5. Completion evidence from:
       - audit/HISTORY/*.resolved*  (resolved => completed)
       - .conduit-data/sessions/reviewer-*  + session_logs/reviewer-*
         (work happened)

Usage:
  python3 rebuild_kg.py --dry-run
  python3 rebuild_kg.py --write
"""

import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

KG_PATH = "/home/codex/dev/nexus/graph/nexus-knowledge-graph.json"
BACKUP_PATH = "/home/codex/dev/nexus/graph/nexus-knowledge-graph.json.bak"
WR_FOLDER = "/home/codex/dev/nexus/.conduit-data/WORK_REQUESTS"
SESSIONS = "/home/codex/dev/nexus/.conduit-data/sessions"
SESSION_LOGS = "/home/codex/dev/nexus/.conduit-data/session_logs"
HISTORY = "/home/codex/dev/nexus/audit/HISTORY"

PG = {"host": "localhost", "port": "5432", "user": "pguser", "db": "nexus"}


def psql_json(sql: str) -> list:
    """Run psql and return a JSON array of row objects.

    Uses json_agg() so multi-line / tab-containing JSON fields survive
    (tab-delimited parsing silently dropped rows with embedded newlines).
    """
    env = dict(os.environ)
    env["PGPASSWORD"] = "pgpass"
    wrap = f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"
    r = subprocess.run(
        ["psql", "-h", PG["host"], "-p", PG["port"], "-U", PG["user"], "-d", PG["db"],
         "-t", "-A", "-c", wrap],
        capture_output=True, text=True, env=env,
    )
    if r.returncode != 0:
        print(f"PSQL ERROR: {r.stderr[:500]}", file=sys.stderr)
        return []
    try:
        return json.loads(r.stdout)
    except Exception:
        print(f"PSQL JSON PARSE ERROR (falling back to empty): {r.stdout[:300]}", file=sys.stderr)
        return []


# ── 1. Load current KG ───────────────────────────────────────────────
def load_kg(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


# ── 2. Load DB implementation plans ──────────────────────────────────
def load_db_plans() -> list:
    rows = psql_json(
        "SELECT plan_number, title, status, goal, files_affected, acceptance_criteria, "
        "dependencies, tags, created_at, updated_at "
        "FROM nebula.implementation_plans WHERE plan_number ~ '^[0-9]+$'"
    )
    plans = []
    for row in rows:
        def to_list(v):
            if v is None:
                return []
            if isinstance(v, list):
                return v
            if isinstance(v, str):
                try:
                    p = json.loads(v)
                    return p if isinstance(p, list) else [p]
                except Exception:
                    return [t.strip() for t in v.strip("{}").split(",") if t.strip()]
            return [v]
        pn = row.get("plan_number", "")
        if not pn:
            continue
        plans.append({
            "plan_number": str(pn),
            "title": row.get("title") or f"Plan {pn}",
            "status": row.get("status") or "pending",
            "goal": row.get("goal") or "",
            "files_count": len(to_list(row.get("files_affected"))),
            "acceptance_count": len(to_list(row.get("acceptance_criteria"))),
            "dependencies": to_list(row.get("dependencies")),
            "tags": to_list(row.get("tags")),
            "created_at": row.get("created_at") or "",
            "updated_at": row.get("updated_at") or "",
            "_src": "db:nebula.implementation_plans",
        })
    return plans


# ── 3. Load DB work requests ─────────────────────────────────────────
def load_db_work_requests() -> list:
    rows = psql_json(
        "SELECT legacy_id, plan_id, business_status, title, dco_json, created_at, updated_at "
        "FROM nebula.work_requests WHERE legacy_id IS NOT NULL"
    )
    wrs = []
    for row in rows:
        dco = {}
        if row.get("dco_json"):
            try:
                dco = json.loads(row["dco_json"])
            except Exception:
                pass
        intent = dco.get("intent", {}) or {}
        meta = dco.get("metadata", {}) or {}
        lineage = dco.get("lineage", {}) or {}
        artifacts = dco.get("artifacts", {}) or {}
        es = dco.get("execution_state", {}) or {}
        legacy_id = row.get("legacy_id")
        plan_id = row.get("plan_id") or ""
        wrs.append({
            "id": legacy_id,
            "status": row.get("business_status") or es.get("status") or "pending",
            "plan": str(plan_id) if plan_id else "",
            "derived_from": lineage.get("derived_from", []),
            "problem_statement": intent.get("problem_statement", ""),
            "desired_outcome": intent.get("desired_outcome", ""),
            "produced_files": artifacts.get("produced_files", []),
            "title": row.get("title") or "",
            "model": meta.get("model", ""),
            "agent_id": meta.get("agent_id", ""),
            "created_at": row.get("created_at") or meta.get("created_at", ""),
            "plan_ref": f"plans/{plan_id}" if plan_id else None,
            "_src": "db:nebula.work_requests",
        })
    return wrs


# ── 4. Load WORK_REQUESTS folder files ───────────────────────────────
def load_folder_work_requests() -> list:
    wrs = []
    for fn in sorted(os.listdir(WR_FOLDER)):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(WR_FOLDER, fn)
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                d = json.load(f)
        except Exception:
            continue
        intent = d.get("intent", {}) or {}
        meta = d.get("metadata", {}) or {}
        lineage = d.get("lineage", {}) or {}
        artifacts = d.get("artifacts", {}) or {}
        es = d.get("execution_state", {}) or {}
        plan = ""
        derived = lineage.get("derived_from", [])
        if derived:
            plan = str(derived[0]).lstrip("0") or ""
        m = re.match(r"wr-(\d+)", fn)
        if not plan and m:
            plan = m.group(1).lstrip("0") or ""
        wrs.append({
            "id": d.get("id", fn.replace(".json", "")),
            "status": es.get("status", "pending"),
            "plan": plan,
            "derived_from": derived,
            "problem_statement": intent.get("problem_statement", ""),
            "desired_outcome": intent.get("desired_outcome", ""),
            "produced_files": (artifacts.get("produced_files") or [])[:20],
            "title": intent.get("desired_outcome", ""),
            "model": meta.get("model", ""),
            "agent_id": meta.get("agent_id", ""),
            "created_at": meta.get("created_at", ""),
            "plan_ref": f"plans/{plan}" if plan else None,
            "_src": "folder:WORK_REQUESTS",
        })
    return wrs


# ── 5. Completion evidence ───────────────────────────────────────────
def extract_reviewer_plans() -> set:
    """Plans referenced in reviewer-* session logs => work happened."""
    plans = set()
    for directory in (SESSIONS, SESSION_LOGS):
        if not os.path.isdir(directory):
            continue
        for fn in os.listdir(directory):
            if not fn.startswith("reviewer-"):
                continue
            try:
                with open(os.path.join(directory, fn), encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except Exception:
                continue
            for pat in (r"Plan[ _-]?(\d{3,4})\b", r"wr-(\d{3,4})\b", r"derived from (\d{3,4})\b"):
                for m in re.finditer(pat, content):
                    pn = m.group(1)
                    if pn.isdigit():
                        plans.add(int(pn))
    return plans


def extract_history_resolved() -> set:
    """HISTORY resolved filenames => completed work (phase-indexed)."""
    resolved = set()
    if os.path.isdir(HISTORY):
        for fn in os.listdir(HISTORY):
            if "resolved" in fn and fn.endswith(".md"):
                resolved.add(fn)
    return resolved


# ── 6. Merge ─────────────────────────────────────────────────────────
def merge_plans(existing: list, db_plans: list) -> list:
    merged = {}
    for p in existing:
        pn = str(p.get("plan_number", ""))
        if pn:
            merged[pn] = {**p, "_src": merged.get(pn, {}).get("_src", "kg:existing")}
    for p in db_plans:
        pn = p["plan_number"]
        p = {k: v for k, v in p.items() if k != "_src"}
        if pn in merged:
            # DB is canonical; preserve kg-only fields not in DB
            merged[pn] = {**merged[pn], **p, "_src": "db"}
        else:
            merged[pn] = {**p, "_src": "db"}
    return [v for v in merged.values()]


def merge_work_requests(existing: list, db_wrs: list, folder_wrs: list) -> list:
    merged = {}
    for w in existing:
        wid = w.get("id", "")
        if wid:
            merged[wid] = {**w, "_src": merged.get(wid, {}).get("_src", "kg:existing")}
    for w in folder_wrs:
        wid = w["id"]
        if wid in merged:
            merged[wid] = {**merged[wid], **w, "_src": "folder"}
        else:
            merged[wid] = {**w, "_src": "folder"}
    for w in db_wrs:
        wid = w["id"]
        w_clean = {k: v for k, v in w.items() if k != "_src"}
        if wid in merged:
            merged[wid] = {**merged[wid], **w_clean, "_src": "db"}
        else:
            merged[wid] = {**w_clean, "_src": "db"}
    return [v for v in merged.values()]


# ── 7. Apply evidence annotations ────────────────────────────────────
def apply_evidence(plans: list, wrs: list, reviewer_plans: set) -> None:
    for p in plans:
        pn = str(p.get("plan_number", ""))
        try:
            key = int(pn)
        except ValueError:
            continue
        evidence = []
        if key in reviewer_plans:
            evidence.append("reviewer-session:work-happened")
        if evidence:
            p["completion_evidence"] = evidence


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Print summary only")
    parser.add_argument("--write", action="store_true", help="Write the pared KG")
    args = parser.parse_args()

    if not args.dry_run and not args.write:
        print("Pass --dry-run or --write")
        sys.exit(1)

    kg = load_kg(KG_PATH)
    existing_wr = kg.get("work_requests", [])
    existing_plans = kg.get("plans", [])

    db_plans = load_db_plans()
    db_wrs = load_db_work_requests()
    folder_wrs = load_folder_work_requests()
    reviewer_plans = extract_reviewer_plans()
    history_resolved = extract_history_resolved()

    plans = merge_plans(existing_plans, db_plans)
    wrs = merge_work_requests(existing_wr, db_wrs, folder_wrs)
    apply_evidence(plans, wrs, reviewer_plans)

    # Summary
    print(f"=== Source counts ===")
    print(f"  KG existing plans:        {len(existing_plans)}")
    print(f"  DB implementation_plans:  {len(db_plans)}")
    print(f"  Merged plans:             {len(plans)}")
    print(f"  KG existing work_requests: {len(existing_wr)}")
    print(f"  DB work_requests:          {len(db_wrs)}")
    print(f"  Folder work_requests:      {len(folder_wrs)}")
    print(f"  Merged work_requests:      {len(wrs)}")
    print(f"  Reviewer-evidenced plans:  {len(reviewer_plans)}")
    print(f"  HISTORY resolved files:    {len(history_resolved)}")

    from collections import Counter
    plan_statuses = Counter(p.get("status", "?") for p in plans)
    wr_statuses = Counter(w.get("status", "?") for w in wrs)
    print(f"\n  Plan statuses: {dict(plan_statuses)}")
    print(f"  WR statuses:   {dict(wr_statuses)}")
    print(f"  Plans w/ completion_evidence: {sum(1 for p in plans if p.get('completion_evidence'))}")

    if not args.write:
        print("\nDRY RUN — no files written")
        return

    # Write the pared KG
    new_kg = {
        "$schema": kg.get("$schema", ""),
        "title": kg.get("title", ""),
        "description": kg.get("description", ""),
        "version": kg.get("version", ""),
        "rebuilt_at": "2026-08-08T00:00:00Z",
        "rebuilt_note": (
            "Pared to plans + work_requests only. Ontology sections preserved in "
            "nexus-knowledge-graph.json.bak for semantic crawling."
        ),
        "work_requests": wrs,
        "plans": plans,
    }

    # Keep a backup of the CURRENT main file before overwrite
    import shutil
    if os.path.exists(KG_PATH):
        stamp = "pre-rebuild"
        shutil.copy2(KG_PATH, f"{KG_PATH}.{stamp}")

    with open(KG_PATH, "w") as f:
        json.dump(new_kg, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {KG_PATH} ({os.path.getsize(KG_PATH)} bytes)")


if __name__ == "__main__":
    main()
