"""absorb CLI — discover | run | status | reprocess."""

from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

from .core import pg_fetchall, source_rel_path
from . import events as ev
from .errors import AbsorbError
from . import discovery, runner

REPO_ROOT = Path(__file__).resolve().parents[3]  # nexus/python/absorb/absorb/cli.py -> repo root


def cmd_discover(args) -> int:
    prof = runner.load_profile(args.profile)
    res = discovery.discover(prof.get("sources") or [], REPO_ROOT)
    print(f"{len(res['files'])} source file(s)")
    for w in res["warnings"]:
        print(f"  WARN {w['code']}: {w['message']}")
    if args.verbose:
        for f in res["files"]:
            print(f"  {f['path']}")
    return 0


def cmd_run(args) -> int:
    prof = runner.load_profile(args.profile)
    if args.dry_run:
        print("[dry-run] no stores will be written")
    else:
        # Register profile + expand/log default policies before any run.
        runner.register_profile(prof)
        warnings = runner.enforce_green_field(prof, args.assume_empty_target)
        for w in warnings:
            print(f"  WARN {w}: green-field override used (audited)")

    res = discovery.discover(prof.get("sources") or [], REPO_ROOT)
    files = res["files"]

    pid = prof["id"]
    ver = int(prof.get("version", 1))

    batch_id = str(uuid.uuid4())
    runner.BATCH.clear()
    if not args.dry_run:
        runner.BATCH.update({"id": batch_id})
    started_event_id = None

    if not args.reprocess_flag:
        # Watermark filtering is ALWAYS-ON (spec C3): a no-limit resume must
        # never reprocess the corpus. --reprocess-flag bypasses deliberately.
        from .core import fingerprint_path
        seen = runner.watermarks_for(pid, ver)
        pending = []
        for f in files:
            rel = source_rel_path(f["path"], REPO_ROOT)
            st = Path(f["path"]).stat()
            fp = fingerprint_path(rel, st.st_mtime_ns, st.st_size)
            if fp not in seen:
                pending.append(f)
        skipped_n = len(files) - len(pending)
        if skipped_n:
            print(f"watermarks: {skipped_n} file(s) already processed at v{ver} "
                  "(use `absorb reprocess` or --reprocess-flag to override)")
        files = pending
    if args.limit:
        # cap the batch AFTER watermark filtering so N = new documents processed
        files = files[: args.limit]

    if not args.dry_run and files:
        started_event_id = ev.emit_run_started(batch_id, prof["id"], ver, len(files))
        runner.BATCH["started_event_id"] = started_event_id

    results = []
    for f in files:
        f["_batch_warnings"] = res["warnings"]
        status, summary = runner.process_document(
            prof, f, REPO_ROOT,
            dry_run=args.dry_run, assume_empty_target=args.assume_empty_target,
            force=args.reprocess_flag)
        results.append((status, summary))
        mark = "✓" if status == "done" else "✗"
        extra = f" — {summary.get('error')}" if status != "done" else ""
        print(f"  {mark} {Path(summary['document']).name} "
              f"[turns={summary.get('turns')} segs={summary.get('segments')}]{extra}")

    print(runner.render_summary(results))
    failed = sum(1 for s, _ in results if s != "done")

    if not args.dry_run and files:
        counts = {"done": len(results) - failed, "failed": failed}
        warnings = [w for _, r in results for w in r.get("warnings", [])]
        policy_skips = [sk for _, r in results for sk in r.get("skipped", [])]
        ev.emit_run_completed(batch_id, counts, warnings, policy_skips,
                              causation_id=started_event_id)
        runner.BATCH.clear()

    return 1 if failed else 0


def cmd_status(args) -> int:
    rows = pg_fetchall(
        """SELECT r.id::text, r.profile_id, r.profile_ver, r.status, r.dry_run,
                  r.summary->>'document' AS document,
                  r.summary->>'error' AS error
           FROM absorb.runs r ORDER BY r.created_at DESC LIMIT %s""",
        (args.limit,))
    print(f"last {len(rows)} runs:")
    for r in rows:
        flag = " [dry]" if r["dry_run"] else ""
        err = f" — {r['error']}" if r["error"] else ""
        print(f"  {r['status']:>6}{flag}  {r['profile_id']}@v{r['profile_ver']}  "
              f"{(r['document'] or '?')[:52]}{err}")
    steps = pg_fetchall(
        """SELECT step_type, status, count(*)::int AS n FROM absorb.run_steps
           GROUP BY step_type, status ORDER BY step_type, status""")
    if steps:
        print("step states:")
        for s in steps:
            print(f"  {s['step_type']:>18} {s['status']:>8} x{s['n']}")
    return 0


def cmd_reprocess(args) -> int:
    runner.reprocess(args.profile)
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="absorb", description="absorb universal ingest (spec v0.2)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("discover", help="scan sources for a profile")
    d.add_argument("profile")
    d.add_argument("-v", "--verbose", action="store_true")

    r = sub.add_parser("run", help="run a profile end-to-end")
    r.add_argument("profile")
    r.add_argument("--limit", type=int, default=None)
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--assume-empty-target", action="store_true",
                   help="green-field guard override (audited)")
    r.add_argument("--reprocess-flag", action="store_true",
                   help="ignore watermarks for this invocation")

    s = sub.add_parser("status", help="recent runs + step states")
    s.add_argument("--limit", type=int, default=10)

    p = sub.add_parser("reprocess", help="clear watermarks for a profile version")
    p.add_argument("profile")

    args = ap.parse_args(argv)
    try:
        return {"discover": cmd_discover, "run": cmd_run,
                "status": cmd_status, "reprocess": cmd_reprocess}[args.cmd](args)
    except AbsorbError as e:
        print(f"ABSORB ERROR [{e.error_code}] ({e.error_class}, retryable={e.retryable}): "
              f"{e.message}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
