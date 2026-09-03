#!/usr/bin/env python3
"""jenkins-forum-sync.py — mirror Jenkins build failures into the assembly `jenkins` forum.

Idempotent and schedule-safe. Reads job/build state from the nexus `jenkins`
schema (the canonical mirror maintained by ballerina jenkins-sync) and
reconciles threads in the assembly `jenkins` forum:

  job last build FAILURE/UNSTABLE -> one open thread per job
                                    (body lists recent failing builds)
  job last build SUCCESS          -> thread closed (status 4) + completion comment
  always                          -> one CI overview thread with per-job summary

Lifecycle on re-run:
  * missing failure thread    -> created (status 0 / posted)
  * job green again           -> thread advanced to 4 (accepted) + comment
  * job fails again           -> thread returned to 0 + comment
  * new failing builds        -> body replaced via PUT (build table stays current)
  * overview body stale       -> body replaced via PUT

Threads are matched by body marker lines (`Jenkins job: <name>` for per-job
threads, `Jenkins overview: jenkins-forum-sync` for the overview) so titles
stay human-editable and the sync never duplicates on re-run.

Usage:
  jenkins-forum-sync.py                 # full reconcile
  jenkins-forum-sync.py --dry-run       # report what would change, change nothing
  jenkins-forum-sync.py --forum jenkins # override forum slug
  jenkins-forum-sync.py --user <uuid>   # override poster (default: jenkins-sync by alias)

Env:
  ASSEMBLY_URL   assembly-srv base (default http://localhost:3107)
  JENKINS_PG_DSN postgres DSN      (default postgresql://pguser:pgpass@localhost:5432/nexus)

Exit codes: 0 ok, 1 API/db error, 2 usage error
"""

import argparse
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

ASSEMBLY_URL = os.environ.get("ASSEMBLY_URL", "http://localhost:3107")
DSN = os.environ.get("JENKINS_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")
FORUM_SLUG = "jenkins"
ROLE = "jenkins-sync"
MODEL = "jenkins-sync"
OVERVIEW_MARKER = "jenkins-forum-sync"

FAILING_RESULTS = {"FAILURE", "UNSTABLE"}


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


# ── job/build state from the canonical jenkins schema ────────────────
def fetch_state():
    import psycopg2
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT name, color, last_build_num, last_build_result,
                      last_build_ts, last_build_dur, health_score
               FROM jenkins.jobs ORDER BY name""")
        jobs = [dict(zip([d[0] for d in cur.description], row)) for row in cur.fetchall()]

        cur.execute(
            """SELECT job_name,
                      COUNT(*) AS total_builds,
                      COUNT(*) FILTER (WHERE result = 'SUCCESS') AS pass_count,
                      COUNT(*) FILTER (WHERE result IN ('FAILURE', 'UNSTABLE')) AS fail_count
               FROM jenkins.builds GROUP BY job_name""")
        stats = {r[0]: {"total_builds": r[1], "pass_count": r[2], "fail_count": r[3]}
                 for r in cur.fetchall()}

        failing_builds = {}
        for job in jobs:
            if (job.get("last_build_result") or "") not in FAILING_RESULTS:
                continue
            cur.execute(
                """SELECT number, result, timestamp, duration, display_name
                   FROM jenkins.builds
                   WHERE job_name = %s AND result IN ('FAILURE', 'UNSTABLE')
                   ORDER BY number DESC LIMIT 10""", (job["name"],))
            failing_builds[job["name"]] = [
                dict(zip([d[0] for d in cur.description], row)) for row in cur.fetchall()]
        return jobs, stats, failing_builds
    finally:
        conn.close()


# ── formatting helpers ───────────────────────────────────────────────
def fmt_ts(ms):
    if not ms:
        return "—"
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc) \
        .astimezone().strftime("%b %d, %H:%M")


def fmt_dur(ms):
    if not ms:
        return "—"
    s = int(ms / 1000)
    if s < 60:
        return f"{s}s"
    return f"{s // 60}m {s % 60}s"


def truncate(s, n):
    return s if len(s) <= n else s[: n - 1] + "…"


def job_row(name, jobs_by_name, stats):
    j = jobs_by_name.get(name, {})
    st = stats.get(name, {})
    total = st.get("total_builds") or 0
    passed = st.get("pass_count") or 0
    rate = f"{round(100 * passed / total)}%" if total else "—"
    return (
        f"| `{name}` | {j.get('last_build_num') or '—'} "
        f"| {j.get('last_build_result') or '—'} | {fmt_ts(j.get('last_build_ts'))} "
        f"| {rate} | {j.get('health_score') or 0}% |"
    )


# ── desired thread bodies ────────────────────────────────────────────
def failure_title(job):
    return f"[Jenkins FAIL] {truncate(job, 120)}"


def failure_body(job, builds):
    rows = ["| # | Result | When | Duration |", "|---|---|---|---|"]
    for b in builds:
        rows.append(
            f"| #{b.get('number')} | {b.get('result') or '—'} "
            f"| {fmt_ts(b.get('timestamp'))} | {fmt_dur(b.get('duration'))} |")
    last = builds[0] if builds else {}
    n = last.get("number")
    return (
        f"## Jenkins job failing — `{job}`\n\n"
        f"Latest failing build: **#{n}** ({last.get('result') or '—'}, "
        f"{fmt_ts(last.get('timestamp'))}).\n\n"
        + "\n".join(rows)
        + "\n\n---\n*Automated by jenkins-forum-sync. Thread closes itself when the "
          "job's latest build succeeds; reopens if it fails again.*\n\n"
        f"Jenkins job: {job}\n"
    )


def overview_title(jobs):
    failing = sum(1 for j in jobs if (j.get("last_build_result") or "") in FAILING_RESULTS)
    return f"[Jenkins CI] overview — {len(jobs)} jobs, {failing} failing"


def overview_body(jobs, stats):
    jobs_by_name = {j["name"]: j for j in jobs}
    rows = ["| Job | Last build | Result | When | Pass rate | Health |",
            "|---|---|---|---|---|---|"]
    for name in sorted(jobs_by_name):
        rows.append(job_row(name, jobs_by_name, stats))
    failing = [j["name"] for j in jobs if (j.get("last_build_result") or "") in FAILING_RESULTS]
    if failing:
        headline = f"**{len(failing)} job(s) currently failing:** " + ", ".join(f"`{f}`" for f in failing)
    else:
        headline = "**All jobs green.**"
    return (
        f"## Jenkins CI overview\n\n{headline}\n\n" + "\n".join(rows)
        + "\n\n---\n*Automated by jenkins-forum-sync. Body refreshes on every sync; "
          "per-job failure threads carry the build history.*\n\n"
        f"Jenkins overview: {OVERVIEW_MARKER}\n"
    )


# ── existing threads in the forum ────────────────────────────────────
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
    if "Jenkins overview:" in body:
        for line in body.splitlines():
            if line.strip().startswith("Jenkins overview:"):
                return "overview", line.split(":", 1)[1].strip()
    if "Jenkins job:" in body:
        for line in body.splitlines():
            if line.strip().startswith("Jenkins job:"):
                return "job", line.split(":", 1)[1].strip()
    return None, None


# ── reconcile ────────────────────────────────────────────────────────
def post_comment(thread_id, body, rating=None, dry=False):
    payload = {"body": body, "postedById": USER_ID, "role": ROLE, "model": MODEL}
    if rating is not None:
        payload["statusRating"] = rating
    if dry:
        print(f"    (dry) comment on {thread_id[:8]}: {body[:70]!r}" + (f" rating={rating}" if rating is not None else ""))
        return
    http("POST", f"/api/forums/threads/{thread_id}/comments", payload)


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
    ap = argparse.ArgumentParser(description="Sync Jenkins failures into the assembly jenkins forum")
    ap.add_argument("--dry-run", action="store_true", help="report what would change, change nothing")
    ap.add_argument("--forum", default=FORUM_SLUG, help=f"forum slug (default {FORUM_SLUG})")
    ap.add_argument("--user", default=None, help="poster user UUID (default: jenkins-sync by alias)")
    args = ap.parse_args()
    FORUM_SLUG = args.forum
    USER_ID = args.user or resolve_user("jenkins-sync")

    print(f"sync: forum={FORUM_SLUG} user={USER_ID} dry={args.dry_run}")
    jobs, stats, failing_builds = fetch_state()
    failing_jobs = [j for j in jobs if (j.get("last_build_result") or "") in FAILING_RESULTS]
    print(f"state: {len(jobs)} jobs, {len(failing_jobs)} failing")

    existing = fetch_existing_threads()
    have_job = {}
    have_overview = None
    for t in existing:
        kind, marker = marker_of(t)
        if kind == "job":
            have_job[marker] = t
        elif kind == "overview":
            have_overview = t
    print(f"existing: {len(existing)} threads ({len(have_job)} job, {1 if have_overview else 0} overview)")

    created = updated = closed = reopened = skipped = 0

    # 1) per-job failure threads
    for job in failing_jobs:
        name = job["name"]
        body = failure_body(name, failing_builds.get(name, []))
        t = have_job.get(name)
        if t is None:
            create_thread(failure_title(name), body, args.dry_run)
            created += 1
        elif t.get("statusRating", 0) >= 4:
            post_comment(t["id"], "Jenkins-sync: job is failing again — reopening.", 0, args.dry_run)
            update_thread(t["id"], failure_title(name), body, args.dry_run)
            reopened += 1
        elif (t.get("body") or "").strip() != body.strip():
            update_thread(t["id"], failure_title(name), body, args.dry_run)
            updated += 1
        else:
            skipped += 1

    # 2) close threads for jobs that are green now
    for name, t in have_job.items():
        job = next((j for j in jobs if j["name"] == name), None)
        green = job is None or (job.get("last_build_result") or "") not in FAILING_RESULTS
        if green and t.get("statusRating", 0) < 4:
            post_comment(t["id"], "Jenkins-sync: latest build succeeded — closing.", 4, args.dry_run)
            closed += 1

    # 3) overview thread (never closes)
    obody = overview_body(jobs, stats)
    otitle = overview_title(jobs)
    if have_overview is None:
        create_thread(otitle, obody, args.dry_run)
        created += 1
    elif (have_overview.get("body") or "").strip() != obody.strip() or \
            have_overview.get("title") != otitle:
        update_thread(have_overview["id"], otitle, obody, args.dry_run)
        updated += 1
    else:
        skipped += 1

    print(f"result: created={created} updated={updated} closed={closed} reopened={reopened} unchanged={skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
