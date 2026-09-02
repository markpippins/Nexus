#!/usr/bin/env python3
"""sonar-forum-sync.py — mirror SonarQube findings into the assembly `sonar` forum.

Idempotent and schedule-safe. Reads open findings from the nexus `sonar` schema
(the canonical mirror maintained by ballerina sonar-sync) and reconciles
threads in the assembly `sonar` forum:

  issues  BLOCKER/CRITICAL  -> one thread per finding  (title carries severity)
  issues  MAJOR/MINOR/INFO  -> one thread per rule     (body carries the list)
  hotspots unreviewed       -> one thread per finding  (security-relevant)

Lifecycle on re-run:
  * missing thread            -> created (status 0 / posted)
  * finding resolved          -> thread advanced to 4 (accepted) + completion comment
  * finding reopened          -> thread returned to 0 + comment
  * grouped rule now empty    -> thread advanced to 4 + completion comment
  * grouped body stale        -> body replaced via PUT (counts/list stay current)

Threads are matched by body marker lines (`Sonar key: <key>` for individual
findings, `Rule family: <rule_key>` for grouped ones) so titles stay
human-editable and the sync never duplicates on re-run.

Usage:
  sonar-forum-sync.py                 # full reconcile
  sonar-forum-sync.py --dry-run       # report what would change, change nothing
  sonar-forum-sync.py --forum devops  # override forum slug
  sonar-forum-sync.py --user <uuid>   # override poster (default: sonar-sync by alias)

Env:
  ASSEMBLY_URL   assembly-srv base (default http://localhost:3107)
  SONAR_PG_DSN   postgres DSN        (default postgresql://pguser:pgpass@localhost:5432/nexus)

Exit codes: 0 ok, 1 API/db error, 2 usage error
"""

import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

ASSEMBLY_URL = os.environ.get("ASSEMBLY_URL", "http://localhost:3107")
DSN = os.environ.get("SONAR_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")
FORUM_SLUG = "sonar"
ROLE = "sonar-sync"
MODEL = "sonar-sync"

PER_FINDING_SEVERITIES = {"BLOCKER", "CRITICAL"}
GROUPED_SEVERITIES = {"MAJOR", "MINOR", "INFO"}


# ── tiny HTTP helpers ────────────────────────────────────────────────
def http(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        ASSEMBLY_URL + path, data=data, method=method,
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        raise SystemExit(f"HTTP {e.code} {method} {path}: {body}") from e
    except urllib.error.URLError as e:
        raise SystemExit(f"cannot reach {ASSEMBLY_URL}: {e}") from e


def resolve_user(alias):
    _, users = http("GET", "/api/users")
    for u in users:
        # the list endpoint serializes alias as `name`
        if u.get("name") == alias or u.get("alias") == alias:
            return u["id"]
    raise SystemExit(f"assembly user '{alias}' not found — create it via POST /api/users first")


# ── open findings from the canonical sonar schema ───────────────────
def fetch_open_findings():
    import psycopg2
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT key, sonar_type, severity, status, component_key, line,
                      rule_key, message, review_status
               FROM sonar.issues
               WHERE review_status IS NULL OR review_status = 'to-review'
               ORDER BY (severity = 'BLOCKER') DESC, (severity = 'CRITICAL') DESC,
                        updated_at DESC""")
        issues = [dict(zip([d[0] for d in cur.description], row)) for row in cur.fetchall()]
        cur.execute(
            """SELECT key, security_category, vulnerability_probability, status,
                      component_key, line, rule_key, message, review_status
               FROM sonar.hotspots
               WHERE review_status IS NULL OR review_status = 'to-review'
               ORDER BY (vulnerability_probability = 'HIGH') DESC, updated_at DESC""")
        hotspots = [dict(zip([d[0] for d in cur.description], row)) for row in cur.fetchall()]
        return issues, hotspots
    finally:
        conn.close()


# ── desired thread set ──────────────────────────────────────────────
def truncate(s, n):
    return s if len(s) <= n else s[: n - 1] + "…"


def finding_title(kind, sev, rule, component):
    prefix = {"issue": f"[SQ {sev}]", "hotspot": "[SQ HOTSPOT]"}[kind]
    comp = truncate(component or "unknown-component", 120)
    return f"{prefix} {rule} — {comp}"


def finding_body(f):
    kind = f.get("kind", "issue")
    rows = []
    if kind == "issue":
        rows += [
            ("Rule", f"`{f['rule_key']}`"),
            ("Type", f.get("sonar_type") or "—"),
            ("Severity", f.get("severity") or "—"),
            ("Component", f"`{f.get('component_key') or '—'}`"),
            ("Line", str(f.get("line") or "—")),
            ("Status", f.get("status") or "—"),
        ]
    else:
        rows += [
            ("Rule", f"`{f['rule_key']}`"),
            ("Category", f.get("security_category") or "—"),
            ("Probability", f.get("vulnerability_probability") or "—"),
            ("Component", f"`{f.get('component_key') or '—'}`"),
            ("Line", str(f.get("line") or "—")),
            ("Status", f.get("status") or "—"),
        ]
    table = "\n".join(f"| {k} | {v} |" for k, v in rows)
    sev = f.get("severity") or f.get("vulnerability_probability") or "FINDING"
    return (
        f"## SonarQube {kind} — {sev}\n\n{table}\n\n"
        f"**Message:** {f.get('message') or '—'}\n\n"
        "---\n*Automated by sonar-forum-sync. Resolve via the barbie/assembly review "
        "writeback; this thread closes itself once the finding is marked resolved.*\n\n"
        f"Sonar key: {f['key']}\n"
    )


def grouped_title(rule):
    return f"[SQ MAJOR+] {rule}"


def grouped_body(rule, findings):
    lines = ["| # | Severity | Component | Line | Message |", "|---|---|---|---|---|"]
    for i, f in enumerate(findings, 1):
        msg = truncate((f.get("message") or "").replace("|", "/").replace("\n", " "), 80)
        lines.append(
            f"| {i} | {f.get('severity') or '—'} | `{truncate(f.get('component_key') or '—', 60)}` "
            f"| {f.get('line') or '—'} | {msg} |")
    return (
        f"## SonarQube rule family — `{rule}` — {len(findings)} open (MAJOR+)\n\n"
        + "\n".join(lines)
        + "\n\n---\n*Automated by sonar-forum-sync. Thread closes when all findings "
          "in this rule family are resolved.*\n\n"
        f"Rule family: {rule}\n"
    )


def build_desired(issues, hotspots):
    """Returns (per_finding, grouped) dicts keyed by marker for matching."""
    per_finding, grouped = {}, {}
    for f in issues:
        sev = f.get("severity") or "INFO"
        if sev in PER_FINDING_SEVERITIES:
            f = dict(f, kind="issue")
            per_finding[f["key"]] = {
                "marker": f["key"],
                "title": finding_title("issue", sev, f["rule_key"], f.get("component_key")),
                "body": finding_body(f),
            }
        elif sev in GROUPED_SEVERITIES:
            grouped.setdefault(f["rule_key"], []).append(f)
    for f in hotspots:
        f = dict(f, kind="hotspot")
        sev = f.get("vulnerability_probability") or "NORMAL"
        per_finding[f["key"]] = {
            "marker": f["key"],
            "title": finding_title("hotspot", sev, f["rule_key"], f.get("component_key")),
            "body": finding_body(f),
        }
    grouped = {
        rule: {
            "marker": rule,
            "title": grouped_title(rule),
            "body": grouped_body(rule, findings),
            "n": len(findings),
        }
        for rule, findings in sorted(grouped.items())
    }
    return per_finding, grouped


# ── existing threads in the forum ───────────────────────────────────
def fetch_existing_threads():
    """All threads with bodies, keyed by (marker-kind, marker)."""
    out = []
    page, page_size = 1, 500
    while True:
        _, data = http("GET", f"/api/forums/{FORUM_SLUG}/threads?includeBody=true&page={page}&pageSize={page_size}")
        items = data.get("items", [])
        out.extend(items)
        total = data.get("total", len(out))
        if page * page_size >= total or not items:
            break
        page += 1
    return out


def marker_of(thread):
    body = thread.get("body") or ""
    if "Sonar key:" in body:
        for line in body.splitlines():
            if line.strip().startswith("Sonar key:"):
                return "finding", line.split(":", 1)[1].strip()
    if "Rule family:" in body:
        for line in body.splitlines():
            if line.strip().startswith("Rule family:"):
                return "rule", line.split(":", 1)[1].strip()
    return None, None


# ── reconcile ───────────────────────────────────────────────────────
def post_comment(thread_id, body, rating=None, dry=False):
    payload = {"body": body, "postedById": USER_ID, "role": ROLE, "model": MODEL}
    if rating is not None:
        payload["statusRating"] = rating
    if dry:
        print(f"    (dry) comment on {thread_id[:8]}: {body[:70]!r}" + (f" rating={rating}" if rating is not None else ""))
        return
    http("POST", f"/api/forums/threads/{thread_id}/comments", payload)


def set_status(thread_id, rating, dry=False):
    if dry:
        print(f"    (dry) status {thread_id[:8]} -> {rating}")
        return
    http("PUT", f"/api/forums/threads/{thread_id}/status", {"rating": rating})


def create_thread(title, body, dry=False):
    if dry:
        print(f"    (dry) create: {title[:80]}")
        return
    http("POST", f"/api/forums/{FORUM_SLUG}/threads",
         {"title": title, "body": body, "postedById": USER_ID, "role": ROLE, "model": MODEL})


def update_thread(thread_id, title, body, dry=False):
    if dry:
        print(f"    (dry) update {thread_id[:8]}: body replaced")
        return
    http("PUT", f"/api/forums/threads/{thread_id}", {"title": title, "body": body})


def main():
    global FORUM_SLUG, USER_ID
    ap = argparse.ArgumentParser(description="Sync SonarQube findings into the assembly sonar forum")
    ap.add_argument("--dry-run", action="store_true", help="report what would change, change nothing")
    ap.add_argument("--forum", default=FORUM_SLUG, help=f"forum slug (default {FORUM_SLUG})")
    ap.add_argument("--user", default=None, help="poster user UUID (default: sonar-sync by alias)")
    args = ap.parse_args()
    FORUM_SLUG = args.forum
    USER_ID = args.user or resolve_user("sonar-sync")

    print(f"sync: forum={FORUM_SLUG} user={USER_ID} dry={args.dry_run}")
    issues, hotspots = fetch_open_findings()
    print(f"open findings: {len(issues)} issues, {len(hotspots)} hotspots")

    per_finding, grouped = build_desired(issues, hotspots)
    print(f"desired: {len(per_finding)} per-finding threads, {len(grouped)} grouped rule threads")

    existing = fetch_existing_threads()
    have_finding = {}
    have_rule = {}
    for t in existing:
        kind, marker = marker_of(t)
        if kind == "finding":
            have_finding[marker] = t
        elif kind == "rule":
            have_rule[marker] = t
    print(f"existing: {len(existing)} threads ({len(have_finding)} finding, {len(have_rule)} rule)")

    created = updated = closed = reopened = skipped = 0

    # 1) per-finding threads
    for key, spec in per_finding.items():
        t = have_finding.get(key)
        if t is None:
            create_thread(spec["title"], spec["body"], args.dry_run)
            created += 1
        elif t.get("statusRating", 0) >= 4:
            # previously closed, finding is open again -> reopen
            post_comment(t["id"], "Sonar-sync: this finding is open again — reopening.", 0, args.dry_run)
            reopened += 1
        else:
            skipped += 1

    # 2) grouped rule threads
    for rule, spec in grouped.items():
        t = have_rule.get(rule)
        if t is None:
            create_thread(spec["title"], spec["body"], args.dry_run)
            created += 1
        else:
            if t.get("statusRating", 0) >= 4:
                post_comment(t["id"], "Sonar-sync: rule family has open findings again — reopening.", 0, args.dry_run)
                reopened += 1
            elif (t.get("body") or "").strip() != spec["body"].strip():
                update_thread(t["id"], spec["title"], spec["body"], args.dry_run)
                updated += 1
            else:
                skipped += 1

    # 3) close threads whose finding/rule is no longer open
    for key, t in have_finding.items():
        if key not in per_finding and t.get("statusRating", 0) < 4:
            post_comment(t["id"], "Sonar-sync: this finding is resolved — closing.", 4, args.dry_run)
            closed += 1
    for rule, t in have_rule.items():
        if rule not in grouped and t.get("statusRating", 0) < 4:
            post_comment(t["id"], "Sonar-sync: all findings in this rule family are resolved — closing.", 4, args.dry_run)
            closed += 1

    print(f"result: created={created} updated={updated} closed={closed} reopened={reopened} unchanged={skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())