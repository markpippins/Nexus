#!/usr/bin/env bash
# post-change-log.sh — canonical R14 tool (consolidates 17 tmp post_* scripts)
# Posts a change summary to the Assembly change-log forum.
#
# Usage:
#   post-change-log.sh --title "Fix: X" --body "markdown summary"
#   post-change-log.sh --title "Deploy: Y" < body.md
#   post-change-log.sh -t "Quick fix" -b "Details here"
#
# Options:
#   --title, -t     Post title (required, max 500 chars — server truncates)
#   --body, -b      Post body in markdown (or read from stdin if not provided)
#   --role           Role name (default: engineer)
#   --model          Model ID (default: $NEXUS_AGENT_MODEL or "opencode/big-pickle")
#   --assembly-url   Assembly API base URL (default: http://localhost:3107)
#   -h, --help       Show this help
#
# Exit codes: 0 ok, 1 API error, 2 usage error

set -euo pipefail

# ── defaults ──────────────────────────────────────────────────────
ROLE="engineer"
MODEL="${NEXUS_AGENT_MODEL:-opencode/big-pickle}"
ASSEMBLY_URL="http://localhost:3107"
TITLE=""
BODY=""

# ── parse args ────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title|-t) TITLE="$2"; shift 2 ;;
    --body|-b)  BODY="$2"; shift 2 ;;
    --role)     ROLE="$2"; shift 2 ;;
    --model)    MODEL="$2"; shift 2 ;;
    --assembly-url) ASSEMBLY_URL="$2"; shift 2 ;;
    -h|--help)
      sed -n '4,17p' "$0"
      exit 0
      ;;
    *) echo "ERROR: unknown option: $1"; exit 2 ;;
  esac
done

# ── validate ──────────────────────────────────────────────────────
if [[ -z "$TITLE" ]]; then
  echo "ERROR: --title is required" >&2
  exit 2
fi

if [[ -z "$BODY" ]]; then
  if [[ ! -t 0 ]]; then
    BODY=$(cat)
  fi
  if [[ -z "$BODY" ]]; then
    echo "ERROR: --body is required (or pipe content via stdin)" >&2
    exit 2
  fi
fi

# ── resolve role UUID ─────────────────────────────────────────────
USERS_URL="${ASSEMBLY_URL}/api/users"
ENGINEER_UUID=$(python3 << PYEOF
import json, urllib.request
try:
    us = json.load(urllib.request.urlopen('${USERS_URL}', timeout=10))
    uid = next((u['id'] for u in us if u.get('name','').lower() == '${ROLE}'), '')
    print(uid)
except Exception:
    pass
PYEOF
)

if [[ -z "$ENGINEER_UUID" ]]; then
  echo "ERROR: could not resolve ${ROLE} user UUID from ${USERS_URL}" >&2
  exit 1
fi

# ── post ──────────────────────────────────────────────────────────
POST_URL="${ASSEMBLY_URL}/api/forums/change-log/threads"
RESP=$(python3 << PYEOF
import json, urllib.request, sys
payload = {
    'title': """${TITLE}""",
    'body': """${BODY}""",
    'postedById': '${ENGINEER_UUID}',
    'role': '${ROLE}',
    'model': '${MODEL}',
}
req = urllib.request.Request(
    '${POST_URL}',
    data=json.dumps(payload).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST',
)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        parsed = json.loads(resp.read().decode())
        print(f'OK {resp.status} thread={parsed.get("id","")}')
except urllib.error.HTTPError as e:
    print(f'ERROR HTTP {e.code}: {e.read().decode()[:300]}', file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
PYEOF
)

echo "$RESP"
if echo "$RESP" | grep -q "^ERROR"; then
  exit 1
fi
exit 0
