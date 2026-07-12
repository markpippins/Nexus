#!/usr/bin/env python3
"""
classify_plans.py — Cross-reference Migrated Plans forum posts against
agent records and git history to produce a likely-done / likely-not-done
classification.

Reads from:
  - assembly.posts (forum posts in Migrated Plans)
  - nebula.plans (plan titles)
  - agent_records (via REST API)
  - git log (subprocess)

Writes to:
  - stdout (table)
  - /tmp/plan_classification.json (machine-readable)
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
from collections import defaultdict

# ── Config ───────────────────────────────────────────────────────────
FORUM_UUID = "df619e87-7da3-4749-a905-2167c0d42125"
NEBULA_URL = os.getenv("NEBULA_URL", "http://localhost:3101")
REPO_ROOT = os.getenv("REPO_ROOT", os.path.expanduser("~/dev/nexus"))
DB_DSN = os.getenv("DATABASE_URL", "postgresql://pguser:pgpass@localhost:5432/nexus")


def query_db(sql: str) -> list[dict]:
    """Run a SQL query via psql and return rows as dicts."""
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
        if not line.strip():
            continue
        fields = line.split("|")
        rows.append(fields)
    return rows


def get_forum_plans() -> list[dict]:
    """Extract plan numbers and titles from Migrated Plans forum posts."""
    rows = query_db(f"""
        SELECT 
            p.title,
            (regexp_match(p.title, '\\[Plan #(\d+)\\]'))[1] as plan_num,
            p.id as post_id
        FROM assembly.posts p
        WHERE p.forum_uuid = '{FORUM_UUID}'
          AND p.title ~ '\\[Plan #(\d+)\\]'
        ORDER BY (regexp_match(p.title, '\\[Plan #(\d+)\\]'))[1]::int
    """)
    plans = []
    for fields in rows:
        if len(fields) >= 3 and fields[1]:
            plans.append({
                "title": fields[0],
                "plan_num": fields[1],
                "post_id": fields[2],
            })
    return plans


def get_plan_titles(plan_nums: list[str]) -> dict[str, str]:
    """Look up plan titles from nebula.plans."""
    if not plan_nums:
        return {}
    nums_str = ",".join(f"'{n}'" for n in plan_nums)
    rows = query_db(f"""
        SELECT id, title FROM nebula.plans 
        WHERE id IN ({nums_str}) AND deleted = 0
    """)
    return {fields[0]: fields[1] for fields in rows if len(fields) >= 2}


def get_agent_record_signals() -> dict[str, list[str]]:
    """Query agent records for mentions of plan numbers."""
    try:
        url = f"{NEBULA_URL}/api/agent-records?limit=5000"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f"Warning: Could not fetch agent records: {e}", file=sys.stderr)
        return {}

    # Index by plan number mentions
    signals = defaultdict(list)
    for record in data if isinstance(data, list) else data.get("records", []):
        content = (record.get("content") or "").lower()
        title = (record.get("title") or "").lower()
        text = f"{title} {content}"
        
        # Look for plan number references
        for match in re.finditer(r'plan\s*#?(\d{4})', text):
            plan_num = match.group(1)
            record_type = record.get("recordType", "unknown")
            signals[plan_num].append(f"agent_record:{record_type}")
        
        # Look for completion keywords near plan mentions
        if any(kw in text for kw in ["completed", "implemented", "done", "finished", "merged"]):
            for match in re.finditer(r'plan\s*#?(\d{4})', text):
                plan_num = match.group(1)
                signals[plan_num].append("completion_keyword")
    
    return dict(signals)


def get_git_signals(plan_nums: list[str], plan_titles: dict[str, str]) -> dict[str, list[str]]:
    """Search git log for commits mentioning plan numbers or titles."""
    signals = defaultdict(list)
    
    # Search by plan number
    for num in plan_nums:
        try:
            result = subprocess.run(
                ["git", "log", "--all", "--oneline", f"--grep=Plan #{num}"],
                capture_output=True, text=True, cwd=REPO_ROOT, timeout=30
            )
            if result.stdout.strip():
                commits = result.stdout.strip().split("\n")
                signals[num].append(f"git_commits:{len(commits)}")
                # Check for merge commits or implementation keywords
                for line in commits:
                    if any(kw in line.lower() for kw in ["merge", "implement", "complete", "done"]):
                        signals[num].append("git_merge_or_complete")
                        break
        except subprocess.TimeoutExpired:
            pass
    
    # Also search by title keywords (first 5 words)
    for num, title in plan_titles.items():
        if num not in plan_nums:
            continue
        keywords = " ".join(title.split()[:5])
        if len(keywords) < 10:
            continue
        try:
            result = subprocess.run(
                ["git", "log", "--all", "--oneline", f"--grep={keywords}"],
                capture_output=True, text=True, cwd=REPO_ROOT, timeout=30
            )
            if result.stdout.strip():
                commits = result.stdout.strip().split("\n")
                signals[num].append(f"git_title_match:{len(commits)}")
        except subprocess.TimeoutExpired:
            pass
    
    return dict(signals)


def classify(plan_num: str, git_sigs: list[str], agent_sigs: list[str]) -> str:
    """Classify a plan as likely_done, likely_not_done, or uncertain."""
    all_sigs = git_sigs + agent_sigs
    
    # Strong done signals
    done_signals = sum(1 for s in all_sigs 
                       if "completion_keyword" in s or "git_merge_or_complete" in s)
    if done_signals >= 2:
        return "likely_done"
    
    # Has git commits = probably worked on
    git_count = sum(int(m.split(":")[1]) for s in all_sigs 
                    if s.startswith("git_commits:") 
                    for m in [s])
    git_title = sum(int(m.split(":")[1]) for s in all_sigs 
                    if s.startswith("git_title_match:") 
                    for m in [s])
    
    if git_count >= 3 or git_title >= 2:
        return "likely_done" if done_signals >= 1 else "uncertain"
    
    if git_count == 0 and git_title == 0 and not agent_sigs:
        return "likely_not_done"
    
    return "uncertain"


def main():
    print("Fetching forum plans...", file=sys.stderr)
    forum_plans = get_forum_plans()
    plan_nums = [p["plan_num"] for p in forum_plans]
    print(f"Found {len(forum_plans)} plans in forum", file=sys.stderr)
    
    print("Looking up plan titles...", file=sys.stderr)
    plan_titles = get_plan_titles(plan_nums)
    
    print("Searching agent records...", file=sys.stderr)
    agent_sigs = get_agent_record_signals()
    
    print("Searching git history...", file=sys.stderr)
    git_sigs = get_git_signals(plan_nums, plan_titles)
    
    # Classify
    results = []
    counts = defaultdict(int)
    
    for fp in forum_plans:
        num = fp["plan_num"]
        title = plan_titles.get(num, fp["title"])
        g = git_sigs.get(num, [])
        a = agent_sigs.get(num, [])
        status = classify(num, g, a)
        counts[status] += 1
        
        results.append({
            "plan_num": num,
            "title": title,
            "status": status,
            "git_signals": g,
            "agent_signals": a,
        })
    
    # Output
    print(f"\n{'='*80}")
    print(f"PLAN CLASSIFICATION — {len(results)} plans")
    print(f"{'='*80}")
    print(f"  likely_done:      {counts['likely_done']}")
    print(f"  uncertain:        {counts['uncertain']}")
    print(f"  likely_not_done:  {counts['likely_not_done']}")
    print(f"{'='*80}\n")
    
    # Group by status
    for status in ["likely_done", "uncertain", "likely_not_done"]:
        group = [r for r in results if r["status"] == status]
        if not group:
            continue
        print(f"\n--- {status.upper()} ({len(group)}) ---\n")
        for r in group:
            sigs = []
            if r["git_signals"]:
                sigs.append(f"git: {', '.join(r['git_signals'])}")
            if r["agent_signals"]:
                sigs.append(f"agent: {', '.join(r['agent_signals'])}")
            sig_str = f" [{'; '.join(sigs)}]" if sigs else ""
            print(f"  #{r['plan_num']}  {r['title']}{sig_str}")
    
    # Write machine-readable output
    with open("/tmp/plan_classification.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nMachine-readable output: /tmp/plan_classification.json")


if __name__ == "__main__":
    main()
