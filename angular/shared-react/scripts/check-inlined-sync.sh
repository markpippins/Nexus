#!/usr/bin/env bash
# Sync check: verify the inlined `src/utils` copies inside tackle-ui,
# conduit-ui, and wind-ui still match the @nexus/shared-react reference
# implementation AND that each UI still typechecks (tsc --noEmit). The inlined
# copies carry an extra header comment, so leading comment/blank lines are
# stripped from both sides before diffing.
#
# Usage:
#   bash scripts/check-inlined-sync.sh                        # full check (drift + typecheck)
#   bash scripts/check-inlined-sync.sh --range BASE..LOCAL    # range-gated check
#   npm run check:inline -- --range HEAD~1..HEAD              # via npm (CI)
#
# --range: applies the same range gate as the pre-push hook — only runs the
# (slow) full check when the commit range BASE..LOCAL touches the shared utils,
# an inlined copy, the check script, or the hook. If the range touches none of
# those, it skips fast and exits 0. An unresolvable range (bad SHA, no git repo)
# runs the full check conservatively.
#
# Exit 0 = copies in sync AND all UIs typecheck (or --range touched nothing);
# 1 = drift, missing copy, or typecheck failure; 2 = usage error.
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}" )" && pwd)"
REF_DIR="$HERE/../utils"          # shared-react/utils (reference implementation)
APPS_DIR="$HERE/../.."            # nexus/angular

UTILS="network-errors response"
APPS="tackle-ui conduit-ui wind-ui"

# Range gate — must stay identical to WATCH_RE in nexus/.githooks/pre-push.
# Paths that, when touched by a pushed commit, require the full check:
#   - the reference implementation, its check script, and npm wiring
#   - the inlined copies in the three UIs
#   - the hook itself
WATCH_RE='^(angular/shared-react/(utils/|scripts/|package\.json)|angular/(tackle-ui|conduit-ui|wind-ui)/src/utils/|\.githooks/pre-push)'

# --- Argument parsing -----------------------------------------------------
RANGE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --range)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: --range requires BASE..LOCAL" >&2
        exit 2
      fi
      RANGE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--range BASE..LOCAL]"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      echo "Usage: $0 [--range BASE..LOCAL]" >&2
      exit 2
      ;;
  esac
done

# --- Optional range gate --------------------------------------------------
if [ -n "$RANGE" ]; then
  case "$RANGE" in
    *..*..*)
      # More than one '..' (e.g. A..B..C) would silently split to A..C and
      # could skip a range that touches watch paths — reject it loudly.
      echo "ERROR: --range must contain exactly one '..' (got: $RANGE)" >&2
      exit 2
      ;;
    *..*)
      base="${RANGE%%..*}"
      local_sha="${RANGE##*..}"
      ;;
    *)
      echo "ERROR: --range must be BASE..LOCAL (got: $RANGE)" >&2
      exit 2
      ;;
  esac

  root="$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -z "$root" ]; then
    echo "NOTE: cannot resolve git repo root from $HERE — running full check" >&2
  elif ! changed="$(git -C "$root" diff --name-only --no-renames "$base" "$local_sha" 2>/dev/null)"; then
    echo "NOTE: cannot resolve range $RANGE — running full check" >&2
  else
    if printf '%s\n' "$changed" | grep -qE "$WATCH_RE"; then
      echo "NOTE: range $RANGE touches shared utils — running full check" >&2
    else
      echo "OK: range $RANGE touches no shared-utils or inlined-copy paths — skipping full check"
      exit 0
    fi
  fi
fi

# --- Phase 1: header-aware drift diff -------------------------------------
strip_header() {
  awk '
    BEGIN { in_code = 0 }
    {
      if (!in_code) {
        if ($0 ~ /^[[:space:]]*\/\//) next;   # skip leading // comments
        if ($0 ~ /^[[:space:]]*$/) next;      # skip leading blank lines
        in_code = 1;
      }
      print;
    }
  ' "$1"
}

fail=0
for util in $UTILS; do
  ref="$REF_DIR/$util.ts"
  if [ ! -f "$ref" ]; then
    echo "ERROR: reference missing: $ref"
    fail=1
    continue
  fi
  for app in $APPS; do
    copy="$APPS_DIR/$app/src/utils/$util.ts"
    if [ ! -f "$copy" ]; then
      echo "MISSING: $app/src/utils/$util.ts (expected inlined copy)"
      fail=1
      continue
    fi
    if out="$(diff <(strip_header "$ref") <(strip_header "$copy") 2>&1)"; then
      echo "OK: $app/src/utils/$util.ts matches reference"
    else
      echo "DRIFT: $app/src/utils/$util.ts differs from shared-react/utils/$util.ts"
      echo "$out" | head -20
      fail=1
    fi
  done
done

# --- Phase 2: typecheck ----------------------------------------------------
typecheck_apps() {
  local fail=0
  for app in $APPS; do
    local appdir="$APPS_DIR/$app"
    if [ ! -d "$appdir" ]; then
      echo "MISSING: $appdir (cannot typecheck)"
      fail=1
      continue
    fi
    if ! command -v npx >/dev/null 2>&1; then
      echo "NOTE: npx unavailable — skipping typecheck for $app"
      continue
    fi
    local out
    if ! out="$(cd "$appdir" && npx tsc --noEmit 2>&1)"; then
      echo "TYPECHECK FAIL: $app (tsc --noEmit)"
      printf '%s\n' "$out" | head -20
      fail=1
    else
      echo "OK: $app typechecks"
    fi
  done
  return $fail
}

echo
typecheck_apps
typecheck_fail=$?

echo
if [ "$fail" -eq 0 ] && [ "$typecheck_fail" -eq 0 ]; then
  echo "All inlined copies are in sync with @nexus/shared-react and all UIs typecheck."
  exit 0
fi
echo "Sync-check issues detected — fix the items above, then re-run."
exit 1
