#!/usr/bin/env bash
# verify-prepush.sh — canonical prepush verification (consolidates 7 verify_* variants)
# Runs the range-aware pre-push hook test suite.
#
# Usage:
#   verify-prepush.sh                  # default: basic gate check
#   verify-prepush.sh --range HEAD~1..HEAD  # test with specific range
#   verify-prepush.sh --full           # full test suite (all skip paths + edge cases)
#   verify-prepush.sh --trackref       # track reference comparison test
#   verify-prepush.sh --skip           # verify skip-path behaviour only
#
# Options:
#   --range REF       Test with a specific git range
#   --full            Run full test suite (all skip paths, edge cases, bogus refs)
#   --skip            Verify skip paths only (fast, ~5s)
#   --trackref        Run track-ref comparison
#   --hook PATH       Path to pre-push hook (default: .githooks/pre-push)
#   -h, --help        Show this help
#
# Exit codes: 0 all passed, 1 test failure, 2 usage error

set -euo pipefail

cd /home/codex/dev/nexus || exit 1

HOOK=".githooks/pre-push"
ZERO="0000000000000000000000000000000000000000"
MODE="gate"
RANGE=""
FAILURES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --range)    RANGE="$2"; shift 2 ;;
    --full)     MODE="full"; shift ;;
    --skip)     MODE="skip"; shift ;;
    --trackref) MODE="trackref"; shift ;;
    --hook)     HOOK="$2"; shift 2 ;;
    -h|--help)  sed -n '4,21p' "$0"; exit 0 ;;
    *) echo "ERROR: unknown option: $1"; exit 2 ;;
  esac
done

HEAD=$(git rev-parse HEAD)
[[ -x "$HOOK" ]] || { echo "ERROR: $HOOK not executable"; exit 1; }

run_test() {
  local label="$1"
  echo "--- $label ---"
  if eval "$2"; then
    echo "PASS: $label"
  else
    echo "FAIL: $label (exit=$?)"
    FAILURES=$((FAILURES + 1))
  fi
  echo
}

# ── always run syntax check ───────────────────────────────────────
run_test "syntax" "bash -n '$HOOK'"

# ── skip tests ────────────────────────────────────────────────────
run_test "empty stdin" "bash '$HOOK' </dev/null"
run_test "same-sha" "printf 'refs/heads/main %s refs/heads/main %s\\n' '$HEAD' '$HEAD' | bash '$HOOK'"
run_test "delete ref" "printf 'refs/heads/main %s refs/heads/main %s\\n' '$ZERO' '$HEAD' | bash '$HOOK'"

if [[ "$MODE" == "skip" ]]; then
  echo "Total failures: $FAILURES"
  exit $FAILURES
fi

# ── real range test ───────────────────────────────────────────────
if [[ -n "$RANGE" ]]; then
  BASE=$(echo "$RANGE" | cut -d. -f1)
  LOCAL=$(echo "$RANGE" | rev | cut -d. -f1 | rev)
  run_test "range=$RANGE" "printf 'refs/heads/dev %s refs/heads/dev %s\\n' '$LOCAL' '$BASE' | bash '$HOOK'"
else
  PREV=$(git rev-parse HEAD~1 2>/dev/null || echo "$HEAD")
  run_test "HEAD~1..HEAD" "printf 'refs/heads/dev %s refs/heads/dev %s\\n' '$HEAD' '$PREV' | bash '$HOOK'"
fi

if [[ "$MODE" == "full" || "$MODE" == "trackref" ]]; then
  run_test "bogus remote" "printf 'refs/heads/dev %s refs/heads/dev deadbeef\\n' '$HEAD' | bash '$HOOK'"
  run_test "new branch no tracking" "printf 'refs/heads/feature %s refs/heads/feature %s\\n' '$HEAD' '$ZERO' | bash '$HOOK'"
fi

echo "Total failures: $FAILURES"
exit $FAILURES
