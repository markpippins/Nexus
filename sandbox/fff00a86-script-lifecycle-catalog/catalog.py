#!/usr/bin/env python3
"""script-lifecycle-catalog — sandbox v0 scaffold (candidate fff00a86).

Self-contained: stdlib only, zero mainline imports (ruling c26ca340).
v0 scope: scan a directory, classify scripts by heuristic, emit a table.
"""
import argparse
import datetime
import json
import os
import re
import sys

CLASSIFICATIONS = ("recurring-job", "ui-capability", "historical-artifact")

JOB_HINTS = re.compile(r"(cron|job|timer|schedule|batch)", re.I)
UI_HINTS = re.compile(r"(server|flask|fastapi|express|\.tsx?$|app\.py$)", re.I)
SCRIPT_EXTS = {".py", ".sh", ".js", ".ts", ".ps1", ".bash"}


def classify(path):
    name = os.path.basename(path)
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            head = fh.read(4096)
    except OSError:
        return "historical-artifact"
    if JOB_HINTS.search(name) or JOB_HINTS.search(head):
        return "recurring-job"
    if UI_HINTS.search(name) or UI_HINTS.search(head):
        return "ui-capability"
    age_days = age_in_days(path)
    if age_days is not None and age_days > 90:
        return "historical-artifact"
    return "historical-artifact"  # default: unproven scripts are history candidates


def age_in_days(path):
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return None
    return (datetime.datetime.now() - datetime.datetime.fromtimestamp(mtime)).days


def scan(root):
    rows = []
    for dirpath, _dirs, files in os.walk(root):
        for f in files:
            if os.path.splitext(f)[1].lower() in SCRIPT_EXTS:
                p = os.path.join(dirpath, f)
                rows.append({
                    "path": os.path.relpath(p, root),
                    "classification": classify(p),
                    "age_days": age_in_days(p),
                })
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(prog="catalog.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_scan = sub.add_parser("scan")
    p_scan.add_argument("dir")
    args = ap.parse_args(argv)

    rows = scan(args.dir)
    for r in sorted(rows, key=lambda r: r["classification"]):
        print(f"{r['classification']:20s} {str(r['age_days'] or '?'):>5s}d  {r['path']}")
    print(f"\n{len(rows)} script(s) classified", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
