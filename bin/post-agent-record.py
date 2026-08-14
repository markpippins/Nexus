#!/usr/bin/env python3
"""post-agent-record.py — canonical R1/R2/R11 tool (consolidates 17 tmp post_* scripts)
Writes an agent record via the nebula REST API.

Usage:
  post-agent-record.py --role engineer --title "Summary" --content "markdown"
  post-agent-record.py -r architect -t "Decision" -c "Details" --tags to:engineer,status:open
  echo "body content" | post-agent-record.py -r engineer -t "Log entry"

Options:
  --role, -r         Role name (required: architect|engineer|planner|reviewer|analyst|inspector|critic)
  --title, -t        Record title (required)
  --content, -c      Record body in markdown (or read from stdin if not provided)
  --tags             Comma-separated tags (e.g. "to:architect,type:status-update")
  --record-type      Record type (default: engineering_log)
                     One of: report, analysis, assessment, inspection, prompt,
                             response, engineering_log, architecture_note, decision
  --level            Knowledge level (default: 3)
                     1=raw/operational, 2=structured, 3=planning/architectural, 4=meta
  --visibility       Visibility scope (default: architect)
  --model            AI model identifier for per-model attribution (optional)
  --nebula-url       Nebula API base URL (default: http://localhost:3101)
  -h, --help         Show this help

Exit codes: 0 ok, 1 API error, 2 usage error
"""

import argparse
import json
import sys
import urllib.request
import urllib.error


def parse_args():
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument("--role", "-r", required=True)
    p.add_argument("--title", "-t", required=True)
    p.add_argument("--content", "-c", default=None)
    p.add_argument("--tags", default="")
    p.add_argument("--record-type", default="engineering_log")
    p.add_argument("--level", type=int, default=3)
    p.add_argument("--visibility", default="architect")
    p.add_argument("--model", default=None)
    p.add_argument("--nebula-url", default="http://localhost:3101")
    p.add_argument("-h", "--help", action="store_true")
    return p.parse_args()


def main():
    args = parse_args()

    if args.help:
        print(__doc__)
        sys.exit(0)

    # Validate role
    valid_roles = {"architect", "engineer", "planner", "reviewer", "analyst", "inspector", "critic"}
    if args.role not in valid_roles:
        print(f"ERROR: role must be one of: {', '.join(sorted(valid_roles))}", file=sys.stderr)
        sys.exit(2)

    # Resolve content from arg or stdin
    content = args.content
    if content is None:
        if not sys.stdin.isatty():
            content = sys.stdin.read()
        if not content:
            print("ERROR: --content is required (or pipe via stdin)", file=sys.stderr)
            sys.exit(2)

    # Parse tags
    tag_list = [t.strip() for t in args.tags.split(",") if t.strip()]

    payload = {
        "recordType": args.record_type,
        "role": args.role,
        "title": args.title,
        "content": content,
        "tags": tag_list,
        "level": args.level,
        "visibilityScope": args.visibility,
        "model": args.model,
    }

    url = f"{args.nebula_url}/api/agent-records"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode()
            parsed = json.loads(body)
            rid = parsed.get("id") or parsed.get("recordId") or ""
            print(f"OK {resp.status} record_id={rid}")
    except urllib.error.HTTPError as e:
        print(f"ERROR HTTP {e.code}: {e.read().decode()[:400]}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
