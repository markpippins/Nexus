#!/usr/bin/env python3
"""
classify_candidates.py — Cross-reference harvest_candidates against
implementation_plans and git history to identify candidates for
already-completed work.

Reads from: harvest_candidates, implementation_plans, git log
Writes to: stdout + /tmp/candidate_classification.json
"""

import json
import os
import subprocess
import sys
from collections import defaultdict

REPO_ROOT = os.getenv("REPO_ROOT", os.path.expanduser("~/dev/nexus"))


def query_db(sql: str) -> list[list[str]]:
    result = subprocess.run(
        ["psql", "-h", "localhost", "-U", "pguser", "-d", "nexus",
         "-t", "-A", "-F", "|", "-c", sql],
        capture_output=True, text=True,
        env={**os.environ, "PGPASSWORD": "pgpass"}
    )
    if result.returncode != 0:
        print(f"SQL error: {result.stderr}", file=sys.stderr)
        return []
    rows = []
    for line in result.stdout.strip().split("\n"):
        if line.strip():
            rows.append(line.split("|"))
    return rows


def get_candidates():
    rows = query_db("""
        SELECT id, title, status, harvest_id::text
        FROM nebula.harvest_candidates
        ORDER BY title
    """)
    return [{"id": r[0], "title": r[1], "status": r[2], "harvest_id": r[3]} for r in rows]


def get_plan_matches():
    """Find candidates with title similarity > 0.35 to implementation_plans."""
    rows = query_db("""
        SELECT 
            hc.id,
            hc.title,
            ip.plan_number,
            ip.title,
            ip.status,
            similarity(LOWER(TRIM(hc.title)), LOWER(TRIM(ip.title))) as sim
        FROM nebula.harvest_candidates hc
        CROSS JOIN nebula.implementation_plans ip
        WHERE similarity(LOWER(TRIM(hc.title)), LOWER(TRIM(ip.title))) > 0.35
    """)
    matches = defaultdict(list)
    for r in rows:
        matches[r[0]].append({
            "plan_number": r[2],
            "plan_title": r[3],
            "plan_status": r[4],
            "similarity": float(r[5]),
        })
    return dict(matches)


def get_intent_matches():
    """Find candidates with title similarity > 0.35 to intent_records."""
    rows = query_db("""
        SELECT 
            hc.id,
            hc.title,
            ir.id,
            ir.title,
            ir.source_type,
            ir.status,
            similarity(LOWER(TRIM(hc.title)), LOWER(TRIM(ir.title))) as sim
        FROM nebula.harvest_candidates hc
        CROSS JOIN nebula.intent_records ir
        WHERE similarity(LOWER(TRIM(hc.title)), LOWER(TRIM(ir.title))) > 0.35
    """)
    matches = defaultdict(list)
    for r in rows:
        matches[r[0]].append({
            "intent_id": r[2],
            "intent_title": r[3],
            "source_type": r[4],
            "intent_status": r[5],
            "similarity": float(r[6]),
        })
    return dict(matches)


def get_git_matches(candidates):
    """Search git log for each candidate title (first 5 words)."""
    matches = {}
    for c in candidates:
        title = c["title"]
        # Use first 5 significant words
        words = [w for w in title.split() if len(w) > 3][:5]
        query = " ".join(words)
        if len(query) < 15:
            continue
        try:
            result = subprocess.run(
                ["git", "log", "--all", "--oneline", f"--grep={query}"],
                capture_output=True, text=True, cwd=REPO_ROOT, timeout=15
            )
            if result.stdout.strip():
                commits = result.stdout.strip().split("\n")
                matches[c["id"]] = {
                    "query": query,
                    "commit_count": len(commits),
                    "sample": commits[:3],
                }
        except (subprocess.TimeoutExpired, Exception):
            pass
    return matches


def classify(candidate, plan_matches, intent_matches, git_matches):
    """Classify a candidate as completed, in-progress, or backlog."""
    cid = candidate["id"]
    cstatus = candidate["status"]
    
    pm = plan_matches.get(cid, [])
    im = intent_matches.get(cid, [])
    gm = git_matches.get(cid)
    
    # Strong completed signal: exact match to archived plan
    for p in pm:
        if p["similarity"] >= 0.95 and p["plan_status"] == "archived":
            return "completed_plan"
    
    # Match to draft plan = in-progress (candidate was promoted to a plan)
    for p in pm:
        if p["similarity"] >= 0.95 and p["plan_status"] == "draft":
            return "has_draft_plan"
    
    # Match to intent_record = pipeline progressed
    for i in im:
        if i["similarity"] >= 0.95:
            return "has_intent_record"
    
    # Git commits exist = work was done
    if gm and gm["commit_count"] >= 3:
        return "git_activity"
    
    # Moderate plan match
    for p in pm:
        if p["similarity"] > 0.7 and p["plan_status"] == "archived":
            return "likely_completed"
    
    # Candidate was promoted but nothing else happened
    if cstatus == "promoted":
        return "promoted_no_match"
    
    if cstatus == "linked":
        return "linked_no_match"
    
    return "backlog"


def main():
    print("Fetching candidates...", file=sys.stderr)
    candidates = get_candidates()
    print(f"  {len(candidates)} candidates", file=sys.stderr)
    
    print("Matching against implementation_plans...", file=sys.stderr)
    plan_matches = get_plan_matches()
    print(f"  {len(plan_matches)} candidates matched plans", file=sys.stderr)
    
    print("Matching against intent_records...", file=sys.stderr)
    intent_matches = get_intent_matches()
    print(f"  {len(intent_matches)} candidates matched intents", file=sys.stderr)
    
    print("Searching git history...", file=sys.stderr)
    git_matches = get_git_matches(candidates)
    print(f"  {len(git_matches)} candidates matched git commits", file=sys.stderr)
    
    # Classify
    results = []
    counts = defaultdict(int)
    
    for c in candidates:
        status = classify(c, plan_matches, intent_matches, git_matches)
        counts[status] += 1
        
        entry = {
            "id": c["id"],
            "title": c["title"],
            "candidate_status": c["status"],
            "classification": status,
        }
        if c["id"] in plan_matches:
            entry["plan_matches"] = plan_matches[c["id"]]
        if c["id"] in intent_matches:
            entry["intent_matches"] = intent_matches[c["id"]]
        if c["id"] in git_matches:
            entry["git_matches"] = git_matches[c["id"]]
        
        results.append(entry)
    
    # Summary
    print(f"\n{'='*80}")
    print(f"CANDIDATE CLASSIFICATION — {len(results)} candidates")
    print(f"{'='*80}")
    for status, count in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {status:30s}  {count:4d}")
    print(f"  {'TOTAL':30s}  {len(results):4d}")
    print(f"{'='*80}")
    
    # Group by classification
    for status in sorted(counts.keys()):
        group = [r for r in results if r["classification"] == status]
        print(f"\n--- {status.upper()} ({len(group)}) ---\n")
        for r in group[:10]:
            extra = []
            if "plan_matches" in r:
                pm = r["plan_matches"][0]
                extra.append(f"plan #{pm['plan_number']} ({pm['plan_status']})")
            if "intent_matches" in r:
                im = r["intent_matches"][0]
                extra.append(f"intent ({im['source_type']})")
            if "git_matches" in r:
                extra.append(f"git:{r['git_matches']['commit_count']} commits")
            detail = f"  [{', '.join(extra)}]" if extra else ""
            print(f"  {r['title'][:70]}{detail}")
        if len(group) > 10:
            print(f"  ... and {len(group) - 10} more")
    
    with open("/tmp/candidate_classification.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nMachine-readable: /tmp/candidate_classification.json")


if __name__ == "__main__":
    main()
