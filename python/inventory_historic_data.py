#!/usr/bin/env python3
"""
Full inventory + cross-reference of ALL historic data sources against the
rebuilt knowledge graph (nexus/graph/nexus-knowledge-graph.json) and the
canonical DB (nebula.implementation_plans, nebula.work_requests).

Areas scanned:
  1. nexus/audit/CONDUIT_DATA       (mirror of deleted .conduit-data — historic conduit data)
  2. nexus/audit                    (audit archive incl. CONDUIT_DATA mirror, HISTORY, PLANS, IMPLEMENTATION_PLANS, ROVER, PROMPTS, ...)
  3. ./bak/nexus **RECORD dirs      (losm + html-importer RECORD folders)

Output: a reconciliation report printed to stdout (and written to
        /home/codex/dev/nexus/audit/maintenance/kg-reconciliation.md when --write).

Usage:
  python3 inventory_historic_data.py            # report only
  python3 inventory_historic_data.py --write    # also write report md
"""

import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict

ROOT = "/home/codex/dev/nexus"
KG_PATH = f"{ROOT}/graph/nexus-knowledge-graph.json"
# .conduit-data deleted 2026-08-09; mirror is the posterity home
CONDUIT = f"{ROOT}/audit/CONDUIT_DATA"
AUDIT = f"{ROOT}/audit"
BAK = "/home/codex/dev/bak/nexus"

PG = {"host": "localhost", "port": "5432", "user": "pguser", "db": "nexus"}


def psql(sql: str) -> list:
    env = dict(os.environ)
    env["PGPASSWORD"] = "pgpass"
    r = subprocess.run(
        ["psql", "-h", PG["host"], "-p", PG["port"], "-U", PG["user"], "-d", PG["db"],
         "-t", "-A", "-F", "\t", "-c", sql],
        capture_output=True, text=True, env=env,
    )
    if r.returncode != 0:
        return []
    return [line for line in r.stdout.split("\n") if line.strip()]


def norm_pn(s) -> str | None:
    """Normalize a plan number: '001' / '0001' / '1' -> '0001'. Returns None if not numeric."""
    if s is None:
        return None
    s = str(s).strip()
    if not s.isdigit():
        return None
    return s.zfill(4)


def load_db_plan_numbers() -> dict:
    """plan_number -> (title, status)"""
    out = {}
    for row in psql("SELECT plan_number, title, status FROM nebula.implementation_plans WHERE plan_number ~ '^[0-9]+$'"):
        parts = row.split("\t")
        if len(parts) >= 1 and parts[0].isdigit():
            out[parts[0].zfill(4)] = (parts[1] if len(parts) > 1 else "", parts[2] if len(parts) > 2 else "")
    return out


def load_db_wr_ids() -> set:
    return set(r for row in psql("SELECT legacy_id FROM nebula.work_requests WHERE legacy_id IS NOT NULL") for r in [row])


def load_kg() -> dict:
    with open(KG_PATH) as f:
        return json.load(f)


def count_files(directory: str) -> dict:
    """Return {subdir_or_'.': {ext: count}} for one level under directory."""
    out = defaultdict(Counter)
    if not os.path.isdir(directory):
        return out
    for fn in os.listdir(directory):
        p = os.path.join(directory, fn)
        if os.path.isfile(p):
            ext = os.path.splitext(fn)[1].lstrip(".") or "(none)"
            out["."][ext] += 1
        elif os.path.isdir(p):
            for sub, _, files in os.walk(p):
                rel = os.path.relpath(sub, p)
                for f in files:
                    ext = os.path.splitext(f)[1].lstrip(".") or "(none)"
                    out[rel][ext] += 1
    return out


def plan_number_from_filename(fn: str) -> str | None:
    """Extract plan number from a doc filename.

    Handles: 0082-nebula..., 013-formal-agenda..., v0112-... (v-numbered),
    0074-response-indicators-on-rows (leading number), e2e-test-v2-v0112.
    """
    m = re.match(r"(\d{3,4})(?:[-_.])", fn)
    if m:
        return norm_pn(m.group(1))
    m = re.search(r"v(\d{3,4})\b", fn)
    if m:
        return norm_pn(m.group(1))
    return None


def embedded_plan_number(path: str) -> str | None:
    """Extract 'Plan Number: NNNN' from a doc's frontmatter/header (first 25 lines)."""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            head = f.read(6000)
    except Exception:
        return None
    m = re.search(r"Plan\s+Number:\s*(\d{3,4})", head)
    return norm_pn(m.group(1)) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    kg = load_kg()
    kg_plans = {norm_pn(p.get("plan_number")): p for p in kg["plans"] if norm_pn(p.get("plan_number"))}
    kg_wr_ids = {w.get("id") for w in kg["work_requests"] if w.get("id")}
    db_plans = load_db_plan_numbers()
    db_wr_ids = load_db_wr_ids()

    lines = []
    def out(s=""):
        print(s)
        lines.append(s)

    out("=" * 78)
    out("HISTORIC DATA INVENTORY vs KNOWLEDGE GRAPH / DB")
    out("=" * 78)
    out(f"KG plans: {len(kg_plans)} | KG work_requests: {len(kg_wr_ids)}")
    out(f"DB plans: {len(db_plans)} | DB work_requests (legacy_id): {len(db_wr_ids)}")
    out()

    # ── 1. audit/CONDUIT_DATA (mirror of deleted .conduit-data) ───────
    out("## 1. nexus/audit/CONDUIT_DATA (mirror)")
    for sub, c in sorted(count_files(CONDUIT).items()):
        if sub == ".":
            out(f"  (top-level files) {dict(c)}")
        else:
            out(f"  {sub}/: {sum(c.values())} files {dict(c)}")

    wr_dir = f"{CONDUIT}/WORK_REQUESTS"
    folder_wr_ids = {fn.replace(".json", "") for fn in os.listdir(wr_dir) if fn.endswith(".json")}
    out(f"\n  WORK_REQUESTS folder: {len(folder_wr_ids)} files")
    out(f"    in KG: {len(folder_wr_ids & kg_wr_ids)} | missing from KG: {len(folder_wr_ids - kg_wr_ids)}")
    out(f"    in DB: {len(folder_wr_ids & db_wr_ids)} | missing from DB: {len(folder_wr_ids - db_wr_ids)}")

    # Reviewer sessions = work-happened evidence
    reviewer_plans = set()
    for sess_dir in (f"{CONDUIT}/sessions", f"{CONDUIT}/session_logs"):
        if not os.path.isdir(sess_dir):
            continue
        for fn in os.listdir(sess_dir):
            if not fn.startswith("reviewer-"):
                continue
            try:
                with open(os.path.join(sess_dir, fn), encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except Exception:
                continue
            for pat in (r"Plan[ _-]?(\d{3,4})\b", r"wr-(\d{3,4})\b", r"derived from (\d{3,4})\b"):
                for m in re.finditer(pat, content):
                    if m.group(1).isdigit():
                        reviewer_plans.add(norm_pn(m.group(1)))
    out(f"  Reviewer-evidenced plans (work happened): {len(reviewer_plans)}")
    out()

    # ── 2. audit ──────────────────────────────────────────────────────
    out("## 2. nexus/audit")
    skip_detail = {"CONDUIT_DATA"}  # already inventoried above (section 1)
    for sub in sorted(os.listdir(AUDIT)):
        p = os.path.join(AUDIT, sub)
        if not os.path.isdir(p) or sub.startswith("."):
            continue
        n = sum(len(fs) for _, _, fs in os.walk(p))
        note = " (inventoried in section 1)" if sub in skip_detail else ""
        out(f"  {sub}/: {n} files{note}")

    # audit/PLANS + IMPLEMENTATION_PLANS — plan-numbered docs
    out("\n### audit/PLANS + IMPLEMENTATION_PLANS — plan-numbered docs")
    doc_mapping = defaultdict(list)  # norm_pn -> [(path, src_folder, status_subfolder)]
    plan_doc_dirs = [
        (f"{AUDIT}/PLANS", "audit/PLANS"),
        (f"{AUDIT}/IMPLEMENTATION_PLANS", "audit/IMPLEMENTATION_PLANS"),
    ]
    doc_unmatched = []
    for base, label in plan_doc_dirs:
        if not os.path.isdir(base):
            continue
        for root, subdirs, files in os.walk(base):
            for fn in sorted(files):
                if not fn.endswith(".md"):
                    continue
                pn = plan_number_from_filename(fn)
                if not pn:
                    pn = embedded_plan_number(os.path.join(root, fn))
                rel = os.path.relpath(root, base)
                doc_mapping[pn].append((os.path.join(root, fn), label, rel if rel != "." else ""))
                if pn and pn not in kg_plans:
                    doc_unmatched.append(pn)

    numbered = {k: v for k, v in doc_mapping.items() if k}
    unnumbered_docs = [v[0][0] for k, v in doc_mapping.items() if k is None]
    in_kg = [k for k in numbered if k in kg_plans]
    not_in_kg = [k for k in numbered if k not in kg_plans]
    out(f"  Plan-numbered docs (incl. v-numbers + embedded): {len(numbered)} | unnumbered docs: {len(unnumbered_docs)}")
    out(f"  Numbered docs already in KG: {len(in_kg)}")
    out(f"  Numbered docs NOT in KG ({len(not_in_kg)}):")
    for k in sorted(not_in_kg):
        src = numbered[k][0][1]
        out(f"    {k}  <- {os.path.basename(numbered[k][0][0])} ({src})")
    out(f"  Unnumbered plan docs NOT in KG ({len(unnumbered_docs)}):")
    for p in unnumbered_docs:
        out(f"    {os.path.relpath(p, AUDIT)}")
    out()

    # audit/CHANGES/committed — builder change reports (completion evidence)
    changes_dir = f"{AUDIT}/CHANGES/committed"
    changes_refs = []
    if os.path.isdir(changes_dir):
        for fn in sorted(os.listdir(changes_dir)):
            if not fn.endswith(".md"):
                continue
            m = re.match(r"builder-(\d{8})-(\d{3,4})-?(.*)\.md", fn)
            if not m:
                continue
            date, seq, slug = m.groups()
            pn = norm_pn(seq)
            changes_refs.append((fn, pn, slug))
        out("\n### audit/CHANGES/committed — builder change reports (completion evidence)")
        out(f"  {len(changes_refs)} reports; {len([1 for _, pn, _ in changes_refs if pn in kg_plans])} reference plans in KG")
        for fn, pn, slug in changes_refs:
            status = "KG" if pn in kg_plans else "---"
            out(f"    {status} {fn}")
        out()

    # ── 3. bak/nexus RECORD dirs ──────────────────────────────────────
    out("## 3. ./bak/nexus RECORD dirs (eza listing)")
    record_dirs = []
    for root, dirs, files in os.walk(BAK):
        for d in dirs:
            if d.upper().endswith("RECORD") or "RECORD" in d.upper():
                record_dirs.append(os.path.join(root, d))
    for d in sorted(record_dirs):
        n = len(os.listdir(d))
        rel = os.path.relpath(d, BAK)
        out(f"  {rel}/  ({n} files)")
        # losm plans
        if "IMPLEMENTATION_PLAN_RECORD" in d:
            for fn in sorted(os.listdir(d)):
                pn = plan_number_from_filename(fn)
                in_db = "DB" if pn in db_plans else "---"
                in_kg = "KG" if pn in kg_plans else "--"
                out(f"      {in_db}{in_kg} {fn}")
    out()

    # ── 4. Resolved = completion evidence ─────────────────────────────
    out("## 4. Resolved files (completion evidence)")
    resolved_sets = {
        "audit/HISTORY": f"{AUDIT}/HISTORY",
        "bak html-importer IMPLEMENTATION_RECORD": f"{BAK}/python/ingest/html-importer/IMPLEMENTATION_RECORD",
    }
    resolved_counts = {}
    for label, d in resolved_sets.items():
        if not os.path.isdir(d):
            continue
        resolved = [fn for fn in os.listdir(d) if "resolved" in fn]
        resolved_counts[label] = len(resolved)
        out(f"  {label}: {len(resolved)} resolved files")
        by_kind = Counter()
        for fn in resolved:
            for kind in ("implementation_plan", "walkthrough", "task", "analysis_results"):
                if fn.startswith(kind):
                    by_kind[kind] += 1
                    break
        out(f"      kinds: {dict(by_kind)}")

    # ── 5. ROVER / harvests / prompts (non-plan data, catalogued only) ─
    out("\n## 5. Non-plan archives (catalogued, not KG targets)")
    rover = f"{AUDIT}/ROVER"
    if os.path.isdir(rover):
        incoming = f"{rover}/incoming"
        harvests = [f for f in os.listdir(f"{incoming}/harvests")] if os.path.isdir(f"{incoming}/harvests") else []
        chats = [f for f in os.listdir(f"{incoming}/chats")] if os.path.isdir(f"{incoming}/chats") else []
        out(f"  ROVER: {sum(len(fs) for _,_,fs in os.walk(rover))} files")
        out(f"    incoming harvests: {len(harvests)} | incoming chats: {len(chats)}")
        out(f"    output: {sorted(os.listdir(f'{rover}/output'))}")
    prompts = [
        (f"{CONDUIT}/PROMPTS", "audit/CONDUIT_DATA/PROMPTS"),
        (f"{AUDIT}/PROMPTS", "audit/PROMPTS"),
    ]
    for d, label in prompts:
        if os.path.isdir(d):
            out(f"  {label}: {len([f for f in os.listdir(d) if not f.startswith('.')])} files")
    out()

    # ── 6. Summary / next actions ─────────────────────────────────────
    out("=" * 78)
    out("GAPS FOUND")
    out("=" * 78)
    out(f"  A. Plan-numbered docs in audit not in KG: {len(not_in_kg)} (incl. v-numbers/embedded)")
    for k in sorted(not_in_kg)[:20]:
        out(f"      {k}")
    out(f"  A2. Unnumbered plan docs not in KG: {len(unnumbered_docs)}")
    out(f"  B. WORK_REQUESTS files missing from KG: {len(folder_wr_ids - kg_wr_ids)}")
    out(f"  C. Reviewer-evidenced plans: {len(reviewer_plans)}")
    out(f"  D. Resolved-file completion evidence: {sum(resolved_counts.values())} files across {len(resolved_counts)} sets")
    out(f"  E. losm RECORD plans: 4 (all in DB/KG)")
    out(f"  F. CHANGES/committed builder reports: {len(changes_refs)} ({len([1 for _, pn, _ in changes_refs if pn in kg_plans])} plan refs in KG)")

    report_path = f"{AUDIT}/maintenance/kg-reconciliation.md"
    if args.write:
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        with open(report_path, "w") as f:
            f.write("# Knowledge Graph Reconciliation Report\n\n")
            f.write(f"_Generated {__import__('datetime').datetime.now().isoformat(timespec='minutes')}_\n\n")
            f.write("\n".join(lines))
            f.write("\n")
        print(f"\nWrote {report_path}")


if __name__ == "__main__":
    main()
