#!/usr/bin/env bash
# post-inbox-update.sh — canonical R17 tool (inbox pointer update)
# Advances the stored inbox pointer for a role to the given timestamp.
#
# Usage:
#   post-inbox-update.sh --role engineer --timestamp "2026-08-09T00:00:00Z"
#   post-inbox-update.sh -r architect --now             (set to current time)
#
# Options:
#   --role, -r       Role name (required)
#   --timestamp, -t   ISO 8601 timestamp to set pointer to (required unless --now)
#   --now             Set pointer to current UTC time
#   --nebula-url      Nebula API base URL (default: http://localhost:3101)
#   -h, --help        Show this help
#
# Exit codes: 0 ok, 1 API error, 2 usage error

set -euo pipefail

# ── defaults ──────────────────────────────────────────────────────
ROLE=""
TIMESTAMP=""
NEBULA_URL="http://localhost:3101"
USE_NOW=false

# ── parse args ────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --role|-r)        ROLE="$2"; shift 2 ;;
    --timestamp|-t)   TIMESTAMP="$2"; shift 2 ;;
    --now)            USE_NOW=true; shift ;;
    --nebula-url)     NEBULA_URL="$2"; shift 2 ;;
    -h|--help)
      sed -n '4,17p' "$0"
      exit 0
      ;;
    *) echo "ERROR: unknown option: $1"; exit 2 ;;
  esac
done

# ── validate ──────────────────────────────────────────────────────
if [[ -z "$ROLE" ]]; then
  echo "ERROR: --role is required" >&2
  exit 2
fi

if $USE_NOW; then
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
elif [[ -z "$TIMESTAMP" ]]; then
  echo "ERROR: --timestamp or --now is required" >&2
  exit 2
fi

# ── update pointer ────────────────────────────────────────────────
POINTER_URL="${NEBULA_URL}/api/inbox-pointer/${ROLE}"

RESP=$(python3 << PYEOF
import json, urllib.request, sys
ts = '${TIMESTAMP}'
payload = {'timestamp': ts}
req = urllib.request.Request(
    '${POINTER_URL}',
    data=json.dumps(payload).encode(),
    headers={'Content-Type': 'application/json'},
    method='PUT',
)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(f'OK {resp.status} pointer={ts}')
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
