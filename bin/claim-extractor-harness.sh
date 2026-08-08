#!/usr/bin/env bash
# bin/claim-extractor-harness.sh — Auditor agent invocation harness
# =========================================================================
#
# Invokes the Auditor opencode agent (id: auditor) for one docklang transcript.
# Now with triage: pattern-scans discourse_units for claim indicators,
# feeds only flagged turns to the LLM.
#
# Usage
# -----
#     bin/claim-extractor-harness.sh <docklang.json>
#     bin/claim-extractor-harness.sh /home/codex/dev/tmp/losm_docklang.json
#
#     # Skip triage, feed raw file (legacy / non-docklang input):
#     bin/claim-extractor-harness.sh --raw <file>
#
# Exit codes
# ----------
#   0 — extraction completed normally
#   1 — lock contention
#   2 — opencode not found
#   3 — cycle failed (all models exhausted)
#   4 — no transcript argument provided

set -uo pipefail

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEXUS_ROOT="$(cd "$BIN_DIR/.." && pwd)"
STATE_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}/nexus-auditor"
LOCK_FILE="$STATE_DIR/auditor-harness.lock"
LOG_DIR="$NEXUS_ROOT/logs"
HARNESS_LOG="$LOG_DIR/auditor-harness.log"

# ── Config ──────────────────────────────────────────────────────────────

OPENCODE_BIN="${OPENCODE_BIN:-$(command -v opencode 2>/dev/null || echo "$HOME/.opencode/bin/opencode")}"
DEV_ROOT="$(cd "$NEXUS_ROOT/.." && pwd)"
OPENCODE_PROJECT="${OPENCODE_PROJECT:-$DEV_ROOT}"
OPENCODE_AGENT="${OPENCODE_AGENT:-auditor}"
TIMEOUT_MINUTES="${TIMEOUT_MINUTES:-20}"

TRIAGE_SCRIPT="$NEXUS_ROOT/python/voyager/src/claim_triage.py"
TRIAGE_THRESHOLD="${TRIAGE_THRESHOLD:-2}"

TACKLE_SRV_URL="${TACKLE_SRV_URL:-http://localhost:3410}"
ASSEMBLY_URL="${ASSEMBLY_URL:-http://localhost:3107}"

# ── Lock ────────────────────────────────────────────────────────────────

_acquire_lock() {
    mkdir -p "$STATE_DIR"
    touch "$LOCK_FILE"
    exec {LOCK_FD}>"$LOCK_FILE"
    if ! flock -n "$LOCK_FD" 2>/dev/null; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "unknown")
        echo "[auditor-harness] $(date '+%Y-%m-%d %H:%M:%S') [LOCK] Another run is in progress (PID $pid) — deferring"
        exit 1
    fi
    echo "$$" > "$LOCK_FILE"
}

_release_lock() {
    exec {LOCK_FD}>&- 2>/dev/null || true
    rm -f "$LOCK_FILE" 2>/dev/null || true
}

# ── Helpers ─────────────────────────────────────────────────────────────

_log() {
    local level="$1"; shift
    local line="[auditor-harness] $(date '+%Y-%m-%d %H:%M:%S') [$level] $*"
    echo "$line" >&2
    mkdir -p "$LOG_DIR" 2>/dev/null || true
    echo "$line" >> "$HARNESS_LOG" 2>/dev/null || true
}

_check_opencode() {
    if [[ ! -x "$OPENCODE_BIN" ]]; then
        _log "ERROR" "opencode not found at $OPENCODE_BIN"
        exit 2
    fi
}

opencode_model_for() {
    local id="$1"
    case "$id" in
        opencode/*)            echo "$id" ;;
        */*)                   echo "${id%%/*}/${id}" ;;
        big-pickle)            echo "opencode/big-pickle" ;;
        gemini-3.5-flash)      echo "opencode-go/gemini-3.5-flash" ;;
        *)                     echo "$id" ;;
    esac
}

resolve_models() {
    local role="$1" list="" primary="" fb_raw=""
    local data
    data=$(curl -s --max-time 10 "$TACKLE_SRV_URL/config/ai/resolve/$role" 2>/dev/null) || true
    primary=$(printf '%s' "$data" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('model_identifier') or '')" 2>/dev/null || true)
    fb_raw=$(printf '%s' "$data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for f in (d.get('fallback_models') or []):
        mid = f.get('model_identifier')
        if mid: print(mid)
except Exception:
    pass
" 2>/dev/null || true)
    _log "INFO" "tackle resolve role=$role primary=${primary:-<none>} fallbacks=[$(printf '%s' "$fb_raw" | tr '\n' ',')]"

    [[ -n "$primary" ]] && list="$primary"
    local m
    while IFS= read -r m; do
        [[ -n "$m" ]] && list="${list:+$list
}$m"
    done <<< "$fb_raw"
    if ! grep -qx 'opencode/big-pickle' <<< "$list"; then
        list="${list:+$list
}opencode/big-pickle"
    fi

    local out=""
    while IFS= read -r m; do
        [[ -n "$m" ]] || continue
        local om; om=$(opencode_model_for "$m")
        if ! grep -qx "$om" <<< "$out"; then
            out="${out:+$out
}$om"
        fi
    done <<< "$list"
    printf '%s\n' "$out"
}

resolve_agent_user_id() {
    local role="$1"
    curl -s --max-time 10 "$ASSEMBLY_URL/api/users" 2>/dev/null \
        | python3 -c "
import sys, json
try:
    users = json.load(sys.stdin)
    for u in users:
        if (u.get('name') or '').lower() == sys.argv[1].lower():
            print(u.get('id') or '')
            break
except Exception:
    pass
" "$role" 2>/dev/null || true
}

# ── Triage ──────────────────────────────────────────────────────────────

run_triage() {
    local docklang_path="$1"
    local triage_dir; triage_dir="$(dirname "$TRIAGE_SCRIPT")"

    if [[ ! -f "$TRIAGE_SCRIPT" ]]; then
        _log "WARN" "Triage script not found at $TRIAGE_SCRIPT — feeding raw file"
        return 1
    fi

    # Check if the file looks like docklang
    if ! python3 -c "import json; d=json.load(open('$docklang_path')); assert 'discourse_units' in d" 2>/dev/null; then
        _log "INFO" "Not a docklang file — feeding raw file to LLM"
        return 1
    fi

    _log "INFO" "Running docklang triage on: $docklang_path"
    local triage_output
    triage_output=$(python3 "$TRIAGE_SCRIPT" "$docklang_path" 2>&1)
    local triage_exit=$?

    if [[ $triage_exit -ne 0 ]]; then
        _log "ERROR" "Triage failed: $triage_output"
        return 1
    fi

    # Extract stats for logging
    local total_units flagged_units flagged_chars
    total_units=$(echo "$triage_output" | grep "Total units:" | grep -oP '\d+')
    flagged_units=$(echo "$triage_output" | grep "Flagged:" | grep -oP '\d+(?= units)')
    flagged_chars=$(echo "$triage_output" | grep "Flagged:" | grep -oP '[\d,]+(?= chars)')

    _log "INFO" "Triage: $flagged_units/$total_units units flagged ($flagged_chars chars)"

    if [[ "$flagged_units" -eq 0 ]]; then
        _log "INFO" "No claim indicators found — skipping extraction"
        return 2  # special code: nothing to extract
    fi

    # Generate text output for the LLM
    local flagged_text
    flagged_text=$(python3 "$TRIAGE_SCRIPT" "$docklang_path" --text 2>/dev/null)
    echo "$flagged_text" > /tmp/claim-triage-flagged.txt
    _log "INFO" "Flagged text written to /tmp/claim-triage-flagged.txt"

    return 0
}

# ── Main ────────────────────────────────────────────────────────────────

main() {
    local raw_mode=false
    local transcript_arg=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --raw) raw_mode=true; shift ;;
            *)     transcript_arg="$1"; shift ;;
        esac
    done

    if [[ -z "$transcript_arg" ]]; then
        echo "Usage: $0 [--raw] <docklang.json|transcript-path>" >&2
        exit 4
    fi

    _check_opencode
    exec {LOCK_FD}>"$LOCK_FILE"
    _acquire_lock
    trap _release_lock EXIT

    local transcript_path="$transcript_arg"
    if [[ ! -f "$transcript_arg" ]]; then
        _log "ERROR" "File not found: $transcript_arg"
        exit 4
    fi

    _log "INFO" "Starting claim extraction for: $transcript_path"
    local start_ts; start_ts=$(date +%s)

    # ── Triage (docklang mode) ──────────────────────────────────────
    local extraction_input=""
    if [[ "$raw_mode" != true ]]; then
        run_triage "$transcript_path"
        local triage_rc=$?
        if [[ $triage_rc -eq 0 ]]; then
            # Triage succeeded — feed flagged text to LLM
            extraction_input=$(cat /tmp/claim-triage-flagged.txt 2>/dev/null)
            _log "INFO" "Using triaged input ($(echo "$extraction_input" | wc -c) bytes)"
        elif [[ $triage_rc -eq 2 ]]; then
            # No claims found — exit clean
            _log "INFO" "No claims to extract. Done."
            exit 0
        fi
    fi

    # Fall back to raw file if triage didn't produce input
    if [[ -z "$extraction_input" ]]; then
        # Inline the file content so the LLM doesn't need an extra read round-trip.
        # Truncate at 100KB to avoid blowing out context on very large files.
        extraction_input=$(head -c 102400 "$transcript_path" 2>/dev/null)
        local raw_bytes; raw_bytes=$(wc -c < "$transcript_path" 2>/dev/null || echo 0)
        if [[ "$raw_bytes" -gt 102400 ]]; then
            extraction_input="${extraction_input}
\n=== NOTE: file truncated at 100KB (original was ${raw_bytes} bytes) ==="
        fi
        _log "INFO" "Using raw file input (inlined $(echo "$extraction_input" | wc -c) bytes)"
    fi

    # ── Build extraction message ────────────────────────────────────
    local extraction_msg="You are the Auditor. Extract typed claims from
the conversation below. Follow your system prompt
(nexus/docs/claim-extractor-role-prompt.md).

The text below has been pre-filtered: only turns with claim indicators
(design decisions, tradeoffs, file changes, bugs, blockers) are included.
Read each turn and extract the specific claims it contains.

=== FLAGGED TURNS ===

$extraction_input

=== END FLAGGED TURNS ===

Steps:
1. Read the flagged turns above.
2. For each turn, identify the specific claims.
3. Cross-reference: search for mentioned files, agent records, forum posts.
4. INSERT each claim into semantics.evidence_item (ON CONFLICT DO NOTHING)
   and semantics.statement_evidence.
5. Write your agent record summarizing what was extracted.
6. Post a brief summary to the Assembly change-log forum."

    # Deterministic identity
    export NEXUS_AGENT_ROLE="$OPENCODE_AGENT"
    export PGPASSWORD="${PGPASSWORD:-pgpass}"
    export PGHOST="${PGHOST:-localhost}"
    export PGUSER="${PGUSER:-pguser}"
    export PGDATABASE="${PGDATABASE:-nexus}"

    local agent_user_id; agent_user_id=$(resolve_agent_user_id "$OPENCODE_AGENT")
    if [[ -n "$agent_user_id" ]]; then
        export NEXUS_AGENT_USER_ID="$agent_user_id"
    else
        unset NEXUS_AGENT_USER_ID
        _log "WARN" "Could not resolve Assembly user UUID for role $OPENCODE_AGENT"
    fi

    extraction_msg="${extraction_msg}

Your identity (injected by harness): role=$NEXUS_AGENT_ROLE, Assembly user UUID=${NEXUS_AGENT_USER_ID:-<unresolved>}, model=\$NEXUS_AGENT_MODEL (env, set per attempt). Every Assembly post MUST include role and model in the JSON and a footer: '---\\n*Posted by auditor (model: <model>)*'."

    # ── Model chain ─────────────────────────────────────────────────
    local model_list
    if [[ -n "${MODEL_OVERRIDE:-}" ]]; then
        model_list="$MODEL_OVERRIDE"
        _log "INFO" "Model override: $MODEL_OVERRIDE"
    else
        model_list=$(resolve_models "$OPENCODE_AGENT")
    fi
    _log "INFO" "Model chain: $(printf '%s' "$model_list" | tr '\n' ' > ')"

    local exit_code=1 attempt=1 model="" last_fail=0
    while IFS= read -r model; do
        [[ -n "$model" ]] || continue
        _log "INFO" "Attempt $attempt: running with model $model (timeout=${TIMEOUT_MINUTES}m)"
        export NEXUS_AGENT_MODEL="$model"
        timeout "${TIMEOUT_MINUTES}m" "$OPENCODE_BIN" run \
            --agent "$OPENCODE_AGENT" \
            --model "$model" \
            --dir "$OPENCODE_PROJECT" \
            --format json \
            --dangerously-skip-permissions \
            "$extraction_msg" \
            </dev/null 2>&1 && { exit_code=0; break; } || last_fail=$?

        _log "WARN" "Model $model failed (exit=$last_fail) — advancing to next candidate"
        attempt=$((attempt + 1))
    done <<< "$model_list"

    local end_ts; end_ts=$(date +%s)
    local elapsed=$((end_ts - start_ts))

    if [[ "$exit_code" -eq 0 ]]; then
        _log "INFO" "Extraction completed in ${elapsed}s (model=$model, attempt=$attempt)"
    else
        _log "ERROR" "Extraction failed after $((attempt-1)) attempt(s) in ${elapsed}s"
    fi

    return $exit_code
}

main "$@"
